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

    it('associates the global variables with vars_globals.c', function () {
        const [, variables] = findFileEntry('vars_globals.c');
        const expectedVariables = ['s0', 'p_s0', 's1', 'p_s1', 'global_int'];
        expect(variables).to.have.lengthOf(expectedVariables.length);
        expect(variables).to.include.members(expectedVariables);
    });

    // TODO add tests for static variables (both scoped and global)
});
