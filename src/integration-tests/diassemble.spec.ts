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
import { DebugProtocol } from '@vscode/debugprotocol/lib/debugProtocol';
import { LaunchRequestArguments } from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import {
    gdbPath,
    openGdbConsole,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('Disassembly Test Suite', function () {
    let dc: CdtDebugClient;
    let frame: DebugProtocol.StackFrame;
    const disProgram = path.join(testProgramsDir, 'disassemble');
    const disSrc = path.join(testProgramsDir, 'disassemble.c');

    beforeEach(async function () {
        dc = await standardBeforeEach();

        await dc.hitBreakpoint(
            {
                gdb: gdbPath,
                program: disProgram,
                openGdbConsole,
            } as LaunchRequestArguments,
            {
                path: disSrc,
                line: 2,
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
                    if (f.source && f.source.name === 'disassemble.c') {
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

    it('can disassemble', async function () {
        const disassemble = (await dc.send('disassemble', {
            memoryReference: 'main',
            instructionCount: 100,
        })) as DebugProtocol.DisassembleResponse;
        expect(disassemble).not.eq(undefined);
        expect(disassemble.body).not.eq(undefined);
        if (disassemble.body) {
            const instructions = disassemble.body.instructions;
            expect(instructions).to.have.lengthOf(100);
            // the contents of the instructions are platform dependent, so instead
            // make sure we have read fully
            for (const i of instructions) {
                expect(i.address).to.have.lengthOf.greaterThan(0);
                expect(i.instructionBytes).to.have.lengthOf.greaterThan(0);
                expect(i.instruction).to.have.lengthOf.greaterThan(0);
            }
        }
    });

    it('can disassemble with no source references', async function () {
        // In this case we attempt to read from where there is no source,
        // GDB returns data in a different format in that case
        const disassemble = (await dc.send('disassemble', {
            memoryReference: 'main+1000',
            instructionCount: 100,
        })) as DebugProtocol.DisassembleResponse;
        expect(disassemble).not.eq(undefined);
        expect(disassemble.body).not.eq(undefined);
        if (disassemble.body) {
            const instructions = disassemble.body.instructions;
            expect(instructions).to.have.lengthOf(100);
            // the contents of the instructions are platform dependent, so instead
            // make sure we have read fully
            for (const i of instructions) {
                expect(i.address).to.have.lengthOf.greaterThan(0);
                expect(i.instructionBytes).to.have.lengthOf.greaterThan(0);
                expect(i.instruction).to.have.lengthOf.greaterThan(0);
            }
        }
    });

    it('can handle disassemble at bad address', async function () {
        const disassemble = (await dc.send('disassemble', {
            memoryReference: '0x0',
            instructionCount: 10,
        })) as DebugProtocol.DisassembleResponse;
        expect(disassemble).not.eq(undefined);
        expect(disassemble.body).not.eq(undefined);
        if (disassemble.body) {
            const instructions = disassemble.body.instructions;
            expect(instructions).to.have.lengthOf(10);
            // the contens of the instructions are platform dependent, so instead
            // make sure we have read fully
            for (const i of instructions) {
                expect(i.address).to.have.lengthOf.greaterThan(0);
                expect(i.instruction).to.have.lengthOf.greaterThan(0);
                expect(i.instructionBytes).eq(undefined);
            }
        }
    });
});
