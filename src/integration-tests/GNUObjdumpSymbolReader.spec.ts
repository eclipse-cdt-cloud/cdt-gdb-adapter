/*********************************************************************
 * Copyright (c) 2026 Kichwa Coders Canada Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { expect } from 'chai';
import { GNUObjdumpSymbolReader } from '../desktop/GNUObjdumpSymbolReader';
import { testProgramsDir } from './utils';

describe('GNUObjdumpSymbolReader Test Suite', function () {
    const varsGlobalsProgram = path.join(testProgramsDir, 'vars_globals');
    let reader: GNUObjdumpSymbolReader;
    let variablesByFile: Map<string, string[]>;

    before(async function () {
        reader = new GNUObjdumpSymbolReader('objdump');
        variablesByFile =
            await reader.readGlobalVariablesByFile(varsGlobalsProgram);
    });

    const findFileEntry = (fileName: string): [string, string[]] => {
        const entry = [...variablesByFile.entries()].find(
            ([file]) => file.endsWith('/' + fileName) || file === fileName
        );
        expect(entry, `No entry found for source file '${fileName}'`).to.exist;
        return entry as [string, string[]];
    };

    it('associates the global and static variables with vars_globals.c', function () {
        const [, variables] = findFileEntry('vars_globals.c');
        const expectedGlobalVariables = [
            's0',
            'p_s0',
            's1',
            'p_s1',
            'global_int',
        ];
        const expectedStaticVariables = [
            'file_static_s0',
            'p_file_static_s0',
            'file_static_s1',
            'p_file_static_s1',
            'file_static_int',
        ];
        const localStaticVariable = 'function_static_int';
        const localVariables = [
            'p_s0_local',
            's0_address',
            'p_s1_local',
            's1_address',
        ];
        expect(variables).to.have.lengthOf(
            expectedGlobalVariables.length + expectedStaticVariables.length
        );
        expect(variables).to.include.members(expectedGlobalVariables);
        expect(variables).to.include.members(expectedStaticVariables);
        expect(variables).to.not.include(localStaticVariable);
        expect(variables).to.not.include.members(localVariables);
    });
});
