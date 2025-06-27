/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { IStdioProcess } from '../../types/gdb';
import { ChildProcess } from 'child_process';
import { GDBFileSystemProcessManager } from './GDBFileSystemProcessManager';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugSession } from '@vscode/debugadapter';
import {
    AttachRequestArguments,
    LaunchRequestArguments,
} from '../../types/session';

export class GDBPTYProcessManager extends GDBFileSystemProcessManager {
    protected proc?: ChildProcess;

    constructor(protected session: DebugSession) {
        super();
    }

    public async start(
        requestArgs: LaunchRequestArguments | AttachRequestArguments
    ): Promise<IStdioProcess> {
        this.requestArgs = requestArgs;
        await this.getVersion(requestArgs);
        const gdbPath = requestArgs.gdb || 'gdb';
        const gdbEnvironment = this.getEnvironment(requestArgs.environment);
        const gdbCwd = this.getGdbCwd(requestArgs);

        const { Pty } = await import('../../native/pty');
        const pty = new Pty();
        let gdbArgs = [gdbPath, '-ex', `new-ui mi2 ${pty.slave_name}`];
        if (requestArgs.gdbArguments) {
            gdbArgs = gdbArgs.concat(requestArgs.gdbArguments);
        }

        const response = await new Promise<DebugProtocol.Response>((resolve) =>
            this.session.sendRequest(
                'runInTerminal',
                {
                    kind: 'integrated',
                    cwd: gdbCwd,
                    env: gdbEnvironment,
                    args: gdbArgs,
                } as DebugProtocol.RunInTerminalRequestArguments,
                5000,
                resolve
            )
        );

        if (!response.success) {
            const message = `could not start the terminal on the client: ${response.message}`;
            // logger.error(message);
            throw new Error(message);
        }

        const item = {
            stdout: pty.reader,
            stdin: pty.writer,
            stderr: null,
            getPID: () => undefined,
            exitCode: null,
            signalCode: null,
            kill: () => true,
            on: (_event: 'error' | 'exit', _fn: any) => {
                return item;
            },
        };
        return item;
    }
    public async stop() {
        if (!this.proc) {
            throw new Error('GDB is not running, nothing to interrupt');
        }
        // logger.verbose(`GDB signal: SIGINT to pid ${this.proc.pid}`);
        this.proc.kill('SIGINT');
    }
}
