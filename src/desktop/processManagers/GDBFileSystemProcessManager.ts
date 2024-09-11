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
import { ChildProcess, execFile } from 'child_process';
import { parseGdbVersionOutput } from '../../util/parseGdbVersionOutput';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { GDBFileSystemProcessManagerBase } from './GDBFileSystemProcessManagerBase';
import { IGDBProcessManager, IStdioProcess } from '../../types/gdb';

export class GDBFileSystemProcessManager
    extends GDBFileSystemProcessManagerBase
    implements IGDBProcessManager
{
    protected proc?: ChildProcess;
    public gdbVersion?: string;

    protected token = 0;
    protected requestArgs?: LaunchRequestArguments | AttachRequestArguments;
    constructor() {
        super();
    }

    protected getGdbCwd(
        requestArgs: LaunchRequestArguments | AttachRequestArguments
    ): string {
        const cwd =
            requestArgs.cwd ||
            (requestArgs.program && existsSync(requestArgs.program)
                ? dirname(requestArgs.program)
                : process.cwd());
        return existsSync(cwd) ? cwd : process.cwd();
    }

    public async getVersion(
        requestArgs?: LaunchRequestArguments | AttachRequestArguments
    ): Promise<string> {
        if (this.gdbVersion) {
            return this.gdbVersion;
        }
        requestArgs = requestArgs || this.requestArgs;
        if (!requestArgs) {
            throw new Error(`You need to initialize first!`);
        }
        const gdbPath = requestArgs.gdb || 'gdb';
        const gdbEnvironment = this.getEnvironment(requestArgs.environment);
        const gdbCwd = this.getGdbCwd(requestArgs);

        const { stdout, stderr } = await promisify(execFile)(
            gdbPath,
            ['--version'],
            { cwd: gdbCwd, env: gdbEnvironment }
        );

        const gdbVersion = parseGdbVersionOutput(stdout);
        if (!gdbVersion) {
            throw new Error(
                `Failed to get version number from GDB. GDB returned:\nstdout:\n${stdout}\nstderr:\n${stderr}`
            );
        }
        this.gdbVersion = gdbVersion;
        return gdbVersion;
    }

    public async start(
        requestArgs: LaunchRequestArguments | AttachRequestArguments
    ): Promise<IStdioProcess> {
        this.requestArgs = requestArgs;
        await this.getVersion(requestArgs);
        const gdbPath = this.requestArgs.gdb || 'gdb';
        let gdbArgs = ['--interpreter=mi2'];
        if (requestArgs.gdbArguments) {
            gdbArgs = gdbArgs.concat(requestArgs.gdbArguments);
        }

        const gdbCwd = this.getGdbCwd(requestArgs);

        return this.spawn(gdbPath, gdbArgs, {
            cwd: gdbCwd,
            additionalEnvironment: requestArgs.environment,
        });
    }
    public async stop() {
        this.kill();
    }
}
