/*********************************************************************
 * Copyright (c) 2019 Arm and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { LaunchRequestArguments } from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    gdbPath,
    testProgramsDir,
    openGdbConsole,
    getScopes,
    verifyVariable,
} from './utils';


describe('breakpoints', async () => {
    let dc: CdtDebugClient;

    beforeEach(async () => {
        dc = await standardBeforeEach();

        await dc.launchRequest({
            verbose: true,
            gdb: gdbPath,
            program: path.join(testProgramsDir, 'count'),
            openGdbConsole,
        } as LaunchRequestArguments);
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('hits a standard breakpoint', async () => {
        await dc.setBreakpointsRequest({
            source: {
                name: 'count.c',
                path: path.join(testProgramsDir, 'count.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 4,
                },
            ],
        });
        await dc.configurationDoneRequest();
        const scope = await getScopes(dc);
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        verifyVariable(vars.body.variables[0], 'count', 'int', '0');
    });

    it('hits a conditional breakpoint', async () => {
        await dc.setBreakpointsRequest({
            source: {
                name: 'count.c',
                path: path.join(testProgramsDir, 'count.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 4,
                    condition: 'count == 5',
                },
            ],
        });
        await dc.configurationDoneRequest();
        const scope = await getScopes(dc);
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        verifyVariable(vars.body.variables[0], 'count', 'int', '5');
    });
});
