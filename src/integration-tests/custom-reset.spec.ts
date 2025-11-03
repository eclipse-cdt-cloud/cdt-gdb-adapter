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
    gdbAsync,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('custom reset', function () {
    let dc: CdtDebugClient;
    const loopForeverProgram = path.join(testProgramsDir, 'loopforever');
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
            // Command is implemented in GDBDebugSessionBase but deliberately documented
            // for gdbtarget (remote) adapter only. So skip this test if not running remote
            this.skip();
        }

        await Promise.all([
            dc.waitForOutputEvent('stdout', expectedResult),
            dc.customRequest('cdt-gdb-adapter/customReset'),
        ]);
    });

    it('stops the target if necessary before sending custom reset commands', async function () {
        if (!isRemoteTest || !gdbAsync) {
            // Command is implemented in GDBDebugSessionBase but deliberately documented
            // for gdbtarget (remote) adapter only. So skip this test if not running remote.
            // Skip if not gdbAsync, pauseIfNeeded will otherwise hang in when fetching `$_gthread`.
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

        await Promise.all([
            dc.waitForOutputEvent('stdout', expectedResult), // wait stdout event
            dc.customRequest('cdt-gdb-adapter/customReset'),
        ]);

        // Would throw if it wasn't stopped
        await dc.stepInRequest({ threadId: stoppedEvent.body.threadId });
    });
});
