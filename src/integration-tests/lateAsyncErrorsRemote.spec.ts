/*********************************************************************
 * Copyright (c) 2025 Arm and others
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
    fillDefaults,
    gdbAsync,
    isRemoteTest,
    resolveLineTagLocations,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { TargetLaunchRequestArguments } from '../types/session';
import { DebugProtocol } from '@vscode/debugprotocol';
import { expect } from 'chai';

describe('lateAsyncErrorsRemote', async function () {
    let dc: CdtDebugClient;
    const program = path.join(testProgramsDir, 'loopforever');
    const src = path.join(testProgramsDir, 'loopforever.c');
    const lineTags = {
        'main function': 0,
        'inner1 stop': 0,
    };

    this.beforeAll(function () {
        resolveLineTagLocations(src, lineTags);
    });

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program,
            } as TargetLaunchRequestArguments)
        );
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('should provoke an error and not continue with too many watchpoints, but continue after reducing the number', async function () {
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }

        await dc.setBreakpointsRequest({
            source: { path: src },
            breakpoints: [{ line: lineTags['main function'] }],
        });

        // Stopped by default
        let [stoppedEvent] = await Promise.all([
            dc.waitForEvent('stopped'),
            dc.configurationDoneRequest(),
        ]);

        expect(stoppedEvent).to.not.be.undefined;
        if (!stoppedEvent) {
            // Pointless to continue test
            return;
        }

        // Set too many watchpoints, was not able to set HW breaks (on Windows)
        const watchExpressions = [
            '>watch var1',
            '>watch var2',
            '>watch stop',
            '>awatch var1',
            '>awatch var2',
            '>awatch stop',
            '>rwatch var1',
            '>rwatch var2',
            '>rwatch stop',
        ];
        watchExpressions.forEach(async (expr) => {
            await dc.evaluateRequest({
                expression: expr,
                context: 'repl',
            });
        });

        // Set breakpoint to hit next
        await dc.setBreakpointsRequest({
            source: { path: src },
            breakpoints: [{ line: lineTags['inner1 stop'] }],
        });

        const threadId =
            (stoppedEvent as DebugProtocol.StoppedEvent).body.threadId ?? 1;
        [, stoppedEvent] = await Promise.all([
            dc.waitForEvent('continued'), // Continue will cause continued event, error noticed late
            dc.waitForEvent('stopped'), // Stop due to late error after attempt to install watchpoints
            dc.waitForOutputEvent(
                // Proof we had too many breakpoints
                'log',
                'You may have requested too many hardware breakpoints/watchpoints.\n'
            ),
            dc.continueRequest({ threadId }),
        ]);
        expect(stoppedEvent).to.not.be.undefined;
        if (!stoppedEvent) {
            // Pointless to continue test
            return;
        }
        // Check expected stop reason
        expect(
            (stoppedEvent as DebugProtocol.StoppedEvent).body.reason
        ).to.equal('error');

        // Remove all breakpoints/watchpoints
        await dc.evaluateRequest({
            expression: '>delete breakpoints',
            context: 'repl',
        });

        // Check command queue recovered and executes next commands
        // Reinstall breakpoint to hit next
        await dc.setBreakpointsRequest({
            source: { path: src },
            breakpoints: [{ line: lineTags['inner1 stop'] }],
        });
        const threadIdAfterError =
            (stoppedEvent as DebugProtocol.StoppedEvent).body.threadId ?? 1;
        // Set next breakpoint to hit, run and hit it
        await Promise.all([
            dc.assertStoppedLocation('breakpoint', {
                line: lineTags['inner1 stop'],
            }),
            dc.continueRequest({
                threadId: threadIdAfterError,
            }),
        ]);
    });
});
