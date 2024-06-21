/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

// Rewrite the argument escaping whitespace, quotes and backslash
export function standardEscape(arg: string, needQuotes = true): string {
    let result = '';
    for (const char of arg) {
        if (char === '\\' || char === '"') {
            result += '\\';
        }
        if (char == ' ') {
            needQuotes = true;
        }
        result += char;
    }
    if (needQuotes) {
        result = `"${result}"`;
    }
    return result;
}
