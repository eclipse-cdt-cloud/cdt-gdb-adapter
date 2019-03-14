/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as path from 'path';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { LaunchRequestArguments, MemoryResponse } from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import { expectRejection, gdbPath, openGdbConsole, standardBefore, standardBeforeEach, testProgramsDir } from './utils';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions

let dc: CdtDebugClient;
let frame: DebugProtocol.StackFrame;
const memProgram = path.join(testProgramsDir, 'mem');
const memSrc = path.join(testProgramsDir, 'mem.c');

before(standardBefore);

beforeEach(async function() {
    dc = await standardBeforeEach();

    await dc.hitBreakpoint({
        gdb: gdbPath,
        program: memProgram,
        openGdbConsole,
    } as LaunchRequestArguments, {
        path: memSrc,
        line: 12,
    });
    const threads = await dc.threadsRequest();
    expect(threads.body.threads.length).to.equal(1);
    const stack = await dc.stackTraceRequest({ threadId: threads.body.threads[0].id });
    expect(stack.body.stackFrames.length).to.equal(1);
    frame = stack.body.stackFrames[0];
});

afterEach(async function() {
    await dc.stop();
});

/**
 * Verify that `resp` contains the bytes `expectedBytes` and the
 * `expectedAddress` start address.
 *
 * `expectedAddress` should be an hexadecimal string, with the leading 0x.
 */
function verifyMemoryReadResult(resp: MemoryResponse, expectedBytes: string, expectedAddress: number) {
    expect(resp.body.data).eq(expectedBytes);
    expect(resp.body.address).match(/^0x[0-9a-fA-F]+$/);

    const actualAddress = parseInt(resp.body.address, 16);
    expect(actualAddress).eq(expectedAddress);
}

describe('Memory Test Suite', function() {
    // Test reading memory using cdt-gdb-adapter's extension request.
    it('can read memory', async function() {
        // Get the address of the array.
        const addrOfArrayResp = await dc.evaluateRequest({ expression: '&array', frameId: frame.id });
        const addrOfArray = parseInt(addrOfArrayResp.body.result, 16);

        let mem = (await dc.send('cdt-gdb-adapter/Memory', {
            address: '0x' + addrOfArray.toString(16),
            length: 10,
        })) as MemoryResponse;

        verifyMemoryReadResult(mem, 'f1efd4fd7248450c2d13', addrOfArray);

        mem = (await dc.send('cdt-gdb-adapter/Memory', {
            address: '&array[3 + 2]',
            length: 10,
        })) as MemoryResponse;

        verifyMemoryReadResult(mem, '48450c2d1374d6f612dc', addrOfArray + 5);

        mem = (await dc.send('cdt-gdb-adapter/Memory', {
            address: 'parray',
            length: 10,
        })) as MemoryResponse;

        verifyMemoryReadResult(mem, 'f1efd4fd7248450c2d13', addrOfArray);
    });

    it('handles unable to read memory', async function() {
        // This test will only work for targets for which address 0 is not readable, which is good enough for now.
        const err = await expectRejection(dc.send('cdt-gdb-adapter/Memory', {
            address: '0',
            length: 10,
        }));
        expect(err.message).contains('Unable to read memory');
    });

    it('can read memory with offset', async function() {
        const addrOfArrayResp = await dc.evaluateRequest({ expression: '&array', frameId: frame.id });
        const addrOfArray = parseInt(addrOfArrayResp.body.result, 16);

        // Test positive offset
        let offset = 5;
        let mem = (await dc.send('cdt-gdb-adapter/Memory', {
            address: '&array',
            length: 5,
            offset,
        })) as MemoryResponse;

        verifyMemoryReadResult(mem, '48450c2d13', addrOfArray + offset);

        // Test negative offset
        offset = -5;
        mem = (await dc.send('cdt-gdb-adapter/Memory', {
            address: `array + ${-offset}`,
            length: 10,
            offset,
        })) as MemoryResponse;

        verifyMemoryReadResult(mem, 'f1efd4fd7248450c2d13', addrOfArray);
    });
});
