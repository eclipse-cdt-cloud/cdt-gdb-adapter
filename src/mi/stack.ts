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
import { MIFrameInfo, MIResponse, MIVariableInfo, MIRegisterValueInfo } from './base';

export interface MIStackInfoDepthResponse extends MIResponse {
    depth: string;
}

export interface MIListRegisterNamesResponse extends MIResponse {
    'register-names': string[];
}

export interface MIListRegisterValuesResponse extends MIResponse {
    'register-values': MIRegisterValueInfo[];
}

export interface MIStackListVariablesResponse extends MIResponse {
    variables: MIVariableInfo[];
}

export function sendStackInfoDepth(
    gdb: GDBBackend,
    params: {
        maxDepth: number;
        threadId?: number;
    }
): Promise<MIStackInfoDepthResponse> {
    let command = '-stack-info-depth';
    if (params.threadId) {
        command += ` --thread ${params.threadId}`;
    }
    if (params.maxDepth) {
        command += ` ${params.maxDepth}`;
    }
    return gdb.sendCommand(command);
}

export function sendStackListFramesRequest(
    gdb: GDBBackend,
    params: {
        noFrameFilters?: boolean;
        lowFrame?: number;
        highFrame?: number;
        threadId?: number;
    }
): Promise<{
    stack: MIFrameInfo[];
}> {
    let command = '-stack-list-frames';
    if (params.threadId) {
        command += ` --thread ${params.threadId}`;
    }
    if (params.noFrameFilters) {
        command += ' -no-frame-filters';
    }
    if (params.lowFrame !== undefined) {
        command += ` ${params.lowFrame}`;
    }
    if (params.highFrame !== undefined) {
        command += ` ${params.highFrame}`;
    }
    return gdb.sendCommand(command);
}

export function sendStackSelectFrame(
    gdb: GDBBackend,
    params: {
        framenum: number;
    }
): Promise<MIResponse> {
    return gdb.sendCommand(`-stack-select-frame ${params.framenum}`);
}

export function sendStackListVariables(
    gdb: GDBBackend,
    params: {
        thread?: number;
        frame?: number;
        printValues: 'no-values' | 'all-values' | 'simple-values';
        noFrameFilters?: boolean;
        skipUnavailable?: boolean;
    }
): Promise<MIStackListVariablesResponse> {
    let command = '-stack-list-variables';
    if (params.noFrameFilters) {
        command += ' --no-frame-filters';
    }
    if (params.skipUnavailable) {
        command += ' --skip-unavailable';
    }
    if (params.thread) {
        command += ` --thread ${params.thread}`;
    }
    if (params.frame) {
        command += ` --frame ${params.frame}`;
    }
    command += ` --${params.printValues}`;

    return gdb.sendCommand(command);
}

export function sendDataListRegisterNames(gdb: GDBBackend, params: {
    regno?: number[];
    threadId?: number;
}): Promise<MIListRegisterNamesResponse> {
    let command = '-data-list-register-names';
    if (params.threadId) {
        command += ` --thread ${params.threadId}`;
    }
    if (params.regno) {
        command += ` ${params.regno}`;       
    }
    //throw new Error('send data register name check!');
    return gdb.sendCommand(command);
}

export function sendDataListRegisterValues(gdb: GDBBackend, params: {
    fmt: string;
    regno?: number[];
    threadId?: number;
}): Promise<MIListRegisterValuesResponse> {
    let command = '-data-list-register-values';
    command += `${params.fmt}`;
    if (params.threadId) {
        command += ` --thread ${params.threadId}`;
    }
    if (params.regno) {
        for (let i = 0; i<params.regno.length; i++) {
            command += ` ${params.regno[i]}`;
        }           
    }
    return gdb.sendCommand(command);
}
