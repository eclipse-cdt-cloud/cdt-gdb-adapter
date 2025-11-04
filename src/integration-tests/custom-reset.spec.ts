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
    expectRejection,
    fillDefaults,
    gdbAsync,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { DebugProtocol } from '@vscode/debugprotocol';
import { expect, use } from 'chai';
import * as chaistring from 'chai-string';
use(chaistring);

const gdbtargetAdapter = 'debugTargetAdapter.js';
const loopForeverProgram = path.join(testProgramsDir, 'loopforever');
const commands = ['print 42'];
const expectedResult = '$1 = 42\n';

describe('custom reset configuration', function () {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        dc = await standardBeforeEach(gdbtargetAdapter);
    });

    afterEach(async function () {
        if (dc) {
            await dc.stop();
        }
    });

    const customResetCommandsUnsupported = gdbAsync === false || !isRemoteTest;

    const testConnect = async (
        launchArgs: TargetLaunchRequestArguments,
        expectToFail: boolean
    ) => {
        if (expectToFail) {
            // Expecting launch to fail, check for correct error message
            const expectedErrorMessage =
                "Setting 'customResetCommands' requires 'gdbAsync' to be active";
            const rejectError = await expectRejection(
                dc.launchRequest(launchArgs)
            );
            expect(rejectError.message).to.startWith(expectedErrorMessage);
        } else {
            // Expecting launch to succeed
            const launchResponse = (await dc.launchRequest(
                launchArgs
            )) as DebugProtocol.LaunchResponse;
            expect(launchResponse.success).to.be.true;
        }
    };

    it('correctly validates if auxiliary gdb mode can work with other settings', async function () {
        if (!isRemoteTest) {
            this.skip();
        }

        const launchArgs = fillDefaults(this.test, {
            program: loopForeverProgram,
            customResetCommands: commands,
        } as TargetLaunchRequestArguments);

        await testConnect(launchArgs, customResetCommandsUnsupported);
    });
});

describe('custom reset', function () {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        dc = await standardBeforeEach(gdbtargetAdapter);
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
