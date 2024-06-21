/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { platform } from 'os';

/**
 * This method is providing an automatic operation to including new variables to process.env.
 * Method is not injecting the new variables to current thread, rather it is returning a new
 * object with included parameters.
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
    const findTarget = (obj: any, key: string) => {
        if (platform() === 'win32') {
            return (
                Object.keys(obj).find(
                    (i) =>
                        i.localeCompare(key, undefined, {
                            sensitivity: 'accent',
                        }) === 0
                ) || key
            );
        }
        return key;
    };
    const result = { ...source };
    for (const [key, value] of Object.entries(valuesToMerge)) {
        const target = findTarget(result, key);
        if (value === null) {
            delete result[target];
        } else {
            result[target] = value;
        }
    }
    return result;
}
