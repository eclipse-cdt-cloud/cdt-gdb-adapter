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
import { MIResponse } from './base';

export function sendExecArguments(gdb: GDBBackend, params: {
    arguments: string;
}): Promise<MIResponse> {
    return gdb.sendCommand(`-exec-arguments ${params.arguments}`);
}

export function sendExecRun(gdb: GDBBackend) {
    return gdb.sendCommand('-exec-run');
}

export function sendExecContinue(gdb: GDBBackend) {
    return gdb.sendCommand('-exec-continue');
}

export function sendExecNext(gdb: GDBBackend) {
    return gdb.sendCommand('-exec-next');
}

export function sendExecStep(gdb: GDBBackend) {
    return gdb.sendCommand('-exec-step');
}

export function sendExecFinish(gdb: GDBBackend) {
    return gdb.sendCommand('-exec-finish');
}
