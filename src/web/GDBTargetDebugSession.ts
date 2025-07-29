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
import {
    InitializedEvent,
    logger,
    OutputEvent,
    TerminatedEvent,
} from '@vscode/debugadapter';
import { LogLevel } from '@vscode/debugadapter/lib/logger';
import * as mi from '../mi';
import { DebugProtocol } from '@vscode/debugprotocol';
import {
    TargetLaunchRequestArguments,
    TargetAttachRequestArguments,
} from '../types/session';
import {
    IGDBBackendFactory,
    IGDBServerFactory,
    IGDBServerProcessManager,
    IStdioProcess,
} from '../types/gdb';
import { isProcessActive } from '../util/processes';

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

export class GDBTargetDebugSession extends GDBDebugSession {
    protected gdbserver?: IStdioProcess;
    protected gdbserverFactory?: IGDBServerFactory;
    protected gdbserverProcessManager?: IGDBServerProcessManager;
    // Capture if gdbserver was launched for correct disconnect behavior
    protected launchGdbServer = false;
    protected killGdbServer = true;
    protected sessionInfo: SessionInfo = {
        state: SessionState.INACTIVE,
        exitRequest: ExitSessionRequest.NONE,
    };

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
        super(backendFactory);
        this.gdbserverFactory = gdbserverFactory;
        this.logger = logger;
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
            await this.doDisconnectRequest(shouldSendTerminateEvent);
        }
    }

    protected override async setupCommonLoggerAndBackends(
        args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ) {
        await super.setupCommonLoggerAndBackends(args);

        this.gdbserverProcessManager =
            await this.gdbserverFactory?.createGDBServerManager(args);
    }

    protected async attachOrLaunchRequest(
        response: DebugProtocol.Response,
        request: 'launch' | 'attach',
        args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ) {
        await this.setupCommonLoggerAndBackends(args);
        this.initializeCustomResetCommands(args);

        if (request === 'launch') {
            const launchArgs = args as TargetLaunchRequestArguments;
            await this.startGDBServer(launchArgs);
        }

        await this.startGDBAndAttachToTarget(response, args);
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
        this.killGdbServer = target.automaticallyKillServer !== false;

        // Wait until gdbserver is started and ready to receive connections.
        await new Promise<void>(async (resolve, reject) => {
            if (!this.gdbserverProcessManager) {
                throw new Error(
                    'GDBServer process manager is not initialised!'
                );
            }
            this.gdbserver = await this.gdbserverProcessManager.start(args);
            this.logGDBRemote(
                `Spawned GDB Server (PID ${this.gdbserver.getPID()})`
            );
            await this.setSessionState(SessionState.GDBSERVER_LAUNCHED);

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
                        resolve();
                    },
                    target.serverStartupDelay !== undefined
                        ? target.serverStartupDelay
                        : 0
                );
            } else {
                checkTargetPort = (data: any) => {
                    const regex = new RegExp(
                        target.serverPortRegExp
                            ? target.serverPortRegExp
                            : 'Listening on port ([0-9]+)\r?\n'
                    );
                    const m = regex.exec(data);
                    if (m !== null) {
                        target.port = m[1];
                        checkTargetPort = (_data: any) => {
                            // do nothing now that we have our port
                        };
                        setTimeout(
                            () => {
                                gdbserverStartupResolved = true;
                                resolve();
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
                    reject(new Error(exitmsg + '\n' + accumulatedStderr));
                }
                if (
                    this.sessionInfo.state < SessionState.EXITING &&
                    !this.sessionInfo.disconnectError &&
                    code !== 0
                ) {
                    this.sessionInfo.disconnectError =
                        'GDB server exited unexpectedly, see Debug Console for more info';
                }
                this.logGDBRemote('GDB server exited, exiting session');
                await this.setExitSessionRequest(ExitSessionRequest.EXIT);
            });

            this.gdbserver.on('error', (err) => {
                const errmsg = `gdbserver has hit error ${err}\n`;
                this.sendEvent(new OutputEvent(errmsg, 'server'));
                if (!gdbserverStartupResolved) {
                    gdbserverStartupResolved = true;
                    reject(new Error(errmsg + '\n' + accumulatedStderr));
                }
            });
        });
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

    protected async startGDBAndAttachToTarget(
        response: DebugProtocol.AttachResponse | DebugProtocol.LaunchResponse,
        args: TargetAttachRequestArguments
    ): Promise<void> {
        if (args.target === undefined) {
            args.target = {};
        }
        const target = args.target;
        try {
            this.isAttach = true;
            // Start GDB process
            this.logGDBRemote(`spawn GDB\n`);
            await this.spawn(args);
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

            // Load files and configure GDB
            if (args.program !== undefined && args.program !== '') {
                await this.executeOrAbort(
                    this.gdb.sendFileExecAndSymbols.bind(this.gdb)
                )(args.program);
            }
            await this.executeOrAbort(
                this.gdb.sendEnablePrettyPrint.bind(this.gdb)
            )();
            if (args.imageAndSymbols) {
                if (args.imageAndSymbols.symbolFileName) {
                    if (args.imageAndSymbols.symbolOffset) {
                        await this.executeOrAbort(
                            this.gdb.sendAddSymbolFile.bind(this.gdb)
                        )(
                            args.imageAndSymbols.symbolFileName,
                            args.imageAndSymbols.symbolOffset
                        );
                    } else {
                        await this.executeOrAbort(
                            this.gdb.sendFileSymbolFile.bind(this.gdb)
                        )(args.imageAndSymbols.symbolFileName);
                    }
                }
            }

            await this.setSessionState(SessionState.GDB_READY);

            // Connect to remote server
            if (target.connectCommands === undefined) {
                this.targetType =
                    target.type !== undefined ? target.type : 'remote';
                let defaultTarget: string[];
                if (target.port !== undefined) {
                    defaultTarget = [
                        target.host !== undefined
                            ? `${target.host}:${target.port}`
                            : `localhost:${target.port}`,
                    ];
                } else {
                    defaultTarget = [];
                }
                const targetParameters =
                    target.parameters !== undefined
                        ? target.parameters
                        : defaultTarget;
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

            await this.setSessionState(SessionState.CONNECTED);

            // Initialize debug target
            await this.executeOrAbort(this.gdb.sendCommands.bind(this.gdb))(
                args.initCommands
            );

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
            this.sendEvent(new InitializedEvent());
            this.sendResponse(response);
            await this.setSessionState(SessionState.SESSION_READY);
            this.isInitialized = true;
        } catch (err) {
            this.logGDBRemote(`caught error '${err}`);
            // Clean up any pending processes
            await this.setExitSessionRequest(ExitSessionRequest.EXIT);
            // Complete connection failure response
            const errorMessage =
                err instanceof Error ? err.message : String(err);
            this.sendErrorResponse(response, 1, errorMessage);
        }
    }

    /**
     * Terminate GBD server process if still running
     *
     * @returns `true` if GDB server was actively terminated,
     *          `false` if no GDB server process exists or
     *          already exited
     */
    protected async stopGDBServer(): Promise<boolean> {
        await this.gdbserverProcessManager?.stop();
        return true;
    }

    protected async doDisconnectRequest(
        sendTerminate?: boolean
    ): Promise<void> {
        await this.setSessionState(SessionState.EXITING);

        // Only try clean GDB exit if process still up
        if (this.gdb.isActive()) {
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
                    await this.gdb.sendCommand('disconnect');
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
                if (await this.stopGDBServer()) {
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
            await this.doDisconnectRequest();
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
