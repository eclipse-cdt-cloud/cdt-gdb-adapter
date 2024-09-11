/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createEnvValues } from './createEnvValues';
import { parseGdbVersionOutput } from './parseGdbVersionOutput';

/**
 * This method actually launches 'gdb --version' to determine the version of
 * the GDB that is being used.
 *
 * @param gdbPath the path to the GDB executable to be called
 * @return the detected version of GDB at gdbPath
 */
export async function getGdbVersion(
    gdbPath: string,
    gdbCwd?: string,
    environment?: Record<string, string | null>
): Promise<string> {
    const gdbEnvironment = environment
        ? createEnvValues(process.env, environment)
        : process.env;
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
    return gdbVersion;
}
