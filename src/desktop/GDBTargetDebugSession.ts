/*********************************************************************
 * Copyright (c) 2019 Kichwa Coders and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { GDBDebugSession } from './GDBDebugSession';
import { OutputEvent, TerminatedEvent } from '@vscode/debugadapter';
import { logger, LogLevel } from '@vscode/debugadapter/lib/logger';
import * as mi from '../mi';
import * as os from 'os';
import { DebugProtocol } from '@vscode/debugprotocol';
import { SerialPort, ReadlineParser } from 'serialport';
import { Socket } from 'net';
import {
    TargetLaunchRequestArguments,
    TargetAttachRequestArguments,
    UARTArguments,
} from '../types/session';
import {
    IGDBBackend,
    IGDBBackendFactory,
    IGDBServerFactory,
    IGDBServerProcessManager,
    IStdioProcess,
} from '../types/gdb';
import { GDBBackendFactory } from './factories/GDBBackendFactory';
import { GDBServerFactory } from './factories/GDBServerFactory';
import { isProcessActive } from '../util/processes';
import { GDBCommandCancelled } from '../gdb/errors';

// State of the Remote Target Debug Session
enum SessionState {
    /** Session & Connection not started */
    INACTIVE,
    /** GDB Server process launched */
    GDBSERVER_LAUNCHED,
    /** GDB Server process ready to accept TCP/IP connections */
    GDBSERVER_READY,
    /** GDB launched, modes set */
    GDB_LAUNCHED,
    /** GDB fully set up and read to connect to server */
    GDB_READY,
    /** GDB connected to GDB server */
    CONNECTED,
    /** GDB session ready for user interaction */
    SESSION_READY,
    /** GDB session is exiting */
    EXITING,
    /** GDB session has exited and is no longer responding */
    EXITED,
    /** Terminated event has been sent, don't expect DAP client to respond  */
    TERMINATED,
}

// Internal request to exit session,
// for example if an involved process
// unexpectedly ends
enum ExitSessionRequest {
    /** No exit requested */
    NONE,
    /** Shutdown GDB and GDB server.
     *  Use of TerminateEvent depends on session state.
     */
    EXIT,
}

// Complete Session Info
interface SessionInfo {
    state: SessionState;
    exitRequest: ExitSessionRequest;
    disconnectError?: string;
}

type PromiseFunction = (...args: any[]) => Promise<any>;

const AuxiliaryConnectCommands = [
    'set mem inaccessible-by-default off',
    'set stack-cache off',
    'set remote interrupt-on-connect off',
];

export class GDBTargetDebugSession extends GDBDebugSession {
    protected gdbserver?: IStdioProcess;
    protected gdbserverFactory?: IGDBServerFactory;
    protected gdbserverProcessManager?: IGDBServerProcessManager;
    // Capture if gdbserver was launched for correct disconnect behavior
    protected launchGdbServer = false;
    protected watchGdbServer = true;
    protected killGdbServer = true;
    protected serverDisconnectTimeout = 1000;
    protected sessionInfo: SessionInfo = {
        state: SessionState.INACTIVE,
        exitRequest: ExitSessionRequest.NONE,
    };

    // Serial Port to capture UART output across the serial line
    protected serialPort?: SerialPort;
    // Socket to listen on a TCP port to capture UART output
    protected socket?: Socket;

    /**
     * Define the target type here such that we can run the "disconnect"
     * command when servicing the disconnect request if the target type
     * is remote.
     */
    protected targetType?: string;

    constructor(
        backendFactory?: IGDBBackendFactory,
        gdbserverFactory?: IGDBServerFactory
    ) {
        super(backendFactory || new GDBBackendFactory());
        this.gdbserverFactory = gdbserverFactory || new GDBServerFactory();
        this.logger = logger;
        this.isRemote = true;
    }

    protected logGDBRemote(message: string, level = LogLevel.Verbose) {
        this.logger.log('GDB Remote session: ' + message, level);
    }

    protected async setSessionState(state: SessionState) {
        const oldState = SessionState[this.sessionInfo.state];
        const newState = SessionState[state];
        this.logGDBRemote(`State '${oldState}' => '${newState}'`);
        if (state < this.sessionInfo.state && state < SessionState.EXITING) {
            // Potentially a late process arrival
            await this.setExitSessionRequest(ExitSessionRequest.EXIT);
        }
        this.sessionInfo.state = state;
    }

    protected async setExitSessionRequest(request: ExitSessionRequest) {
        const acceptRequest = request > this.sessionInfo.exitRequest;
        this.logGDBRemote(
            `exit request ${
                acceptRequest ? '' : 'ignored, already in progress'
            }`
        );
        this.sessionInfo.exitRequest = request;
        if (!acceptRequest || this.sessionInfo.state >= SessionState.EXITED) {
            // Nothing to left to do
            return;
        }
        // Handle exit request based on current state
        if (request === ExitSessionRequest.EXIT) {
            const shouldSendTerminateEvent =
                this.sessionInfo.state >= SessionState.SESSION_READY;
            await this.doDisconnectRequest(
                this.serverDisconnectTimeout,
                shouldSendTerminateEvent
            );
        }
    }

    protected createAuxBackendArgs(
        args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ): TargetAttachRequestArguments {
        return {
            ...args,
            target: {
                type: 'remote',
                connectCommands: [
                    ...AuxiliaryConnectCommands,
                    `target remote ${args.target?.port ?? '2331'}`,
                ],
            },
            // Clear fields only relevant to main connection
            openGdbConsole: undefined,
            preConnectCommands: undefined,
            initCommands: undefined,
        };
    }

    /**
     * Checks if debug adapter is connected and ready to process debug requests
     * driven by user interaction or other extensions.
     *
     * @return true if standard debug operation requests can be processed, false
     * otherwise.
     */
    protected canRequestProceed(): boolean {
        if (this.sessionInfo.state !== SessionState.SESSION_READY) {
            return false;
        }
        return super.canRequestProceed();
    }

    /**
     * Checks if an error would bring extra value to the user and if it
     * should be reported in the debug adapter protocol response.
     * Note: Call base class implementation last and after any explicit
     * return of value 'true'.
     * @param error The error to check.
     * @return true if the error should be reported as a debug adapter protocol
     * error response, false otherwise.
     */
    protected shouldReportError(error: unknown): boolean {
        // GDBCommandCancelled occurrences for any GDB backend.
        if (
            error instanceof GDBCommandCancelled &&
            this.sessionInfo.state >= SessionState.EXITING
        ) {
            // Exiting session, cancelling commands is expected for a graceful shutdown.
            return false;
        }
        return super.shouldReportError(error);
    }

    /**
     * Validate the launch/attach request arguments and throw if they contain
     * an invalid combination.
     * @param args the request arguments to validate.
     */
    protected validateRequestArguments(
        args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ) {
        super.validateRequestArguments(args);
        if (args.auxiliaryGdb) {
            // Limitations for auxiliary GDB mode
            if (args.gdbNonStop) {
                throw new Error(
                    "Cannot use setting 'auxiliaryGdb' with 'gdbNonStop' mode"
                );
            }
            if (args.gdbAsync === false) {
                throw new Error(
                    "Setting 'auxiliaryGdb' mode requires 'gdbAsync' to be active"
                );
            }
        }
        if (args.customResetCommands?.length && args.gdbAsync === false) {
            throw new Error(
                "Setting 'customResetCommands' requires 'gdbAsync' to be active"
            );
        }
    }

    protected override async setupCommonLoggerAndBackends(
        args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ) {
        await super.setupCommonLoggerAndBackends(args);
        if (args.auxiliaryGdb) {
            await super.setupCommonLoggerAndBackends(
                this.createAuxBackendArgs(args),
                true
            );
        }

        this.gdbserverProcessManager =
            await this.gdbserverFactory?.createGDBServerManager(args);
    }

    protected async attachOrLaunchRequest(
        response: DebugProtocol.Response,
        request: 'launch' | 'attach',
        args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ) {
        this.validateRequestArguments(args);
        await this.setupCommonLoggerAndBackends(args);
        this.initializeSessionArguments(args);

        this.isAttach = true;
        if (request === 'launch') {
            if (args.target?.type !== 'extended-remote') {
                const launchArgs = args as TargetLaunchRequestArguments;
                await this.startGDBServer(launchArgs);
            } else
                this.isAttach = false;
        }
        await this.startGDBAndConnectToGDBSERVER(response, args);
    }

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: TargetLaunchRequestArguments
    ): Promise<void> {
        try {
            const [request, resolvedArgs] = this.applyRequestArguments(
                'launch',
                args
            );
            await this.attachOrLaunchRequest(response, request, resolvedArgs);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async attachRequest(
        response: DebugProtocol.AttachResponse,
        args: TargetAttachRequestArguments
    ): Promise<void> {
        try {
            const [request, resolvedArgs] = this.applyRequestArguments(
                'attach',
                args
            );
            await this.attachOrLaunchRequest(response, request, resolvedArgs);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async startGDBServer(
        args: TargetLaunchRequestArguments
    ): Promise<void> {
        if (args.target === undefined) {
            args.target = {};
        }
        const target = args.target;

        this.launchGdbServer = true;
        this.watchGdbServer = target.watchServerProcess ?? true;
        this.killGdbServer = target.automaticallyKillServer !== false;
        this.serverDisconnectTimeout =
            target.serverDisconnectTimeout !== undefined &&
            target.serverDisconnectTimeout >= 0
                ? target.serverDisconnectTimeout
                : 1000;

        // Initialize and start GDB server
        if (!this.gdbserverProcessManager) {
            throw new Error('GDBServer process manager is not initialised!');
        }
        this.gdbserver = await this.gdbserverProcessManager.start(args);
        this.logGDBRemote(
            `Spawned GDB Server (PID ${this.gdbserver.getPID()})`
        );
        await this.setSessionState(SessionState.GDBSERVER_LAUNCHED);

        let resolveStartup: () => void;
        let rejectStartup: (reason: any) => void;
        const startupPromise = new Promise<void>((resolve, reject) => {
            resolveStartup = resolve;
            rejectStartup = reject;
        });

        let gdbserverStartupResolved = false; // GDB Server ready for connection
        let accumulatedStdout = '';
        let accumulatedStderr = '';
        let checkTargetPort = (_data: any) => {
            // do nothing by default
        };
        if (target.port && target.serverParameters) {
            setTimeout(
                () => {
                    gdbserverStartupResolved = true;
                    resolveStartup();
                },
                target.serverStartupDelay !== undefined
                    ? target.serverStartupDelay
                    : 0
            );
        } else {
            const timeoutForFindingPort = setTimeout(() => {
                rejectStartup(
                    'Error: Cannot connect, port number not specified or regex is incorrect'
                );
            }, target.portDetectionTimeout ?? 10000);
            checkTargetPort = (data: any) => {
                const regex = new RegExp(
                    target.serverPortRegExp
                        ? target.serverPortRegExp
                        : 'Listening on port ([0-9]+)\r?\n'
                );
                const m = regex.exec(data);
                if (m !== null) {
                    clearTimeout(timeoutForFindingPort);
                    target.port = m[1];
                    checkTargetPort = (_data: any) => {
                        // do nothing now that we have our port
                    };
                    setTimeout(
                        () => {
                            gdbserverStartupResolved = true;
                            resolveStartup();
                        },
                        target.serverStartupDelay !== undefined
                            ? target.serverStartupDelay
                            : 0
                    );
                }
            };
        }
        await this.setSessionState(SessionState.GDBSERVER_READY);
        if (this.gdbserver.stdout) {
            this.gdbserver.stdout.on('data', (data) => {
                const out = data.toString();
                if (!gdbserverStartupResolved) {
                    accumulatedStdout += out;
                }
                this.sendEvent(new OutputEvent(out, 'server'));
                checkTargetPort(accumulatedStdout);
            });
        } else {
            throw new Error('Missing stdout in spawned gdbserver');
        }

        if (this.gdbserver.stderr) {
            this.gdbserver.stderr.on('data', (data) => {
                const err = data.toString();
                if (!gdbserverStartupResolved) {
                    accumulatedStderr += err;
                }
                this.sendEvent(new OutputEvent(err, 'server'));
                checkTargetPort(accumulatedStderr);
            });
        } else {
            throw new Error('Missing stderr in spawned gdbserver');
        }

        this.gdbserver.on('exit', async (code, signal) => {
            const exitmsg =
                code === null
                    ? `gdbserver killed by signal ${signal}\n`
                    : `gdbserver exited with code ${code}\n`;
            this.sendEvent(new OutputEvent(exitmsg, 'server'));
            if (!gdbserverStartupResolved) {
                this.logGDBRemote('GDB server exited before ready');
                gdbserverStartupResolved = true;
                rejectStartup(new Error(exitmsg + '\n' + accumulatedStderr));
            }
            if (
                this.sessionInfo.state < SessionState.EXITING &&
                !this.sessionInfo.disconnectError &&
                code !== 0
            ) {
                this.sessionInfo.disconnectError =
                    'GDB server exited unexpectedly, see Debug Console for more info';
            }
            if (this.watchGdbServer) {
                this.logGDBRemote('GDB server exited, exiting session');
                await this.setExitSessionRequest(ExitSessionRequest.EXIT);
            }
        });

        this.gdbserver.on('error', (err) => {
            const errmsg = `gdbserver has hit error ${err}\n`;
            this.sendEvent(new OutputEvent(errmsg, 'server'));
            if (!gdbserverStartupResolved) {
                gdbserverStartupResolved = true;
                rejectStartup(new Error(errmsg + '\n' + accumulatedStderr));
            }
        });

        // Wait until gdbserver is started and ready to receive connections.
        await startupPromise;
    }

    protected initializeUARTConnection(
        uart: UARTArguments,
        host: string | undefined
    ): void {
        if (uart.serialPort !== undefined) {
            // Set the path to the serial port
            this.serialPort = new SerialPort({
                path: uart.serialPort,
                // If the serial port path is defined, then so will the baud rate.
                baudRate: uart.baudRate ?? 115200,
                // If the serial port path is deifned, then so will the number of data bits.
                dataBits: uart.characterSize ?? 8,
                // If the serial port path is defined, then so will the number of stop bits.
                stopBits: uart.stopBits ?? 1,
                // If the serial port path is defined, then so will the parity check type.
                parity: uart.parity ?? 'none',
                // If the serial port path is defined, then so will the type of handshaking method.
                rtscts: uart.handshakingMethod === 'RTS/CTS' ? true : false,
                xon: uart.handshakingMethod === 'XON/XOFF' ? true : false,
                xoff: uart.handshakingMethod === 'XON/XOFF' ? true : false,
                autoOpen: false,
            });

            this.serialPort.on('open', () => {
                this.sendEvent(
                    new OutputEvent(
                        `listening on serial port ${this.serialPort?.path}${os.EOL}`,
                        'Serial Port'
                    )
                );
            });

            const SerialUartParser = new ReadlineParser({
                delimiter: uart.eolCharacter === 'CRLF' ? '\r\n' : '\n',
                encoding: 'utf8',
            });

            this.serialPort
                .pipe(SerialUartParser)
                .on('data', (line: string) => {
                    this.sendEvent(
                        new OutputEvent(line + os.EOL, 'Serial Port')
                    );
                });

            this.serialPort.on('close', () => {
                this.sendEvent(
                    new OutputEvent(
                        `closing serial port connection${os.EOL}`,
                        'Serial Port'
                    )
                );
            });

            this.serialPort.on('error', (err) => {
                this.sendEvent(
                    new OutputEvent(
                        `error on serial port connection${os.EOL} - ${err}`,
                        'Serial Port'
                    )
                );
            });

            this.serialPort.open();
        } else if (uart.socketPort !== undefined) {
            this.socket = new Socket();
            this.socket.setEncoding('utf-8');

            let tcpUartData = '';
            this.socket.on('data', (data: string) => {
                for (const char of data) {
                    if (char === '\n') {
                        this.sendEvent(
                            new OutputEvent(tcpUartData + '\n', 'Socket')
                        );
                        tcpUartData = '';
                    } else {
                        tcpUartData += char;
                    }
                }
            });
            this.socket.on('close', () => {
                this.sendEvent(new OutputEvent(tcpUartData + os.EOL, 'Socket'));
                this.sendEvent(
                    new OutputEvent(
                        `closing socket connection${os.EOL}`,
                        'Socket'
                    )
                );
            });
            this.socket.on('error', (err) => {
                this.sendEvent(
                    new OutputEvent(
                        `error on socket connection${os.EOL} - ${err}`,
                        'Socket'
                    )
                );
            });
            this.socket.connect(
                // Putting a + (unary plus operator) infront of the string converts it to a number.
                +uart.socketPort,
                // Default to localhost if target.host is undefined.
                host ?? 'localhost',
                () => {
                    this.sendEvent(
                        new OutputEvent(
                            `listening on tcp port ${uart?.socketPort}${os.EOL}`,
                            'Socket'
                        )
                    );
                }
            );
        }
    }

    protected abortConnectionIfExitRequested(
        verboseLocation: string,
        errorMessage = 'GDB Server exited, abort connection'
    ) {
        if (this.sessionInfo.exitRequest !== ExitSessionRequest.NONE) {
            this.logGDBRemote(errorMessage + ' before ' + verboseLocation);
            throw new Error(errorMessage);
        }
    }

    protected executeOrAbort<M extends PromiseFunction>(
        fn: M
    ): (...args: Parameters<M>) => Promise<ReturnType<M>> {
        const wrappedFunction = async (
            ...args: Parameters<M>
        ): Promise<ReturnType<M>> => {
            this.abortConnectionIfExitRequested(fn.name);
            this.logGDBRemote(fn.name);
            return fn(...args);
        };
        return wrappedFunction;
    }

    private switchAttachOutputToError(input: string): string {
        const outputMessage = 'could not connect: Operation timed out.';
        const returnPair: string = input.startsWith(
            'could not connect (error 138): The system tried to join a drive'
        )
            ? outputMessage
            : input;
        return returnPair;
    }

    protected async configureGdbAndLoadFiles(
        gdb: IGDBBackend,
        args: TargetAttachRequestArguments
    ): Promise<void> {
        // Load files and configure GDB
        if (args.program !== undefined && args.program !== '') {
            await this.executeOrAbort(gdb.sendFileExecAndSymbols.bind(gdb))(
                args.program
            );
        }
        await this.executeOrAbort(gdb.sendEnablePrettyPrint.bind(gdb))();

        if (args.imageAndSymbols) {
            if (args.imageAndSymbols.symbolFileName) {
                if (args.imageAndSymbols.symbolOffset) {
                    await this.executeOrAbort(gdb.sendAddSymbolFile.bind(gdb))(
                        args.imageAndSymbols.symbolFileName,
                        args.imageAndSymbols.symbolOffset
                    );
                } else {
                    await this.executeOrAbort(gdb.sendFileSymbolFile.bind(gdb))(
                        args.imageAndSymbols.symbolFileName
                    );
                }
            }
        }
    }

    protected async startGDBAndConnectToGDBSERVER(
        response: DebugProtocol.AttachResponse | DebugProtocol.LaunchResponse,
        args: TargetAttachRequestArguments
    ): Promise<void> {
        if (args.target === undefined) {
            args.target = {};
        }
        const target = args.target;
        try {
            // Start GDB process
            this.logGDBRemote(`spawn GDB\n`);
            await this.spawn(args);
            if (args.auxiliaryGdb) {
                this.logGDBRemote(`spawn auxiliary GDB\n`);
                await this.spawn(args, this.auxGdb);
            }
            await this.setSessionState(SessionState.GDB_LAUNCHED);

            // Register exit-handler
            this.gdb?.on('exit', async (code, signal) => {
                if (code !== 0) {
                    // Only log to debug console if forced exit.
                    // Other than GDB server, there shouldn't be
                    // an unexpected GDB exit with exit code 0.
                    const exitmsg =
                        code === null
                            ? `gdb killed by signal ${signal}\n`
                            : `gdb exited with code ${code}\n`;
                    this.sendEvent(new OutputEvent(exitmsg, 'server'));
                }
                this.logGDBRemote(
                    `GDB exited with code ${code}, signal ${signal}`
                );
                if (
                    this.sessionInfo.state < SessionState.EXITING &&
                    !this.sessionInfo.disconnectError &&
                    code !== 0
                ) {
                    this.sessionInfo.disconnectError =
                        'GDB exited unexpectedly, see Debug Console for more info';
                }
                await this.setExitSessionRequest(ExitSessionRequest.EXIT);
            });

            await this.configureGdbAndLoadFiles(this.gdb, args);
            if (this.auxGdb) {
                await this.configureGdbAndLoadFiles(this.auxGdb, args);
            }

            await this.setSessionState(SessionState.GDB_READY);

            await this.executeOrAbort(this.gdb.sendCommands.bind(this.gdb))(
                args.preConnectCommands
            );

            const targetPort = target.port;
            const targetHost = targetPort
                ? (target.host ?? 'localhost')
                : undefined;
            const targetString = targetHost
                ? `${targetHost}:${targetPort}`
                : undefined;
            const defaultTarget = targetString ? [targetString] : [];
            const targetParameters = target.parameters ?? defaultTarget;
            const targetType = target.type ?? 'remote';

            // Connect to remote server
            if (target.connectCommands === undefined) {
                this.targetType = targetType;
                await this.executeOrAbort(mi.sendTargetSelectRequest.bind(mi))(
                    this.gdb,
                    {
                        type: this.targetType,
                        parameters: targetParameters,
                    }
                );
                this.sendEvent(
                    new OutputEvent(
                        `connected to ${
                            this.targetType
                        } target ${targetParameters.join(' ')}`
                    )
                );
            } else {
                this.logGDBRemote('connectCommands');
                await this.executeOrAbort(this.gdb.sendCommands.bind(this.gdb))(
                    target.connectCommands
                );
                this.sendEvent(
                    new OutputEvent(
                        'connected to target using provided connectCommands'
                    )
                );
            }

            if (args.auxiliaryGdb && this.auxGdb) {
                this.logGDBRemote('connect auxiliary GDB to target');
                // Use connect commands to connect auxiliary GDB.
                const connectCommands: string[] = [...AuxiliaryConnectCommands];
                if (target.connectCommands) {
                    connectCommands.push(...target.connectCommands);
                } else {
                    connectCommands.push(
                        `target ${targetType} ${targetParameters.join(' ')}`
                    );
                }
                await this.executeOrAbort(
                    this.auxGdb.sendCommands.bind(this.auxGdb)
                )(connectCommands);
                this.sendEvent(
                    new OutputEvent('connected auxiliary GDB to target')
                );
                this.logGDBRemote('connected auxiliary GDB to target');
            }

            await this.setSessionState(SessionState.CONNECTED);

            // Initialize debug target
            await this.executeOrAbort(this.gdb.sendCommands.bind(this.gdb))(
                args.initCommands
            );

            // Check for async mode support after initCommands have possibly
            // selected a different target
            if (this.gdb.getAsyncMode()) {
                if (await this.gdb.confirmAsyncMode()) {
                    this.warnAsyncDisabled();
                }
            }

            // Initialize UART
            if (target.uart !== undefined) {
                this.initializeUARTConnection(target.uart, target.host);
            }

            // Load additional code/symbols
            if (args.imageAndSymbols) {
                if (args.imageAndSymbols.imageFileName) {
                    await this.executeOrAbort(this.gdb.sendLoad.bind(this.gdb))(
                        args.imageAndSymbols.imageFileName,
                        args.imageAndSymbols.imageOffset
                    );
                }
            }
            // More scripting before setting the target running
            await this.executeOrAbort(this.gdb.sendCommands.bind(this.gdb))(
                args.preRunCommands
            );
            // Connection completed, announce the adapter is ready for
            // other protocol commands.
            this.sendInitializedEvent();
            this.sendResponse(response);
            await this.setSessionState(SessionState.SESSION_READY);
        } catch (err) {
            this.logGDBRemote(`caught error '${err}`);
            // Clean up any pending processes
            await this.setExitSessionRequest(ExitSessionRequest.EXIT);
            // Complete connection failure response
            const errorMessage =
                err instanceof Error ? err.message : String(err);
            const messageToPrint = this.switchAttachOutputToError(errorMessage);
            this.sendErrorResponse(response, 1, messageToPrint);
        }
    }

    /**
     * Terminate GBD server process if still running
     *
     * @returns `true` if GDB server was actively terminated,
     *          `false` if no GDB server process exists or
     *          already exited
     */
    protected async stopGDBServer(timeout: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.gdbserver || !isProcessActive(this.gdbserver)) {
                const skipReason = this.launchGdbServer
                    ? `'launch' connection`
                    : 'already down';
                this.logGDBRemote(`skip stopping GDB server, ${skipReason}`);
                resolve(false);
            } else {
                let timer: NodeJS.Timeout | undefined = undefined;
                this.gdbserver.on('exit', () => {
                    this.logGDBRemote('stopping GDB server completed');
                    if (timer !== undefined) {
                        clearTimeout(timer);
                    }
                    resolve(true);
                });
                timer = setTimeout(() => {
                    this.logGDBRemote('stopping GDB server');
                    this.gdbserver?.kill();
                    setTimeout(() => {
                        reject();
                    }, 1000);
                }, timeout);
            }
        });
    }

    protected async doDisconnectRequest(
        gdbServerTimeout: number,
        sendTerminate?: boolean
    ): Promise<void> {
        await this.setSessionState(SessionState.EXITING);

        if (this.serialPort !== undefined && this.serialPort.isOpen)
            this.serialPort.close();

        // Only try clean GDB exit if process still up
        if (this.gdb?.isActive()) {
            try {
                // Depending on disconnect scenario, we may lose
                // GDB backend while sending commands for graceful
                // shutdown.
                // Always 'disconnect' if no gdbserver launched. Indicates
                // this attached to a running server.
                if (
                    this.targetType === 'remote' &&
                    (!this.launchGdbServer || isProcessActive(this.gdbserver))
                ) {
                    // Need to pause first, then disconnect and exit.
                    await this.pauseIfNeeded(true);
                    if (this.auxGdb?.isActive()) {
                        await this.auxGdb.sendCommand('disconnect');
                    }
                    await this.gdb.sendCommand('disconnect');
                }

                if (this.auxGdb?.isActive()) {
                    await this.auxGdb.sendGDBExit();
                }
                await this.gdb.sendGDBExit();
                this.sendEvent(new OutputEvent('gdb exited\n', 'server'));
            } catch {
                // Not much we can do, so ignore errors during
                // GDB disconnect.
                this.sendEvent(
                    new OutputEvent('gdb connection lost\n', 'server')
                );
            }
        }
        await this.setSessionState(SessionState.EXITED);

        if (this.killGdbServer) {
            try {
                // GDB server stop may time out and throw
                if (await this.stopGDBServer(gdbServerTimeout)) {
                    this.sendEvent(
                        new OutputEvent('gdbserver stopped\n', 'server')
                    );
                }
            } catch {
                // Not much we can do, so ignore errors during
                // GDB Server disconnect.
                this.sendEvent(
                    new OutputEvent('gdbserver connection lost\n', 'server')
                );
            }
        }

        if (sendTerminate) {
            this.sendEvent(new TerminatedEvent());
        }
    }

    /**
     * WARNING: `disconnectRequest` is unreliable in sync mode.
     * @see {@link https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/339#discussion_r1840549671}
     */
    protected async disconnectRequest(
        response: DebugProtocol.DisconnectResponse,
        _args: DebugProtocol.DisconnectArguments
    ): Promise<void> {
        try {
            await this.doDisconnectRequest(0);
            if (this.sessionInfo.disconnectError) {
                this.sendErrorResponse(
                    response,
                    1,
                    this.sessionInfo.disconnectError
                );
            } else {
                this.sendResponse(response);
            }
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async terminateRequest(
        response: DebugProtocol.TerminateResponse,
        _args: DebugProtocol.TerminateArguments
    ): Promise<void> {
        try {
            await this.doDisconnectRequest(this.serverDisconnectTimeout, true);
            if (this.sessionInfo.disconnectError) {
                this.sendErrorResponse(
                    response,
                    1,
                    this.sessionInfo.disconnectError
                );
            } else {
                this.sendResponse(response);
            }
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ): Promise<void> {
        return this.doEvaluateRequest(response, args, true);
    }
}
