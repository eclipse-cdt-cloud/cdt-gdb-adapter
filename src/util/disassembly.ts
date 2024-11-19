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
import {
    MIDataDisassembleAsmInsn,
    MIDataDisassembleResponse,
    sendDataDisassemble,
} from '../mi';
import { IGDBBackend } from '../types/gdb';
import { calculateMemoryOffset } from './calculateMemoryOffset';

/**
 * Converts the MIDataDisassembleAsmInsn object to DebugProtocol.DisassembledInstruction
 *
 * @param asmInstruction
 * 		MI instruction object
 * @return
 * 		Returns the DebugProtocol.DisassembledInstruction object
 */
export const getDisassembledInstruction = (
    asmInstruction: MIDataDisassembleAsmInsn
): DebugProtocol.DisassembledInstruction => {
    let symbol: string | undefined;
    if (asmInstruction['func-name'] && asmInstruction.offset) {
        symbol = `${asmInstruction['func-name']}+${asmInstruction.offset}`;
    } else if (asmInstruction['func-name']) {
        symbol = asmInstruction['func-name'];
    } else {
        symbol = undefined;
    }
    return {
        address: asmInstruction.address,
        instructionBytes: asmInstruction.opcodes,
        instruction: asmInstruction.inst,
        ...(symbol ? { symbol } : {}),
    } as DebugProtocol.DisassembledInstruction;
};

/**
 * Returns a sequence of empty instructions to fill the gap in DisassembleRequest
 *
 * @param startAddress
 * 		The starting address of the sequence
 * @param count
 * 		The number of the instructions to return back
 * @param step
 * 		Memory step to calculate the next instructions address. It can be negative.
 * @return
 * 		Returns sequence of empty instructions
 */
export const getEmptyInstructions = (
    startAddress: string,
    count: number,
    step: number
) => {
    const badDisInsn = (
        address: string
    ): DebugProtocol.DisassembledInstruction => ({
        address,
        instruction: 'failed to retrieve instruction',
        presentationHint: 'invalid',
    });

    const list: DebugProtocol.DisassembledInstruction[] = [];
    let address = startAddress;
    for (let ix = 0; ix < count; ix++) {
        if (step < 0) {
            address = calculateMemoryOffset(address, step);
            list.unshift(badDisInsn(address));
        } else {
            list.push(badDisInsn(address));
            address = calculateMemoryOffset(address, step);
        }
    }
    return list;
};

/**
 * Gets the instructions from the memory according to the given reference values.
 *
 * For example:
 * If you like to return 100 instructions starting from the 0x00001F00 address,
 * you can use the method like below:
 *
 * const instructions = await memoryReference('0x00001F00', 100);
 *
 * To return lower memory areas, (handling the negative offset),
 * you can use negative length value:
 *
 * const instructions = await memoryReference('0x00001F00', -100);
 *
 * Method returns the expected length of the instructions, if cannot read expected
 * length (can be due to memory bounds), empty instructions will be filled.
 *
 * @param gdb
 * 		GDB Backend instance
 * @param memoryReference
 * 		Starting memory address for the operation
 * @param length
 * 		The count of the instructions to fetch, can be negative if wanted to return negative offset
 * @return
 * 		Returns the given amount of instructions
 */
export const getInstructions = async (
    gdb: IGDBBackend,
    memoryReference: string,
    length: number
) => {
    const list: DebugProtocol.DisassembledInstruction[] = [];
    const meanSizeOfInstruction = 4;
    const absLength = Math.abs(length);

    let result: MIDataDisassembleResponse | undefined = undefined;
    try {
        result =
            length < 0
                ? await sendDataDisassemble(
                      gdb,
                      `(${memoryReference})-${
                          absLength * meanSizeOfInstruction
                      }`,
                      `(${memoryReference})+0`
                  )
                : await sendDataDisassemble(
                      gdb,
                      `(${memoryReference})+0`,
                      `(${memoryReference})+${
                          absLength * meanSizeOfInstruction
                      }`
                  );
    } catch (e) {
        // Do nothing in case of memory error.
        result = undefined;
    }

    if (result === undefined) {
        // result is undefined in case of error,
        // then return empty instructions list
        return getEmptyInstructions(memoryReference, length, 2);
    }

    for (const asmInsn of result.asm_insns) {
        const line: number | undefined = asmInsn.line
            ? parseInt(asmInsn.line, 10)
            : undefined;
        const location = {
            name: asmInsn.file,
            path: asmInsn.fullname,
        } as DebugProtocol.Source;
        for (const asmLine of asmInsn.line_asm_insn) {
            list.push({
                ...getDisassembledInstruction(asmLine),
                location,
                line,
            });
        }
    }

    if (length < 0) {
        // Remove the heading, if necessary
        if (absLength < list.length) {
            list.splice(0, list.length - absLength);
        }

        // Add empty instructions, if necessary
        if (list.length < absLength) {
            const startAddress = list[0].address;
            const filling = getEmptyInstructions(
                startAddress,
                absLength - list.length,
                -2
            );
            list.unshift(...filling);
        }
    } else {
        // Remove the tail, if necessary
        if (absLength < list.length) {
            list.splice(absLength, list.length - absLength);
        }

        // Add empty instructions, if necessary
        if (list.length < absLength) {
            const startAddress = list[list.length - 1].address;
            const filling = getEmptyInstructions(
                startAddress,
                absLength - list.length,
                2
            );
            list.push(...filling);
        }
    }

    return list;
};
