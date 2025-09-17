/*********************************************************************
 * Copyright (c) 2025 QNX Software Systems, Arm Limited and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { IGDBBackend } from '../types/gdb';

export interface MIDebugSymbol {
    line: string;
    name: string;
    type: string;
    description: string;
}

export interface MINonDebugSymbol {
    address: string;
    name: string;
}

export interface MISymbolInfoDebug {
    filename: string;
    fullname: string;
    symbols: MIDebugSymbol[];
}

export interface MISymbolInfoResponse {
    symbols: {
        debug: MISymbolInfoDebug[];
        nondebug: MINonDebugSymbol[];
    };
}

export function sendSymbolInfoVars(
    gdb: IGDBBackend,
    params?: {
        name?: string;
        type?: string;
        max_result?: string;
        non_debug?: boolean;
    }
): Promise<MISymbolInfoResponse> {
    let command = '-symbol-info-variables';
    if (params) {
        if (params.name) {
            command += ` --name ${params.name}`;
        }
        if (params.type) {
            command += ` --type ${params.type}`;
        }
        if (params.max_result) {
            command += ` --max-result ${params.max_result}`;
        }
        if (params.non_debug) {
            command += ' --include-nondebug';
        }
    }
    return gdb.sendCommand(command);
}

export function sendSymbolInfoFunctions(
    gdb: IGDBBackend,
    params?: {
        name?: string;
        type?: string;
        max_result?: string;
        non_debug?: boolean;
    }
): Promise<MISymbolInfoResponse> {
    let command = '-symbol-info-functions';
    if (params) {
        if (params.name) {
            command += ` --name ${params.name}`;
        }
        if (params.type) {
            command += ` --type ${params.type}`;
        }
        if (params.max_result) {
            command += ` --max-result ${params.max_result}`;
        }
        if (params.non_debug) {
            command += ' --include-nondebug';
        }
    }
    return gdb.sendCommand(command);
}
