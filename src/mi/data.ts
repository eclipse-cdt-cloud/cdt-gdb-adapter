/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { GDBBackend } from '../GDBBackend';

interface MIDataReadMemoryBytesResponse {
    memory: Array<{
        begin: string;
        end: string;
        offset: string;
        contents: string;
    }>;
}

export function sendDataReadMemoryBytes(gdb: GDBBackend, address: string, size: number, offset: number = 0)
    : Promise<MIDataReadMemoryBytesResponse> {
    return gdb.sendCommand(`-data-read-memory-bytes -o ${offset} "${address}" ${size}`);
}
