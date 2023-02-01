/*********************************************************************
 * Copyright (c) 2018, 2023 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import * as cp from 'child_process';
import { DebugClient } from '@vscode/debugadapter-testsupport';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import { defaultAdapter } from './utils';
import * as os from 'os';
import { expect } from 'chai';

export type ReverseRequestHandler<
    A = any,
    R extends DebugProtocol.Response = DebugProtocol.Response
> = (args: A) => Promise<R['body']>;
export interface ReverseRequestHandlers {
    [key: string]: ReverseRequestHandler | undefined;
    runInTerminal: ReverseRequestHandler<
        DebugProtocol.RunInTerminalRequestArguments,
        DebugProtocol.RunInTerminalResponse
    >;
}

function getAdapterAndArgs(adapter?: string): string[] {
    const chosenAdapter = adapter !== undefined ? adapter : defaultAdapter;
    const adapterPath: string = path.join(
        __dirname,
        '../../dist',
        chosenAdapter
    );
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        return ['--inspect-brk', adapterPath];
    }
    return [adapterPath];
}

/**
 * Extend the standard DebugClient to support additional client features
 */
export class CdtDebugClient extends DebugClient {
    private _cdt_args: string[];
    private _cdt_adapterProcess?: cp.ChildProcess;
    constructor(adapter?: string, extraArgs?: string[]) {
        // The unused are as such because we do override process launching
        super('unused', 'unused', 'gdb');
        this._cdt_args = getAdapterAndArgs(adapter);
        if (extraArgs) {
            this._cdt_args.push(...extraArgs);
        }
        // These timeouts should be smaller than what is in .mocharc.json and .mocharc-windows-ci.json
        // to allow the individual timeouts to fail before the whole test timesout.
        // This will mean error message on things such as waitForEvent will not
        // be hidden by overall test failure
        this.defaultTimeout = os.platform() === 'win32' ? 25000 / 2 : 5000 / 2;
    }

    /**
     * Start a debug session allowing command line arguments to be supplied
     */
    public start(port?: number): Promise<void> {
        if (typeof port === 'number') {
            return super.start(port);
        }

        return new Promise<void>((resolve, reject) => {
            this._cdt_adapterProcess = cp.spawn('node', this._cdt_args);
            this._cdt_adapterProcess.on('error', (err) => {
                console.log(err);
                reject(err);
            });

            if (
                this._cdt_adapterProcess.stdout === null ||
                this._cdt_adapterProcess.stdin === null
            ) {
                reject('Missing stdout/stdin');
                return;
            }
            this.connect(
                this._cdt_adapterProcess.stdout,
                this._cdt_adapterProcess.stdin
            );
            resolve();
        });
    }

    public stop(): Promise<void> {
        return super
            .stop()
            .then(() => {
                this.killAdapter();
            })
            .catch(() => {
                this.killAdapter();
            });
    }

    private killAdapter() {
        if (this._cdt_adapterProcess) {
            this._cdt_adapterProcess.kill();
            this._cdt_adapterProcess = undefined;
        }
    }
    /**
     * Reverse Request Handlers:
     */
    protected reverseRequestHandlers: ReverseRequestHandlers = {
        runInTerminal: async (args) => {
            const process = await new Promise<cp.ChildProcess>(
                (resolve, reject) => {
                    const child = cp.spawn(args.args[0], args.args.slice(1), {
                        cwd: args.cwd,
                        env: sanitizeEnv(args.env),
                    });
                    if (typeof child.pid !== 'undefined') {
                        return resolve(child);
                    }
                    child.once('error', (error) => {
                        reject(error);
                    });
                }
            );
            return {
                processId: process.pid,
            };
        },
    };

    /**
     * Notify the Debug Adapter by default that this client supports `runInTerminal`.
     */
    public initializeRequest(
        args?: DebugProtocol.InitializeRequestArguments
    ): Promise<DebugProtocol.InitializeResponse> {
        if (!args) {
            args = {
                supportsRunInTerminalRequest: true,
                adapterID: this['_debugType'],
                linesStartAt1: true,
                columnsStartAt1: true,
                pathFormat: 'path',
            };
        }
        return super.initializeRequest(args);
    }

    /**
     * Send a continueRequest and wait for target to stop
     */
    public async continue(
        args: DebugProtocol.ContinueArguments,
        reason: string,
        expected: {
            path?: string | RegExp;
            line?: number;
            column?: number;
        }
    ): Promise<DebugProtocol.StackTraceResponse> {
        const waitForStopped = this.assertStoppedLocation(reason, expected);
        const continueResp = this.continueRequest(args);
        await Promise.all([waitForStopped, continueResp]);
        return waitForStopped;
    }

    /**
     * Send a nextRequest and wait for target to stop
     */
    public async next(
        args: DebugProtocol.NextArguments,
        expected: {
            path?: string | RegExp;
            line?: number;
            column?: number;
        }
    ): Promise<DebugProtocol.StackTraceResponse> {
        const waitForStopped = this.assertStoppedLocation('step', expected);
        const next = this.nextRequest(args);
        await Promise.all([waitForStopped, next]);
        return waitForStopped;
    }

    /**
     * Send a stepInRequest and wait for target to stop
     */
    public async stepIn(
        args: DebugProtocol.StepInArguments,
        expected: {
            path?: string | RegExp;
            line?: number;
            column?: number;
        }
    ): Promise<DebugProtocol.StackTraceResponse> {
        const waitForStopped = this.assertStoppedLocation('step', expected);
        const next = this.stepInRequest(args);
        await Promise.all([waitForStopped, next]);
        return waitForStopped;
    }

    /**
     * Send a stepOutRequest and wait for target to stop
     */
    public async stepOut(
        args: DebugProtocol.StepOutArguments,
        expected: {
            path?: string | RegExp;
            line?: number;
            column?: number;
        }
    ): Promise<DebugProtocol.StackTraceResponse> {
        const waitForStopped = this.assertStoppedLocation('step', expected);
        const next = this.stepOutRequest(args);
        await Promise.all([waitForStopped, next]);
        return waitForStopped;
    }

    /**
     * Send a stepBackRequest and wait for target to stop
     */
    public async stepBack(
        args: DebugProtocol.StepBackArguments,
        expected: {
            path?: string | RegExp;
            line?: number;
            column?: number;
        }
    ): Promise<DebugProtocol.StackTraceResponse> {
        const waitForStopped = this.assertStoppedLocation('step', expected);
        const next = this.stepBackRequest(args);
        await Promise.all([waitForStopped, next]);
        return waitForStopped;
    }

    /*
     * Returns a promise that will resolve if an output event
     * with a specific category and optional output message was received.
     * The promise will be rejected if a timeout occurs.
     */
    public async waitForOutputEvent(
        category: string,
        output?: string,
        timeout: number = this.defaultTimeout
    ): Promise<DebugProtocol.OutputEvent> {
        const isOutputEvent = (
            event: any
        ): event is DebugProtocol.OutputEvent => {
            return (
                !!(event as DebugProtocol.OutputEvent).body &&
                !!(event as DebugProtocol.OutputEvent).body.output
            );
        };

        return new Promise<DebugProtocol.OutputEvent>((resolve, reject) => {
            const outputProcessor = (event: DebugProtocol.OutputEvent) => {
                if (isOutputEvent(event) && event.body.category === category) {
                    if (output === undefined || output === event.body.output) {
                        clearTimeout(timer);
                        this.off('output', outputProcessor);
                        resolve(event);
                    }
                }
            };
            const timer = setTimeout(() => {
                this.off('output', outputProcessor);
                reject(
                    new Error(
                        `no output event with category '${category}' ${
                            output === undefined
                                ? ''
                                : `and output message '${output}'`
                        } received after ${timeout} ms`
                    )
                );
            }, timeout);
            this.on('output', outputProcessor);
        });
    }

    /**
     * Send a response following a Debug Adapter Reverse Request.
     * @param request original request to respond to.
     * @param handler processes the request and returns the response body.
     */
    private async doRespond(request: DebugProtocol.Request): Promise<void> {
        const { command } = request;
        const handler: ReverseRequestHandler | undefined =
            this['reverseRequestHandlers'][command];
        const response: Partial<DebugProtocol.Response> = {
            type: 'response',
            request_seq: request.seq,
            command,
            success: true,
        };
        if (!handler) {
            response.success = false;
            response.message = `Unknown command: ${command}`;
        } else {
            try {
                response.body = await handler(request.arguments);
            } catch (error) {
                response.success = false;
                response.message =
                    error instanceof Error ? error.message : String(error);
            }
        }
        const json = JSON.stringify(response);
        this['outputStream'].write(
            `Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n${json}`
        );
    }

    public readMemoryRequest(
        args: DebugProtocol.ReadMemoryArguments
    ): Promise<DebugProtocol.ReadMemoryResponse> {
        return this.send('readMemory', args);
    }

    public writeMemoryRequest(
        args: DebugProtocol.WriteMemoryArguments
    ): Promise<DebugProtocol.WriteMemoryResponse> {
        return this.send('writeMemory', args);
    }

    public attachHitBreakpoint(
        attachArgs: any,
        breakpoint: { line: number; path: string }
    ): Promise<any> {
        return Promise.all([
            this.waitForEvent('initialized')
                .then((_event) => {
                    return this.setBreakpointsRequest({
                        breakpoints: [{ line: breakpoint.line }],
                        source: { path: breakpoint.path },
                    });
                })
                .then((response) => {
                    const bp = response.body.breakpoints[0];
                    expect(bp.verified).to.be.true;
                    expect(bp.line).to.equal(breakpoint.line);

                    return Promise.all([
                        this.configurationDoneRequest(),
                        this.assertStoppedLocation('breakpoint', breakpoint),
                    ]);
                }),

            this.initializeRequest().then((_response) => {
                return this.attachRequest(attachArgs);
            }),
        ]);
    }

    /**
     * Obtain the value of the expression in the context of the
     * top frame, of the first returned thread.
     * @param name name of the variable
     */
    public async evaluate(expression: string): Promise<string | undefined> {
        const threads = await this.threadsRequest();
        const stack = await this.stackTraceRequest({
            threadId: threads.body.threads[0].id,
        });
        const evalResponse = await this.evaluateRequest({
            expression,
            frameId: stack.body.stackFrames[0].id,
        });
        return evalResponse.body.result;
    }
}

/**
 * DebugProtocol.dispatch is private, overriding manually.
 */
CdtDebugClient.prototype['dispatch'] = function dispatch(raw: any): void {
    const message: DebugProtocol.ProtocolMessage = JSON.parse(raw);
    if (isRequest(message)) {
        this['doRespond'](message);
    } else {
        DebugClient.prototype['dispatch'].apply(this, [raw]);
    }
};

function isRequest(
    message: DebugProtocol.ProtocolMessage
): message is DebugProtocol.Request {
    return message.type === 'request';
}

function sanitizeEnv(env?: { [key: string]: any }): { [key: string]: string } {
    if (!env) {
        return {};
    }
    const sanitized: { [key: string]: string } = {};
    for (const key of Object.keys(env)) {
        if (typeof env[key] === 'string') {
            sanitized[key] = env[key];
        }
    }
    return sanitized;
}
