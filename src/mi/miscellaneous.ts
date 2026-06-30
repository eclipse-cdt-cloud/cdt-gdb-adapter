/*********************************************************************
 * Copyright (c) 2026 Arm Limited and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { IGDBBackend } from '../types/gdb';

export interface MICompletion {
    completion?: string;
    matches: string[];
    max_completions_reached: string;
}

export async function sendCompletions(
    gdb: IGDBBackend,
    command: string
): Promise<MICompletion> {
    const miCommand = `-complete "${command.replace(/(["\\])/g, '\\$1')}"`;
    return gdb.sendCommand<MICompletion>(miCommand);
}
