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
export async function getGdbVersion(
    gdbPath: string,
    environment?: Record<string, string | null>
): Promise<string> {
    const gdbEnvironment = environment
        ? createEnvValues(process.env, environment)
        : process.env;
    const { stdout, stderr } = await promisify(execFile)(
        gdbPath,
        ['--version'],
        { env: gdbEnvironment }
    );

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

/**
 * This method builds string from given data dictionary and regex key formats.
 *
 * @param str
 * 		String contains keys to build.
 * @param data
 * 		Key-Value dictionary to contains lookup values.
 * @param keyRegexs
 * 		Regex rule definitions to capture the key information from the string.
 * @return
 * 		String build with provided data collection and key rules.
 */
export function buildString(
    str: string,
    data: any,
    ...keyRegexs: RegExp[]
): string {
    const _resolveFromSourceHandler =
        (source: any) => (m: string, n: string | undefined) => {
            if (n && typeof n === 'string') {
                const r = source[n.trim()];
                return r ? r : m;
            }
            return m;
        };

    let r = str;
    for (const regex of keyRegexs) {
        r = r.replace(regex, _resolveFromSourceHandler(data));
    }
    return r;
}

/**
 * This method is providing an automatic operation to including new variables to process.env.
 * Method is not injecting the new variables to current thread, rather it is returning a new 
 * object with included parameters. 
 * 
 * This method also supports construction of new values with using the old values. This is a
 * common scenario for PATH environment variable. The following configuration will append a 
 * new path to the PATH variable:
 * 
 * PATH: '%PATH%;C:\some\new\path'
 * 
 * or 
 * 
 * PATH: '$PATH:/some/new/path'
 * 
 * New value construction is not limited to the PATH variable, the logic could be used in any
 * variable and the following formats are supported: 
 * 
 * %VAR_NAME% format:
 *  TEST_VAR: "%TEST_VAR%;Some other text"
 * 
 * $VAR_NAME format:
 *  TEST_VAR: "$TEST_VAR;Some other text"
 *
 * ${env.VAR_NAME} format:
 *  TEST_VAR: "${env.TEST_VAR};Some other text"
 * 
 *
 * @param source
 * 		Source environment variables to include.
 * @param valuesToMerge
 * 		Key-Value dictionary to include.
 * @return
 * 		New environment variables dictionary.
 */
export function createEnvValues(
    source: NodeJS.ProcessEnv,
    valuesToMerge: Record<string, string | null>
): NodeJS.ProcessEnv {
    const result = { ...source };
    for (const [k, v] of Object.entries(valuesToMerge)) {
        if (v === null) {
            delete result[k];
        } else {
            result[k] = buildString(
                v,
                result,
                /%([^%]+)%/g,
                /\${env.([^}]+)}/g,
                /\$(\w+)/g
            );
        }
    }
    return result;
}
