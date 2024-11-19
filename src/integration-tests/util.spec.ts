/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { compareVersions } from '../util/compareVersions';
import { parseGdbVersionOutput } from '../util/parseGdbVersionOutput';
import { createEnvValues } from '../util/createEnvValues';
import { expect } from 'chai';
import * as os from 'os';
import { calculateMemoryOffset } from '../util/calculateMemoryOffset';
import { MIDataDisassembleAsmInsn } from '../mi';
import { DebugProtocol } from '@vscode/debugprotocol';
import {
    getDisassembledInstruction,
    getEmptyInstructions,
} from '../util/disassembly';

describe('util', async () => {
    it('compareVersions', async () => {
        expect(compareVersions('1', '2')).to.eq(-1);
        expect(compareVersions('2', '1')).to.eq(1);
        expect(compareVersions('11', '2')).to.eq(1);
        expect(compareVersions('2', '11')).to.eq(-1);
        expect(compareVersions('1.0', '2.0')).to.eq(-1);
        expect(compareVersions('2.0', '1.0')).to.eq(1);
        expect(compareVersions('1.0', '1.0')).to.eq(0);
        expect(compareVersions('1', '1.1')).to.eq(-1);
        expect(compareVersions('1', '0.1')).to.eq(1);
        expect(compareVersions('1.1', '1')).to.eq(1);
        expect(compareVersions('0.1', '1')).to.eq(-1);
        expect(compareVersions('1.0', '1')).to.eq(0);
        expect(compareVersions('1', '1.0')).to.eq(0);
        expect(compareVersions('1.asdf.0', '1.cdef.0')).to.eq(0);
        expect(compareVersions('1.asdf', '1')).to.eq(0);
        expect(compareVersions('1', '1.asdf')).to.eq(0);
    });
    it('parseGdbOutput', async () => {
        expect(parseGdbVersionOutput('GNU gdb 6.8.50.20080730')).to.eq(
            '6.8.50.20080730'
        );
        expect(
            parseGdbVersionOutput('GNU gdb (GDB) 6.8.50.20080730-cvs')
        ).to.eq('6.8.50.20080730');
        expect(
            parseGdbVersionOutput(
                'GNU gdb (Ericsson GDB 1.0-10) 6.8.50.20080730-cvs'
            )
        ).to.eq('6.8.50.20080730');
        expect(
            parseGdbVersionOutput('GNU gdb (GDB) Fedora (7.0-3.fc12)')
        ).to.eq('7.0');
        expect(parseGdbVersionOutput('GNU gdb 7.0')).to.eq('7.0');
        expect(parseGdbVersionOutput('GNU gdb Fedora (6.8-27.el5)')).to.eq(
            '6.8'
        );
        expect(
            parseGdbVersionOutput('GNU gdb Red Hat Linux (6.3.0.0-1.162.el4rh)')
        ).to.eq('6.3.0.0');
        expect(
            parseGdbVersionOutput(
                'GNU gdb (GDB) STMicroelectronics/Linux Base 7.4-71 [build Mar  1 2013]'
            )
        ).to.eq('7.4');
    });
});

describe('createEnvValues', () => {
    const initialENV = {
        VAR1: 'TEST1',
        VAR2: 'TEST2',
    };

    it('should not change source', () => {
        const copyOfInitialValues = {
            ...initialENV,
        };
        const valuesToInject = {
            VAR3: 'TEST3',
        };
        const result = createEnvValues(copyOfInitialValues, valuesToInject);

        expect(initialENV).to.deep.equals(copyOfInitialValues);
        expect(result).to.deep.equals({ ...initialENV, ...valuesToInject });
    });
    it('should injects basic values', () => {
        const valuesToInject = {
            VAR4: 'TEST4',
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({ ...initialENV, ...valuesToInject });
    });
    it('should not change existing case', function () {
        if (os.platform() !== 'win32') {
            // Skip the test if not Windows (Run only for Windows)
            this.skip();
        }
        const initialENV = {
            VAR1: 'TEST1',
        };
        const valuesToInject = {
            var1: 'TEST2',
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({ VAR1: 'TEST2' });
    });
    it('should inject both variable name cases', function () {
        if (os.platform() === 'win32') {
            // Skip the test for Windows
            this.skip();
        }
        const initialENV = {
            VAR1: 'TEST1',
        };
        const valuesToInject = {
            var1: 'TEST2',
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({ VAR1: 'TEST1', var1: 'TEST2' });
    });
    it('should perform delete operations', () => {
        const sourceENV = {
            VAR1: 'TEST1',
            VAR2: 'TEST2',
            VAR3: 'TEST3',
            VAR4: 'TEST4',
        };

        const expectedResult = {
            VAR2: 'TEST2',
            VAR4: 'TEST4',
        };
        const valuesToInject = {
            VAR1: null,
            VAR3: null,
        };

        const result = createEnvValues(sourceENV, valuesToInject);

        expect(result).to.deep.equals(expectedResult);
    });
});

describe('calculateMemoryOffset', () => {
    it('should expect to calculate basic operations', () => {
        expect(calculateMemoryOffset('0x0000ff00', 2)).to.eq('0x0000ff02');
        expect(calculateMemoryOffset('0x0000ff00', 8)).to.eq('0x0000ff08');
        expect(calculateMemoryOffset('0x0000ff00', 64)).to.eq('0x0000ff40');
        expect(calculateMemoryOffset('0x0000ff00', -2)).to.eq('0x0000fefe');
        expect(calculateMemoryOffset('0x0000ff00', -8)).to.eq('0x0000fef8');
        expect(calculateMemoryOffset('0x0000ff00', -64)).to.eq('0x0000fec0');
    });

    it('should expect to handle 64bit address operations ', () => {
        expect(calculateMemoryOffset('0x0000ff00', '0xff')).to.eq('0x0000ffff');
        expect(calculateMemoryOffset('0x0000ff00', '0x0100')).to.eq(
            '0x00010000'
        );
    });

    it('should expect to handle reference address operations ', () => {
        expect(calculateMemoryOffset('main', 2)).to.eq('main+2');
        expect(calculateMemoryOffset('main', -2)).to.eq('main-2');
        expect(calculateMemoryOffset('main+4', 6)).to.eq('main+10');
        expect(calculateMemoryOffset('main+4', -6)).to.eq('main-2');
        expect(calculateMemoryOffset('main+4', 6)).to.eq('main+10');
        expect(calculateMemoryOffset('main-4', -6)).to.eq('main-10');
        expect(calculateMemoryOffset('main-4', 6)).to.eq('main+2');
    });

    it('should expect to handle 64bit address operations ', () => {
        expect(calculateMemoryOffset('0xffeeddcc0000ff00', '0xff')).to.eq(
            '0xffeeddcc0000ffff'
        );
        expect(calculateMemoryOffset('0xffeeddcc0000ff00', '0x0100')).to.eq(
            '0xffeeddcc00010000'
        );
    });
});

describe('getDisassembledInstruction', () => {
    it('should map properly', () => {
        const asmInst: MIDataDisassembleAsmInsn = {
            'func-name': 'fn_test',
            offset: '2',
            address: '0x1fff',
            inst: 'mov r10, r6',
            opcodes: 'b2 46',
        };
        const expected: DebugProtocol.DisassembledInstruction = {
            address: '0x1fff',
            instructionBytes: 'b2 46',
            instruction: 'mov r10, r6',
            symbol: 'fn_test+2',
        };

        const result = getDisassembledInstruction(asmInst);
        expect(result).to.deep.equal(expected);
    });
    it('should work without offset', () => {
        const asmInst: MIDataDisassembleAsmInsn = {
            'func-name': 'fn_test',
            address: '0x1fff',
            inst: 'mov r10, r6',
            opcodes: 'b2 46',
        } as unknown as MIDataDisassembleAsmInsn;
        const expected: DebugProtocol.DisassembledInstruction = {
            address: '0x1fff',
            instructionBytes: 'b2 46',
            instruction: 'mov r10, r6',
            symbol: 'fn_test',
        };

        const result = getDisassembledInstruction(asmInst);
        expect(result).to.deep.equal(expected);
    });

    it('should work without function name', () => {
        const asmInst: MIDataDisassembleAsmInsn = {
            address: '0x1fff',
            inst: 'mov r10, r6',
            opcodes: 'b2 46',
        } as unknown as MIDataDisassembleAsmInsn;
        const expected: DebugProtocol.DisassembledInstruction = {
            address: '0x1fff',
            instructionBytes: 'b2 46',
            instruction: 'mov r10, r6',
        };

        const result = getDisassembledInstruction(asmInst);
        expect(result).to.deep.equal(expected);
    });
});

describe('getEmptyInstructions', () => {
    it('should return forward instructions', () => {
        const instructions = getEmptyInstructions('0x0000f000', 10, 4);
        expect(instructions.length).to.eq(10);
        instructions.forEach((instruction, ix) => {
            expect(instruction.address).to.eq(
                calculateMemoryOffset('0x0000f000', ix * 4)
            );
            expect(instruction.instruction).to.eq(
                'failed to retrieve instruction'
            );
            expect(instruction.presentationHint).to.eq('invalid');
        });
    });

    it('should return reverse instructions', () => {
        const instructions = getEmptyInstructions('0x0000f000', 10, -4);
        expect(instructions.length).to.eq(10);
        instructions.forEach((instruction, ix) => {
            expect(instruction.address).to.eq(
                calculateMemoryOffset('0x0000f000', ix * 4 - 40)
            );
            expect(instruction.instruction).to.eq(
                'failed to retrieve instruction'
            );
            expect(instruction.presentationHint).to.eq('invalid');
        });
    });

    it('should return forward instructions with function reference', () => {
        const instructions = getEmptyInstructions('main', 10, 4);
        expect(instructions.length).to.eq(10);
        instructions.forEach((instruction, ix) => {
            expect(instruction.address).to.eq(
                ix === 0 ? 'main' : calculateMemoryOffset('main', ix * 4)
            );
            expect(instruction.instruction).to.eq(
                'failed to retrieve instruction'
            );
            expect(instruction.presentationHint).to.eq('invalid');
        });
    });

    it('should return reverse instructions with function reference', () => {
        const instructions = getEmptyInstructions('main', 10, -4);
        expect(instructions.length).to.eq(10);
        instructions.forEach((instruction, ix) => {
            expect(instruction.address).to.eq(
                calculateMemoryOffset('main', ix * 4 - 40)
            );
            expect(instruction.instruction).to.eq(
                'failed to retrieve instruction'
            );
            expect(instruction.presentationHint).to.eq('invalid');
        });
    });

    it('should return forward instructions with function reference and positive offset', () => {
        const instructions = getEmptyInstructions('main+20', 10, 4);
        expect(instructions.length).to.eq(10);
        instructions.forEach((instruction, ix) => {
            expect(instruction.address).to.eq(
                calculateMemoryOffset('main+20', ix * 4)
            );
            expect(instruction.instruction).to.eq(
                'failed to retrieve instruction'
            );
            expect(instruction.presentationHint).to.eq('invalid');
        });
    });

    it('should return reverse instructions with function reference and positive offset', () => {
        const instructions = getEmptyInstructions('main+20', 10, -4);
        expect(instructions.length).to.eq(10);
        instructions.forEach((instruction, ix) => {
            expect(instruction.address).to.eq(
                calculateMemoryOffset('main+20', ix * 4 - 40)
            );
            expect(instruction.instruction).to.eq(
                'failed to retrieve instruction'
            );
            expect(instruction.presentationHint).to.eq('invalid');
        });
    });

    it('should return forward instructions with function reference and negative offset', () => {
        const instructions = getEmptyInstructions('main-20', 10, 4);
        expect(instructions.length).to.eq(10);
        instructions.forEach((instruction, ix) => {
            expect(instruction.address).to.eq(
                calculateMemoryOffset('main-20', ix * 4)
            );
            expect(instruction.instruction).to.eq(
                'failed to retrieve instruction'
            );
            expect(instruction.presentationHint).to.eq('invalid');
        });
    });

    it('should return reverse instructions with function reference and negative offset', () => {
        const instructions = getEmptyInstructions('main-20', 10, -4);
        expect(instructions.length).to.eq(10);
        instructions.forEach((instruction, ix) => {
            expect(instruction.address).to.eq(
                calculateMemoryOffset('main-20', ix * 4 - 40)
            );
            expect(instruction.instruction).to.eq(
                'failed to retrieve instruction'
            );
            expect(instruction.presentationHint).to.eq('invalid');
        });
    });
});
