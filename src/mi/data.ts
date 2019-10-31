/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { GDBBackend } from '../GDBBackend';
import { MIResponse } from './base';

interface MIDataReadMemoryBytesResponse {
    memory: Array<{
        begin: string;
        end: string;
        offset: string;
        contents: string;
    }>;
}
interface MIDataDisassembleAsmInsn {
    address: string;
    // func-name in MI
    func_name: string;
    offset: string;
    opcodes: string;
    inst: string;
}

interface MIDataDisassembleSrcAndAsmLine {
    line: string;
    file: string;
    fullname: string;
    line_asm_insn: MIDataDisassembleAsmInsn[];
}
interface MIDataDisassembleResponse {
    asm_insns: MIDataDisassembleSrcAndAsmLine[];
}

export interface MIGDBDataEvaluateExpressionResponse extends MIResponse {
    value?: string;
}

export function sendDataReadMemoryBytes(gdb: GDBBackend, address: string, size: number, offset: number = 0)
    : Promise<MIDataReadMemoryBytesResponse> {
    return gdb.sendCommand(`-data-read-memory-bytes -o ${offset} "${address}" ${size}`);
}

export function sendDataEvaluateExpression(gdb: GDBBackend, expr: string)
    : Promise<MIGDBDataEvaluateExpressionResponse> {
    return gdb.sendCommand(`-data-evaluate-expression "${expr}"`);
}

// https://sourceware.org/gdb/onlinedocs/gdb/GDB_002fMI-Data-Manipulation.html#The-_002ddata_002ddisassemble-Command
export async function sendDataDisassemble(gdb: GDBBackend, startAddress: string, endAddress: string)
    : Promise<MIDataDisassembleResponse> {
    // -- 5 == mixed source and disassembly with raw opcodes
    // TODO needs to be -- 3 for GDB < 7.11 -- are we supporting such old versions?
    const result: MIDataDisassembleResponse =
        await gdb.sendCommand(`-data-disassemble -s "${startAddress}" -e "${endAddress}" -- 5`);

    // cleanup the result data
    if (result.asm_insns.length > 0) {
        if (!result.asm_insns[0].hasOwnProperty('line_asm_insn')) {
            // In this case there is no source info available for any instruction,
            // so GDB treats as if we had done -- 2 instead of -- 5
            // This bit of code remaps the data to look like it should
            const e: MIDataDisassembleSrcAndAsmLine = {
                line_asm_insn: result.asm_insns as unknown as MIDataDisassembleAsmInsn[],
            } as MIDataDisassembleSrcAndAsmLine;
            result.asm_insns = [e];
        }
        for (const asmInsn of result.asm_insns) {
            if (!asmInsn.hasOwnProperty('line_asm_insn')) {
                asmInsn.line_asm_insn = [];
            }
            for (const line of asmInsn.line_asm_insn) {
                const untypeLine: any = line;
                if (untypeLine.hasOwnProperty('func-name')) {
                    line.func_name = untypeLine['func-name'];
                    delete untypeLine['func-name'];
                }
            }
        }
    }
    return Promise.resolve(result);
}
