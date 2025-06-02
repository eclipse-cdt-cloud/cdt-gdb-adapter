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
import { MIResponse } from './base';

export function sendExecArguments(
    gdb: IGDBBackend,
    params: {
        arguments: string;
    }
): Promise<MIResponse> {
    return gdb.sendCommand(`-exec-arguments ${params.arguments}`);
}

export function sendExecRun(gdb: IGDBBackend) {
    return gdb.sendCommand('-exec-run');
}

export function sendExecContinue(gdb: IGDBBackend, threadId?: number) {
    let command = '-exec-continue';
    if (threadId !== undefined) {
        command += ` --thread ${threadId}`;
    }
    return gdb.sendCommand(command);
}

export function sendExecNext(gdb: IGDBBackend, threadId?: number) {
    let command = '-exec-next';
    if (threadId !== undefined) {
        command += ` --thread ${threadId}`;
    }
    return gdb.sendCommand(command);
}

export function sendExecNextInstruction(gdb: IGDBBackend, threadId?: number) {
    let command = '-exec-next-instruction';
    if (threadId !== undefined) {
        command += ` --thread ${threadId}`;
    }
    return gdb.sendCommand(command);
}

export function sendExecStep(gdb: IGDBBackend, threadId?: number) {
    let command = '-exec-step';
    if (threadId !== undefined) {
        command += ` --thread ${threadId}`;
    }
    return gdb.sendCommand(command);
}

export function sendExecStepInstruction(gdb: IGDBBackend, threadId?: number) {
    let command = '-exec-step-instruction';
    if (threadId !== undefined) {
        command += ` --thread ${threadId}`;
    }
    return gdb.sendCommand(command);
}

export function sendExecFinish(gdb: IGDBBackend, frameRef: FrameReference) {
    let command = '-exec-finish';
    if (frameRef.threadId !== undefined) {
        command += ` --thread ${frameRef.threadId}`;
    }
    if (frameRef.frameId !== undefined) {
        command += ` --frame ${frameRef.frameId}`;
    }
    return gdb.sendCommand(command);
}

export function sendExecInterrupt(gdb: IGDBBackend, threadId?: number) {
    let command = '-exec-interrupt';

    if (threadId !== undefined) {
        command += ` --thread ${threadId}`;
    } else {
        command += ' --all';
    }

    return gdb.sendCommand(command);
}
