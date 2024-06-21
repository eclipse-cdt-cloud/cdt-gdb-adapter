/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { existsSync } from 'fs';
import { dirname } from 'path';

/**
 * Calculate the CWD that should be used to launch gdb based on the program
 * being debugged or the explicitly set cwd in the launch arguments.
 *
 * Note that launchArgs.program is optional here in preparation for
 * debugging where no program is specified. See #262
 *
 * @param launchArgs Launch Arguments to compute GDB cwd from
 * @returns effective cwd to use
 */
export function getGdbCwd(launchArgs: {
    program?: string;
    cwd?: string;
}): string {
    const cwd =
        launchArgs.cwd ||
        (launchArgs.program && existsSync(launchArgs.program)
            ? dirname(launchArgs.program)
            : process.cwd());
    return existsSync(cwd) ? cwd : process.cwd();
}
