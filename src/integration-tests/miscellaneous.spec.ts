/*********************************************************************
 * Copyright (c) 2026 Arm Limited and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { CdtDebugClient } from './debugClient';
import { testProgramsDir, standardBeforeEach, fillDefaults } from './utils';
import { expect } from 'chai';

describe('Miscellaneous GDB Commands Tests', function () {
    let dc: CdtDebugClient;

    const evaluateProgram = path.join(testProgramsDir, 'evaluate');
    const evaluateSrc = path.join(testProgramsDir, 'evaluate.cpp');

    beforeEach(async function () {
        dc = await standardBeforeEach();
        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, {
                program: evaluateProgram,
            }),
            {
                path: evaluateSrc,
                line: 2,
            }
        );
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('should retrieve a valid list of completions for a valid command', async function () {
        const completions: any = await dc.send('completions', {
            text: '>pr',
        });
        expect(completions.body.targets).to.be.an('array');
        expect(completions.body.targets).to.deep.include({ label: 'print' });
    });

    it('should retrieve an empty list of completions for an invalid command', async function () {
        const completions: any = await dc.send('completions', {
            text: '>invalidCommand',
        });
        expect(completions.body.targets).to.be.an('array');
        expect(completions.body.targets).to.be.empty;
    });

    it('should retrieve a valid list of completions for a valid command without a complete argument', async function () {
        const completions: any = await dc.send('completions', {
            text: '>b ma ',
        });
        expect(completions.body.targets).to.be.an('array');
        expect(completions.body.targets).to.deep.include({ label: 'b main' });
    });
});
