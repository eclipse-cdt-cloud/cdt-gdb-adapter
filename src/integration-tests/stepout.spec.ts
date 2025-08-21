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
import { expect } from 'chai';
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    getScopes,
    fillDefaults,
} from './utils';

describe('stepout', async function () {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        dc = await standardBeforeEach();
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: path.join(testProgramsDir, 'functions'),
            })
        );
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('should step out from staticfunc1 to main', async () => {
        await dc.setBreakpointsRequest({
            source: {
                name: 'functions.c',
                path: path.join(testProgramsDir, 'functions.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 3,
                },
            ],
        });
        await Promise.all([
            dc.waitForEvent('stopped'),
            dc.configurationDoneRequest(),
        ]);
        const scope = await getScopes(dc);
        const [stepOutEvent] = await Promise.all([
            dc.waitForEvent('stopped'),
            dc.stepOutRequest({
                threadId: scope.thread.id,
            }),
        ]);
        expect(stepOutEvent.body.reason).eq('step');
        const stackTrace = await dc.stackTraceRequest({
            threadId: stepOutEvent.body.threadId,
        });
        expect(stackTrace.body.stackFrames[0].name.includes('main'));
    });
});
