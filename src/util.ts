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

/**
 * This method actually launches 'gdb --version' to determine the version of
 * the GDB that is being used.
 *
 * @param gdbPath the path to the GDB executable to be called
 * @return the detected version of GDB at gdbPath
 */
export async function getGdbVersion(gdbPath: string): Promise<string> {
    const { stdout, stderr } = await promisify(execFile)(gdbPath, [
        '--version',
    ]);

    const gdbVersion = parseGdbVersionOutput(stdout);
    if (!gdbVersion) {
        throw new Error(
            `Failed to get version number from GDB. GDB returned:\nstdout:\n${stdout}\nstderr:\n${stderr}`
        );
    }
    return gdbVersion;
}

/**
 * Find gdb version info from a string object which is supposed to
 * contain output text of "gdb --version" command.
 *
 * @param stdout
 * 		output text from "gdb --version" command .
 * @return
 * 		String representation of version of gdb such as "10.1" on success
 */
export function parseGdbVersionOutput(stdout: string): string | undefined {
    return stdout.split(/ gdb( \(.*?\))? (\D* )*\(?(\d*(\.\d*)*)/g)[3];
}

/**
 * Compares two version numbers.
 * Returns -1, 0, or 1 if v1 is less than, equal to, or greater than v2, respectively.
 * @param v1 The first version
 * @param v2 The second version
 * @return -1, 0, or 1 if v1 is less than, equal to, or greater than v2, respectively.
 */
export function compareVersions(v1: string, v2: string): number {
    const v1Parts = v1.split(/\./);
    const v2Parts = v2.split(/\./);
    for (let i = 0; i < v1Parts.length && i < v2Parts.length; i++) {
        const v1PartValue = parseInt(v1Parts[i], 10);
        const v2PartValue = parseInt(v2Parts[i], 10);

        if (isNaN(v1PartValue) || isNaN(v2PartValue)) {
            // Non-integer part, ignore it
            continue;
        }
        if (v1PartValue > v2PartValue) {
            return 1;
        } else if (v1PartValue < v2PartValue) {
            return -1;
        }
    }

    // If we get here is means the versions are still equal
    // but there could be extra parts to examine

    if (v1Parts.length < v2Parts.length) {
        // v2 has extra parts, which implies v1 is a lower version (e.g., v1 = 7.9 v2 = 7.9.1)
        // unless each extra part is 0, in which case the two versions are equal (e.g., v1 = 7.9 v2 = 7.9.0)
        for (let i = v1Parts.length; i < v2Parts.length; i++) {
            const v2PartValue = parseInt(v2Parts[i], 10);

            if (isNaN(v2PartValue)) {
                // Non-integer part, ignore it
                continue;
            }
            if (v2PartValue != 0) {
                return -1;
            }
        }
    }
    if (v1Parts.length > v2Parts.length) {
        // v1 has extra parts, which implies v1 is a higher version (e.g., v1 = 7.9.1 v2 = 7.9)
        // unless each extra part is 0, in which case the two versions are equal (e.g., v1 = 7.9.0 v2 = 7.9)
        for (let i = v2Parts.length; i < v1Parts.length; i++) {
            const v1PartValue = parseInt(v1Parts[i], 10);

            if (isNaN(v1PartValue)) {
                // Non-integer part, ignore it
                continue;
            }
            if (v1PartValue != 0) {
                return 1;
            }
        }
    }

    return 0;
}
