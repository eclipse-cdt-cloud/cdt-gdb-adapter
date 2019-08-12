/*********************************************************************
 * Copyright (c) 2019 Kichwa Coders and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { TargetLaunchRequestArguments, TargetLaunchArguments } from '../GDBTargetDebugSession';
import { CdtDebugClient } from './debugClient';
import { standardBeforeEach, testProgramsDir } from './utils';
import { gdbPath, openGdbConsole } from './utils';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions
describe('launch remote', function() {

    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');

    beforeEach(async function() {
        dc = await standardBeforeEach('debugTargetAdapter.js');
    });

    afterEach(async function() {
        await dc.stop();
    });

    // Move the timeout out of the way if the adapter is going to be debugged.
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        this.timeout(9999999);
    }

    it('can launch remote and hit a breakpoint', async function() {
        await dc.hitBreakpoint({
            verbose: true,
            gdb: gdbPath,
            program: emptyProgram,
            openGdbConsole,
            target : {
                type: 'remote',
            } as TargetLaunchArguments,
        } as TargetLaunchRequestArguments, {
                path: emptySrc,
                line: 3,
            });
    });

});
