/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { IGDBBackend } from '../types/gdb';
import { standardEscape } from '../util/standardEscape';
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MIBreakDeleteRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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

export type MIBreakpointMode = 'hardware' | 'software';

export interface MIBreakpointInsertOptions {
    temporary?: boolean;

    /**
     * The `mode` property is prioritised over the `hardware` property.
     * If `mode` is defined, then the information in the `hardware` flag
     * is ignored during the insert breakpoint operation.
     *
     * The value of the mode wil be:
     *
     * - `'hardware'`: If user explicitly selects the breakpoint mode as
     *   'Hardware Breakpoint' at the user interface.
     * - `'software'`: If user explicitly selects the breakpoint mode as
     *    'Software Breakpoint' at the user interface.
     * - `undefined`: If user didn't make an explicitly breakpoint mode
     *   selection, in this case the `hardware` flag will be used.
     */
    mode?: MIBreakpointMode;

    /**
     * @deprecated The `hardware` property will be removed soon. Please
     * use the `mode` property instead of the `hardware`.
     */
    hardware?: boolean;
    pending?: boolean;
    disabled?: boolean;
    tracepoint?: boolean;
    condition?: string;
    ignoreCount?: number;
    threadId?: string;
}

export interface MIBreakpointLocation {
    locationType?: 'source' | 'function';
    source?: string;
    line?: string;
    fn?: string;
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

export function sourceBreakpointLocation(
    gdb: IGDBBackend,
    source: string,
    line = '',
    forInsert = false
): string {
    const version8 = gdb.gdbVersionAtLeast('8.0');
    if (forInsert) {
        if (version8) {
            return `--source ${standardEscape(source)} --line ${line}`;
        } else {
            // double-escaping/quoting needed for old GDBs
            const location = `"${source}:${line}"`;
            return `${standardEscape(location, true)}`;
        }
    } else {
        return version8
            ? `-source ${source} -line ${line}`
            : `${source}:${line}`;
    }
}

export function functionBreakpointLocation(
    gdb: IGDBBackend,
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

export async function sendBreakpointInsert(
    gdb: IGDBBackend,
    location: string,
    options?: MIBreakpointInsertOptions
): Promise<MIBreakInsertResponse> {
    // Todo: lots of options
    const temp = options?.temporary ? '-t ' : '';
    const ignore = options?.ignoreCount ? `-i ${options?.ignoreCount} ` : '';

    // prefers options.mode information over options.hardware information.
    const isHwBreakpoint = options?.mode
        ? options.mode === 'hardware'
        : !!options?.hardware;
    const hwBreakpoint = isHwBreakpoint ? '-h ' : '';
    const pend = options?.pending ? '-f ' : '';
    const command = `-break-insert ${temp}${hwBreakpoint}${ignore}${pend}${location}`;
    const result =
        await gdb.sendCommand<MIBreakInsertResponseInternal>(command);
    const clean = cleanupBreakpointResponse(result);
    if (options?.condition) {
        await gdb.sendCommand(
            `-break-condition ${clean.bkpt.number} ${options.condition}`
        );
    }

    return clean;
}

export function sendBreakDelete(
    gdb: IGDBBackend,
    request: {
        breakpoints: string[];
    }
): Promise<MIBreakDeleteResponse> {
    return gdb.sendCommand(`-break-delete ${request.breakpoints.join(' ')}`);
}

export function sendBreakList(gdb: IGDBBackend): Promise<MIBreakListResponse> {
    return gdb.sendCommand('-break-list');
}

export async function sendFunctionBreakpointInsert(
    gdb: IGDBBackend,
    fn: string,
    options?: MIBreakpointInsertOptions
): Promise<MIBreakInsertResponse> {
    const location = await functionBreakpointLocation(gdb, fn, true);
    return sendBreakpointInsert(gdb, location, options);
}

export async function sendSourceBreakpointInsert(
    gdb: IGDBBackend,
    source: string,
    line?: string,
    options?: MIBreakpointInsertOptions
): Promise<MIBreakInsertResponse> {
    const location = await sourceBreakpointLocation(gdb, source, line, true);
    return sendBreakpointInsert(gdb, location, options);
}
