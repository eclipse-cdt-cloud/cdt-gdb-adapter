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

/**
 * The generic MI Parser (see MIParser.handleAsyncData) cannot differentiate
 * properly between an array or single result from -break-insert. Therefore
 * we get two possible response types. The cleanupBreakpointResponse
 * normalizes the response.
 */
interface MIBreakInsertResponseInternal extends MIResponse {
    bkpt: MIBreakpointInfo[] | MIBreakpointInfo;
}
export interface MIBreakInsertResponse extends MIResponse {
    bkpt: MIBreakpointInfo;
    /**
     * In cases where GDB inserts multiple breakpoints, the "children"
     * breakpoints will be stored in multiple field.
     */
    multiple?: MIBreakpointInfo[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MIBreakDeleteRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MIBreakDeleteResponse extends MIResponse {}

export interface MIBreakListResponse extends MIResponse {
    BreakpointTable: {
        nr_rows: string;
        nr_cols: string;
        hrd: Array<{
            width: string;
            alignment: string;
            col_name: string;
            colhdr: string;
        }>;
        body: MIBreakpointInfo[];
    };
}

function cleanupBreakpointResponse(
    raw: MIBreakInsertResponseInternal
): MIBreakInsertResponse {
    if (Array.isArray(raw.bkpt)) {
        const bkpt = raw.bkpt[0];
        const multiple = raw.bkpt.slice(1);
        return {
            _class: raw._class,
            bkpt,
            multiple,
        };
    }
    return {
        _class: raw._class,
        bkpt: raw.bkpt,
    };
}

export function breakpointLocation(
    gdb: GDBBackend,
    source: string,
    line = '',
    forInsert = false
): string {
    const version8 = gdb.gdbVersionAtLeast('8.0');
    if (forInsert) {
        if (version8) {
            return `--source ${gdb.standardEscape(source)} --line ${line}`;
        } else {
            // double-escaping/quoting needed for old GDBs
            const location = `"${source}:${line}"`;
            return `${gdb.standardEscape(location, true)}`;
        }
    } else {
        return version8
            ? `-source ${source} -line ${line}`
            : `${source}:${line}`;
    }
}

export function breakpointFunctionLocation(
    gdb: GDBBackend,
    fn: string,
    forInsert = false
): string {
    const version8 = gdb.gdbVersionAtLeast('8.0');
    if (forInsert) {
        return version8 ? `--function ${fn}` : fn;
    } else {
        return version8 ? `-function ${fn}` : fn;
    }
}

export async function sendBreakInsert(
    gdb: GDBBackend,
    request: {
        temporary?: boolean;
        hardware?: boolean;
        pending?: boolean;
        disabled?: boolean;
        tracepoint?: boolean;
        condition?: string;
        ignoreCount?: number;
        threadId?: string;
        source: string;
        line: number;
    }
): Promise<MIBreakInsertResponse> {
    // Todo: lots of options
    const temp = request.temporary ? '-t ' : '';
    const ignore = request.ignoreCount ? `-i ${request.ignoreCount} ` : '';
    const hwBreakpoint = request.hardware ? '-h ' : '';
    const pend = request.pending ? '-f ' : '';
    const location = await breakpointLocation(
        gdb,
        request.source,
        request.line.toString(),
        true
    );
    const command = `-break-insert ${temp}${hwBreakpoint}${ignore}${pend}${location}`;
    const result = await gdb.sendCommand<MIBreakInsertResponseInternal>(
        command
    );
    const clean = cleanupBreakpointResponse(result);
    if (request.condition) {
        await gdb.sendCommand(
            `-break-condition ${clean.bkpt.number} ${request.condition}`
        );
    }

    return clean;
}

export function sendBreakDelete(
    gdb: GDBBackend,
    request: {
        breakpoints: string[];
    }
): Promise<MIBreakDeleteResponse> {
    return gdb.sendCommand(`-break-delete ${request.breakpoints.join(' ')}`);
}

export function sendBreakList(gdb: GDBBackend): Promise<MIBreakListResponse> {
    return gdb.sendCommand('-break-list');
}

export async function sendBreakFunctionInsert(
    gdb: GDBBackend,
    fn: string,
    request?: {
        temporary?: boolean;
        hardware?: boolean;
        pending?: boolean;
    }
): Promise<MIBreakInsertResponse> {
    const temp = request?.temporary ? '-t ' : '';
    const hwBreakpoint = request?.hardware ? '-h ' : '';
    const pend = request?.pending ? '-f ' : '';
    const location = await breakpointFunctionLocation(gdb, fn, true);
    const command = `-break-insert ${temp}${hwBreakpoint}${pend}${location}`;
    const result = await gdb.sendCommand<MIBreakInsertResponseInternal>(
        command
    );
    const clean = cleanupBreakpointResponse(result);
    return clean;
}
