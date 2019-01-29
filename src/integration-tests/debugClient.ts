/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import * as cp from 'child_process';
import { DebugClient } from 'vscode-debugadapter-testsupport';
import { DebugProtocol } from 'vscode-debugprotocol';

// tslint:disable:no-string-literal

export type ReverseRequestHandler<A = any, R extends DebugProtocol.Response = DebugProtocol.Response> =
    (args: A) => Promise<R['body']>;
export interface ReverseRequestHandlers {
    [key: string]: ReverseRequestHandler | undefined;
    runInTerminal: ReverseRequestHandler<
        DebugProtocol.RunInTerminalRequestArguments, DebugProtocol.RunInTerminalResponse>;
}

/**
 * Extend the DebugClient to support Reverse Requests:
 * https://microsoft.github.io/debug-adapter-protocol/specification#Reverse_Requests_RunInTerminal
 */
export class CdtDebugClient extends DebugClient {

    /**
     * Reverse Request Handlers:
     */
    protected reverseRequestHandlers: ReverseRequestHandlers = {
        runInTerminal: async (args) => {
            const process = await new Promise<cp.ChildProcess>((resolve, reject) => {
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
            });
            return {
                processId: process.pid,
            };
        },
    };

    /**
     * Notify the Debug Adapter by default that this client supports `runInTerminal`.
     */
    public initializeRequest(args?: DebugProtocol.InitializeRequestArguments) {
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
     * Send a response following a Debug Adapter Reverse Request.
     * @param request original request to respond to.
     * @param handler processes the request and returns the response body.
     */
    private async doRespond(request: DebugProtocol.Request): Promise<void> {
        const { command } = request;
        const handler: ReverseRequestHandler | undefined = this['reverseRequestHandlers'][command];
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
                response.message = error instanceof Error ? error.message : error;
            }
        }
        const json = JSON.stringify(response);
        this['outputStream'].write(`Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n${json}`);
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

function isRequest(message: DebugProtocol.ProtocolMessage): message is DebugProtocol.Request {
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
