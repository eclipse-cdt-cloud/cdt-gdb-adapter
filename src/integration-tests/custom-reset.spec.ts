/*********************************************************************
 * Copyright (c) 2025 Arm Ltd
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import * as os from 'os';
import { TargetLaunchRequestArguments } from '../types/session';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('custom reset', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const commands = ['print 42'];
    const expectedResult = `$1 = 42\n'
    }`;

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: emptyProgram,
                customResetCommands: commands,
            } as TargetLaunchRequestArguments)
        );
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('tests sending custom reset commands', async function () {
        if (!isRemoteTest) {
            // command is implemented in the remote adapter but not in the local adapter
            // so skip this test if not running remote
            this.skip();
        }

        const event = dc.waitForOutputEvent('stdout', expectedResult);
        await dc.customRequest('cdt-gdb-adapter/customReset');
        await event;
    });
});
