/*********************************************************************
 * Copyright (c) 2018, 2022 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as path from 'path';
import { DebugProtocol } from '@vscode/debugprotocol/lib/debugProtocol';
import {
    base64ToHex,
    hexToBase64,
    LaunchRequestArguments,
} from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import {
    expectRejection,
    gdbPath,
    openGdbConsole,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('Memory Test Suite', function () {
    let dc: CdtDebugClient;
    let frame: DebugProtocol.StackFrame;
    const memProgram = path.join(testProgramsDir, 'mem');
    const memSrc = path.join(testProgramsDir, 'mem.c');

    beforeEach(async function () {
        dc = await standardBeforeEach();

        await dc.hitBreakpoint(
            {
                gdb: gdbPath,
                program: memProgram,
                openGdbConsole,
            } as LaunchRequestArguments,
            {
                path: memSrc,
                line: 12,
            }
        );
        const threads = await dc.threadsRequest();
        // On windows additional threads can exist to handle signals, therefore find
        // the real thread & frame running the user code. The other thread will
        // normally be running code from ntdll or similar.
        loop_threads: for (const thread of threads.body.threads) {
            const stack = await dc.stackTraceRequest({ threadId: thread.id });
            if (stack.body.stackFrames.length >= 1) {
                for (const f of stack.body.stackFrames) {
                    if (f.source && f.source.name === 'mem.c') {
                        frame = f;
                        break loop_threads;
                    }
                }
            }
        }
        // Make sure we found the expected frame
        expect(frame).not.eq(undefined);
    });

    afterEach(async function () {
        await dc.stop();
    });

    /**
     * Verify that `resp` contains the bytes `expectedBytes` and the
     * `expectedAddress` start address.
     *
     * `expectedAddress` should be an hexadecimal string, with the leading 0x.
     */
    function verifyReadMemoryResponse(
        resp: DebugProtocol.ReadMemoryResponse,
        expectedBytes: string,
        expectedAddress: number
    ) {
        expect(resp.body?.data).eq(hexToBase64(expectedBytes));
        expect(resp.body?.address).match(/^0x[0-9a-fA-F]+$/);
        if (resp.body?.address) {
            const actualAddress = parseInt(resp.body?.address);
            expect(actualAddress).eq(expectedAddress);
        }
    }

    // Test reading memory
    it('can read memory', async function () {
        // Get the address of the array.
        const addrOfArrayResp = await dc.evaluateRequest({
            expression: '&array',
            frameId: frame.id,
        });
        const addrOfArray = parseInt(addrOfArrayResp.body.result, 16);

        let mem = await dc.readMemoryRequest({
            memoryReference: '0x' + addrOfArray.toString(16),
            count: 10,
        });

        verifyReadMemoryResponse(mem, 'f1efd4fd7248450c2d13', addrOfArray);

        mem = await dc.readMemoryRequest({
            memoryReference: '&array[3 + 2]',
            count: 10,
        });

        verifyReadMemoryResponse(mem, '48450c2d1374d6f612dc', addrOfArray + 5);

        mem = await dc.readMemoryRequest({
            memoryReference: 'parray',
            count: 10,
        });

        verifyReadMemoryResponse(mem, 'f1efd4fd7248450c2d13', addrOfArray);

        mem = await dc.readMemoryRequest({
            memoryReference: 'parray',
            count: 10,
            offset: 5,
        });

        verifyReadMemoryResponse(mem, '48450c2d1374d6f612dc', addrOfArray + 5);

        mem = await dc.readMemoryRequest({
            memoryReference: 'parray',
            count: 0,
        });

        // the spec isn't clear on what exactly can be retruned if count == 0
        // so the following works with VSCode - simply having no body
        expect(mem.body).is.undefined;

        mem = await dc.readMemoryRequest({
            memoryReference: 'parray',
            count: 0,
            offset: 5,
        });

        expect(mem.body).is.undefined;
    });

    it('handles unable to read memory', async function () {
        // This test will only work for targets for which address 0 is not readable, which is good enough for now.
        const err = await expectRejection(
            dc.readMemoryRequest({
                memoryReference: '0',
                count: 10,
            })
        );
        expect(err.message).contains('Unable to read memory');
    });

    it('can read memory with offset', async function () {
        const addrOfArrayResp = await dc.evaluateRequest({
            expression: '&array',
            frameId: frame.id,
        });
        const addrOfArray = parseInt(addrOfArrayResp.body.result, 16);

        // Test positive offset
        let offset = 5;
        let mem = await dc.readMemoryRequest({
            memoryReference: '&array',
            count: 5,
            offset,
        });

        verifyReadMemoryResponse(mem, '48450c2d13', addrOfArray + offset);

        // Test negative offset
        offset = -5;
        mem = await dc.readMemoryRequest({
            memoryReference: `array + ${-offset}`,
            count: 10,
            offset,
        });

        verifyReadMemoryResponse(mem, 'f1efd4fd7248450c2d13', addrOfArray);
    });

    const newValue = '123456789abcdef01234';
    const writeArguments: DebugProtocol.WriteMemoryArguments = {
        data: hexToBase64(newValue),
        memoryReference: '&array',
    };

    it('can write memory', async function () {
        const addrOfArray = parseInt(
            (
                await dc.evaluateRequest({
                    expression: '&array',
                    frameId: frame.id,
                })
            ).body.result
        );
        await dc.writeMemoryRequest(writeArguments);
        const memory = await dc.readMemoryRequest({
            memoryReference: '&array',
            count: 10,
            offset: 0,
        });
        verifyReadMemoryResponse(memory, newValue, addrOfArray);
    });

    it('fails when trying to write to read-only memory', async function () {
        const addrOfArray = parseInt(
            (
                await dc.evaluateRequest({
                    expression: '&array',
                    frameId: frame.id,
                })
            ).body.result
        );
        await dc.send('cdt-gdb-tests/executeCommand', {
            command: `-interpreter-exec console "mem ${addrOfArray} ${
                addrOfArray + 10
            } ro"`,
        });
        const error = await expectRejection(
            dc.writeMemoryRequest(writeArguments)
        );

        expect(error.message).contains('Cannot access memory');
    });

    it('Converts between hex and base64 without loss', () => {
        const normalize = (original: string): string => original.toLowerCase();

        const hexToBase64TestCases = [
            'fe',
            '00',
            'fedc',
            '00FE',
            '29348798237abfeCCD',
        ];

        const base64ToHexTestCases = [
            'bGlnaHQgd29yay4=',
            'bGlnaHQgd29yaw==',
            'abc',
            'abcd',
        ];

        for (const test of hexToBase64TestCases) {
            expect(normalize(base64ToHex(hexToBase64(test)))).equal(
                normalize(test)
            );
        }

        for (const test of base64ToHexTestCases) {
            expect(hexToBase64(base64ToHex(test))).equal(
                test + '='.repeat((4 - (test.length % 4)) % 4)
            );
        }
    });

    it('Throws an error if it detects ill-formed input', () => {
        const hexToBase64TextCases = ['f', 'fED', '0fedc', 'zyxd'];

        const base64ToHexTestCases = [
            'ab',
            'a',
            'a=',
            'abcde',
            '!A==',
            '#$*@^',
            '234bGeuTHEUDReuhr',
        ];

        for (const test of hexToBase64TextCases) {
            expect(() => hexToBase64(test)).throws();
        }

        for (const test of base64ToHexTestCases) {
            expect(() => base64ToHex(test)).throws();
        }
    });
});
