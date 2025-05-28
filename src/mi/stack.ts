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
import { FrameReference } from '../types/session';
import { MIFrameInfo, MIResponse, MIVariableInfo } from './base';

export interface MIStackInfoDepthResponse extends MIResponse {
    depth: string;
}

export interface MIStackListVariablesResponse extends MIResponse {
    variables: MIVariableInfo[];
}

export function sendStackInfoDepth(
    gdb: IGDBBackend,
    params: {
        maxDepth: number;
        threadId?: number;
    }
): Promise<MIStackInfoDepthResponse> {
    let command = '-stack-info-depth';
    if (params.threadId !== undefined) {
        command += ` --thread ${params.threadId}`;
    }
    if (params.maxDepth) {
        command += ` ${params.maxDepth}`;
    }
    return gdb.sendCommand(command);
}

export function sendStackListFramesRequest(
    gdb: IGDBBackend,
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
    if (params.threadId !== undefined) {
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
    gdb: IGDBBackend,
    params: {
        frameNum: number;
    }
): Promise<MIResponse> {
    return gdb.sendCommand(`-stack-select-frame ${params.frameNum}`);
}

export function sendStackListVariables(
    gdb: IGDBBackend,
    params: {
        frameRef: FrameReference | undefined;
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
    if (params.frameRef?.threadId !== undefined) {
        command += ` --thread ${params.frameRef.threadId}`;
    }
    if (params.frameRef?.frameId !== undefined) {
        command += ` --frame ${params.frameRef.frameId}`;
    }
    command += ` --${params.printValues}`;

    return gdb.sendCommand(command);
}
