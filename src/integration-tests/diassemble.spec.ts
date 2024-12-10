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
import { CdtDebugClient } from './debugClient';
import { fillDefaults, standardBeforeEach, testProgramsDir } from './utils';
import { assert } from 'sinon';

describe('Disassembly Test Suite', function () {
    let dc: CdtDebugClient;
    let frame: DebugProtocol.StackFrame;
    const disProgram = path.join(testProgramsDir, 'disassemble');
    const disSrc = path.join(testProgramsDir, 'disassemble.c');

    const expectsGeneralDisassemble = (
        disassemble: DebugProtocol.DisassembleResponse,
        length: number,
        ignoreEmptyInstructions?: boolean
    ) => {
        expect(disassemble).not.eq(undefined);
        expect(disassemble.body).not.eq(undefined);
        if (disassemble.body) {
            const instructions = disassemble.body.instructions;
            expect(instructions).to.have.lengthOf(length);
            // the contents of the instructions are platform dependent, so instead
            // make sure we have read fully
            for (const i of instructions) {
                expect(i.address).to.have.lengthOf.greaterThan(0);
                expect(i.instruction).to.have.lengthOf.greaterThan(0);
                if (!ignoreEmptyInstructions) {
                    expect(i.instructionBytes).to.have.lengthOf.greaterThan(0);
                }
            }
        }
    };

    beforeEach(async function () {
        dc = await standardBeforeEach();

        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, {
                program: disProgram,
            }),
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

        expectsGeneralDisassemble(disassemble, 100);
    });

    it('can disassemble with no source references', async function () {
        // In this case we attempt to read from where there is no source,
        // GDB returns data in a different format in that case
        const disassemble = (await dc.send('disassemble', {
            memoryReference: 'main+1000',
            instructionCount: 100,
        })) as DebugProtocol.DisassembleResponse;

        expectsGeneralDisassemble(disassemble, 100);
    });

    it('can disassemble with negative offsets', async function () {
        const disassemble = (await dc.send('disassemble', {
            memoryReference: 'main',
            instructionOffset: -20,
            instructionCount: 20,
        } as DebugProtocol.DisassembleArguments)) as DebugProtocol.DisassembleResponse;

        expectsGeneralDisassemble(disassemble, 20, true);
    });

    it('send error response handle on empty memory reference', async function () {
        try {
            await dc.send('disassemble', {
                memoryReference: '',
                instructionOffset: -20,
                instructionCount: 20,
            } as DebugProtocol.DisassembleArguments);
            assert.fail('Should throw error!');
        } catch (e) {
            expect(e).to.be.deep.equal(
                new Error('Target memory reference is not specified!')
            );
        }
    });

    it('can disassemble with correct boundries', async function () {
        const get = (
            disassemble: DebugProtocol.DisassembleResponse,
            offset: number
        ) => {
            const instruction = disassemble.body?.instructions[offset];
            expect(instruction).not.eq(undefined);
            // Instruction undefined already checked.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return instruction!;
        };

        const expectsInstructionEquals = (
            instruction1: DebugProtocol.DisassembledInstruction,
            instruction2: DebugProtocol.DisassembledInstruction,
            message?: string
        ) => {
            expect(instruction1.address).to.eq(instruction2.address, message);
        };

        const disassembleLower = (await dc.send('disassemble', {
            memoryReference: 'main',
            instructionOffset: -20,
            instructionCount: 20,
        } as DebugProtocol.DisassembleArguments)) as DebugProtocol.DisassembleResponse;
        const disassembleMiddle = (await dc.send('disassemble', {
            memoryReference: 'main',
            instructionOffset: -10,
            instructionCount: 20,
        } as DebugProtocol.DisassembleArguments)) as DebugProtocol.DisassembleResponse;
        const disassembleHigher = (await dc.send('disassemble', {
            memoryReference: 'main',
            instructionOffset: 0,
            instructionCount: 20,
        } as DebugProtocol.DisassembleArguments)) as DebugProtocol.DisassembleResponse;

        expectsGeneralDisassemble(disassembleLower, 20, true);
        expectsGeneralDisassemble(disassembleMiddle, 20, true);
        expectsGeneralDisassemble(disassembleHigher, 20, true);

        // Current implementation have known edge cases, possibly instruction misaligning while
        // handling the negative offsets, please refer to the discussion at the following link:
        // https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/341#discussion_r1857422980
        expectsInstructionEquals(
            get(disassembleLower, 15),
            get(disassembleMiddle, 5),
            'lower[15] should be same with middle[5]'
        );

        expectsInstructionEquals(
            get(disassembleMiddle, 15),
            get(disassembleHigher, 5),
            'middle[15] should be same with higher[5]'
        );
    });

    it('return error at bad address', async function () {
        try {
            await dc.send('disassemble', {
                memoryReference: '0x0',
                instructionCount: 10,
            } as DebugProtocol.DisassembleArguments);
            assert.fail('Should throw error!');
        } catch (e) {
            expect(e).to.be.deep.equal(
                new Error('Cannot access memory at address 0x0')
            );
        }
    });
});
