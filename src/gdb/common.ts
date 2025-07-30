/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { DebugProtocol } from '@vscode/debugprotocol';

export class ThreadWithStatus implements DebugProtocol.Thread {
    id: number;
    name: string;
    running: boolean;
    lastRunToken: string | undefined;
    constructor(id: number, name: string, running: boolean) {
        this.id = id;
        this.name = name;
        this.running = running;
    }
}

export function hexToBase64(hex: string): string {
    // The buffer will ignore incomplete bytes (unpaired digits), so we need to catch that early
    if (hex.length % 2 !== 0) {
        throw new Error('Received memory with incomplete bytes.');
    }
    const base64 = Buffer.from(hex, 'hex').toString('base64');
    // If the hex input includes characters that are not hex digits, Buffer.from() will return an empty buffer, and the base64 string will be empty.
    if (base64.length === 0 && hex.length !== 0) {
        throw new Error('Received ill-formed hex input: ' + hex);
    }
    return base64;
}

export function base64ToHex(base64: string): string {
    const buffer = Buffer.from(base64, 'base64');
    // The caller likely passed in a value that left dangling bits that couldn't be assigned to a full byte and so
    // were ignored by Buffer. We can't be sure what the client thought they wanted to do with those extra bits, so fail here.
    if (buffer.length === 0 || !buffer.toString('base64').startsWith(base64)) {
        throw new Error('Received ill-formed base64 input: ' + base64);
    }
    return buffer.toString('hex');
}
