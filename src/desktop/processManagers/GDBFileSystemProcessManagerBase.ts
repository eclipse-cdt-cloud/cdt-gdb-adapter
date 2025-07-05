/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import {
    AttachRequestArguments,
    LaunchRequestArguments,
} from '../../types/session';
import { ChildProcess, spawn } from 'child_process';
import { createEnvValues } from '../../util/createEnvValues';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { GetPIDType, IStdioProcess } from '../../types/gdb';

type ConvertChildProcess = ChildProcess & GetPIDType;

export class GDBFileSystemProcessManagerBase {
    protected proc?: ChildProcess;
    protected token = 0;
    protected requestArgs?: LaunchRequestArguments | AttachRequestArguments;

    constructor() {}

    protected getEnvironment(
        additionalEnvironment?: Record<string, string | null>
    ): NodeJS.ProcessEnv {
        return additionalEnvironment
            ? createEnvValues(process.env, additionalEnvironment)
            : process.env;
    }

    protected getCwd(
        requestArgs: LaunchRequestArguments | AttachRequestArguments
    ): string {
        const cwd =
            requestArgs.cwd ||
            (requestArgs.program && existsSync(requestArgs.program)
                ? dirname(requestArgs.program)
                : process.cwd());
        return existsSync(cwd) ? cwd : process.cwd();
    }

    public async spawn(
        executable: string,
        args: string[] | undefined,
        options: {
            cwd?: string;
            additionalEnvironment?: Record<string, string | null>;
        }
    ): Promise<IStdioProcess> {
        const env = this.getEnvironment(options.additionalEnvironment);

        this.proc = spawn(executable, args, { env, cwd: options.cwd });
        (this.proc as ConvertChildProcess).getPID = () => this.proc?.pid;
        return this.proc as ConvertChildProcess;
    }

    public async kill() {
        if (!this.proc) {
            throw new Error('GDB is not running, nothing to interrupt');
        }
        // logger.verbose(`GDB signal: SIGINT to pid ${this.proc.pid}`);
        this.proc.kill('SIGINT');
    }

    public onStop(
        callback: (code: number | null, signal: NodeJS.Signals | null) => void
    ): void {
        this.proc?.on('exit', callback);
    }
    public onError(callback: (err: Error) => void): void {
        this.proc?.on('error', callback);
    }
}
