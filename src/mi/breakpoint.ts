/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { GDBBackend } from '../GDBBackend';
import { MIBreakpointInfo, MIResponse } from './base';

export interface MIBreakInsertResponse extends MIResponse {
    bkpt: MIBreakpointInfo;
}

export interface MIBreakDeleteRequest {

}

export interface MIBreakDeleteResponse extends MIResponse {
}

export interface MIBreakListResponse extends MIResponse {
    BreakpointTable: {
        nr_rows: string,
        nr_cols: string,
        hrd: Array<{
            width: string,
            alignment: string,
            col_name: string,
            colhdr: string,
        }>;
        body: MIBreakpointInfo[]
    };
}

export async function sendBreakInsert(gdb: GDBBackend, request: {
    temporary?: boolean;
    hardware?: boolean;
    pending?: boolean;
    disabled?: boolean;
    tracepoint?: boolean;
    condition?: string;
    ignoreCount?: number;
    threadId?: string;
    location: string;
}): Promise<MIBreakInsertResponse> {
    // Todo: lots of options
    const escapedLocation = gdb.standardEscape(request.location);
    const result = await gdb.sendCommand<MIBreakInsertResponse>(`-break-insert ${escapedLocation}`);

    if (request.condition) {
        await gdb.sendCommand(`-break-condition ${result.bkpt.number} ${request.condition}`);
    }

    return result;
}

export function sendBreakDelete(gdb: GDBBackend, request: {
    breakpoints: string[];
}): Promise<MIBreakDeleteResponse> {
    return gdb.sendCommand(`-break-delete ${request.breakpoints.join(' ')}`);
}

export function sendBreakList(gdb: GDBBackend): Promise<MIBreakListResponse> {
    return gdb.sendCommand('-break-list');
}
