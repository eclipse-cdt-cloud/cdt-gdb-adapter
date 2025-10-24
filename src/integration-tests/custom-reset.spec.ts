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
    const loopForeverProgram = path.join(testProgramsDir, 'loopForever');
    const commands = ['print 42'];
    const expectedResult = '$1 = 42\n';

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: loopForeverProgram,
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

        await Promise.all([
            dc.waitForOutputEvent('stdout', expectedResult),
            dc.customRequest('cdt-gdb-adapter/customReset'),
        ]);
    });

    it.only('stops the target if necessary before sending custom reset commands', async function () {
        if (!isRemoteTest) {
            // command is implemented in the remote adapter but not in the local adapter
            // so skip this test if not running remote
            this.skip();
        }

        await dc.setFunctionBreakpointsRequest({
            breakpoints: [{ name: 'main' }],
        });
        const [stoppedEvent] = await Promise.all([
            dc.waitForEvent('stopped'),
            dc.configurationDoneRequest(),
        ]);
        await dc.setFunctionBreakpointsRequest({ breakpoints: [] }); // remove function breakpoints

        // Let the program run
        await dc.continueRequest({ threadId: stoppedEvent.body.threadId });
        // TEMP: ensure this fails for all modes on Linux, can't test on Windows locally.
        await dc.stepInRequest({ threadId: stoppedEvent.body.threadId });

        await Promise.all([
            dc.waitForOutputEvent('stdout', expectedResult), // wait stdout event
            dc.customRequest('cdt-gdb-adapter/customReset'),
        ]);

        // Would throw if it wasn't stopped
        await dc.stepInRequest({ threadId: stoppedEvent.body.threadId });
    });
});
