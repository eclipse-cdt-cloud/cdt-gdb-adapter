/*********************************************************************
 * Copyright (c) 2026 Kichwa Coders Canada Inc. and others.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    fillDefaults,
    isRemoteTest,
    resolveLineTagLocations,
    Scope,
    getScopes,
} from './utils';
import * as os from 'os';
import { expect } from 'chai';

describe('multiinferior', async function () {
    let dc: CdtDebugClient;

    const lineTags = {
        STOP1: 0,
        STOP2: 0,
    };

    before(function () {
        resolveLineTagLocations(
            path.join(testProgramsDir, 'multiinferior.c'),
            lineTags
        );
    });

    beforeEach(async function () {
        // This test should work with other setups, but the startup sequencing is more
        // complicated on these setups, so we skip the test for now.
        if (os.platform() === 'win32' || isRemoteTest) {
            this.skip();
        }

        dc = await standardBeforeEach();
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: path.join(testProgramsDir, 'multiinferior'),
                // kick off two inferiors
                initCommands: [
                    'add-inferior',
                    'inferior 2',
                    `file ${path.join(testProgramsDir, 'multiinferior')}`,
                    `b multiinferior.c:${lineTags.STOP1}`,
                    `b multiinferior.c:${lineTags.STOP2}`,
                    'run',
                    // continue inferior 2 once so that 'local' is different for both inferiors
                    'continue',
                    'inferior 1',
                    'run',
                ],
            })
        );
    });

    afterEach(async () => {
        await dc?.stop();
    });

    it('see different variable values on different inferiors', async function () {
        async function getLocalVariable(scope: Scope) {
            const vars = await dc.variablesRequest({
                variablesReference:
                    scope.scopes.body.scopes[0].variablesReference,
            });
            expect(vars.body.variables.length).to.be.equal(1);
            expect(vars.body.variables[0].name).to.equal('local');
            return vars.body.variables[0].value;
        }
        const scope0: Scope = await getScopes(dc, 0);
        const scope1: Scope = await getScopes(dc, 1);

        const local0_try1 = await getLocalVariable(scope0);
        const local1_try1 = await getLocalVariable(scope1);
        expect(local0_try1).to.not.equal(local1_try1);

        const local0_try2 = await getLocalVariable(scope0);
        const local1_try2 = await getLocalVariable(scope1);
        // the values of the local variable should still be different across inferiors
        expect(local0_try2).to.not.equal(local1_try2);

        // the values of the local variable should still be the same within each inferior
        expect(local0_try1).to.equal(local0_try2);
        expect(local1_try1).to.equal(local1_try2);
    });
});
