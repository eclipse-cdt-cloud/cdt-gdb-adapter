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
import { InitializedEvent, logger, OutputEvent } from '@vscode/debugadapter';
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

export class GDBTargetDebugSession extends GDBDebugSession {
    protected gdbserver?: IStdioProcess;
    protected gdbserverFactory?: IGDBServerFactory;
    protected gdbserverProcessManager?: IGDBServerProcessManager;
    protected killGdbServer = true;

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
            if (
                launchArgs.target?.serverParameters === undefined &&
                !launchArgs.program
            ) {
                this.sendErrorResponse(
                    response,
                    1,
                    'The program must be specified in the launch request arguments'
                );
                return;
            }
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

        this.killGdbServer = target.automaticallyKillServer !== false;

        // Wait until gdbserver is started and ready to receive connections.
        await new Promise<void>(async (resolve, reject) => {
            if (!this.gdbserverProcessManager) {
                throw new Error(
                    'GDBServer process manager is not initialised!'
                );
            }
            this.gdbserver = await this.gdbserverProcessManager.start(args);
            let gdbserverStartupResolved = false;
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

            this.gdbserver.on('exit', (code, signal) => {
                let exitmsg: string;
                if (code === null) {
                    exitmsg = `gdbserver is killed by signal ${signal}`;
                } else {
                    exitmsg = `gdbserver has exited with code ${code}`;
                }
                this.sendEvent(new OutputEvent(exitmsg, 'server'));
                if (!gdbserverStartupResolved) {
                    gdbserverStartupResolved = true;
                    reject(new Error(exitmsg + '\n' + accumulatedStderr));
                }
            });

            this.gdbserver.on('error', (err) => {
                const errmsg = `gdbserver has hit error ${err}`;
                this.sendEvent(new OutputEvent(errmsg, 'server'));
                if (!gdbserverStartupResolved) {
                    gdbserverStartupResolved = true;
                    reject(new Error(errmsg + '\n' + accumulatedStderr));
                }
            });
        });
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
            await this.spawn(args);
            await this.gdb.sendFileExecAndSymbols(args.program);
            await this.gdb.sendEnablePrettyPrint();
            if (args.imageAndSymbols) {
                if (args.imageAndSymbols.symbolFileName) {
                    if (args.imageAndSymbols.symbolOffset) {
                        await this.gdb.sendAddSymbolFile(
                            args.imageAndSymbols.symbolFileName,
                            args.imageAndSymbols.symbolOffset
                        );
                    } else {
                        await this.gdb.sendFileSymbolFile(
                            args.imageAndSymbols.symbolFileName
                        );
                    }
                }
            }

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
                await mi.sendTargetSelectRequest(this.gdb, {
                    type: this.targetType,
                    parameters: targetParameters,
                });
                this.sendEvent(
                    new OutputEvent(
                        `connected to ${
                            this.targetType
                        } target ${targetParameters.join(' ')}`
                    )
                );
            } else {
                await this.gdb.sendCommands(target.connectCommands);
                this.sendEvent(
                    new OutputEvent(
                        'connected to target using provided connectCommands'
                    )
                );
            }

            await this.gdb.sendCommands(args.initCommands);

            if (args.imageAndSymbols) {
                if (args.imageAndSymbols.imageFileName) {
                    await this.gdb.sendLoad(
                        args.imageAndSymbols.imageFileName,
                        args.imageAndSymbols.imageOffset
                    );
                }
            }
            await this.gdb.sendCommands(args.preRunCommands);
            this.sendEvent(new InitializedEvent());
            this.sendResponse(response);
            this.isInitialized = true;
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async stopGDBServer(): Promise<void> {
        return this.gdbserverProcessManager?.stop();
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
            if (this.targetType === 'remote') {
                // Need to pause first, then disconnect and exit
                await this.pauseIfNeeded(true);
                await this.gdb.sendCommand('disconnect');
            }

            await this.gdb.sendGDBExit();
            if (this.killGdbServer) {
                await this.stopGDBServer();
                this.sendEvent(new OutputEvent('gdbserver stopped', 'server'));
            }
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }
}
