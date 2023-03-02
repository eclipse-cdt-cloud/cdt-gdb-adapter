/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    fillDefaults,
    testProgramsDir,
    getScopes,
    gdbNonStop
} from './utils';
import { expect } from 'chai';
import * as path from 'path';

describe('continues', async function() {
    let dc: CdtDebugClient;

    beforeEach(async function() {
        dc = await standardBeforeEach();
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: path.join(testProgramsDir, 'count'),
            })
        );
    });

    afterEach(async function() {
        await dc.stop();
    });

    it('handles continues single-thread', async function() {
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
        await dc.waitForEvent('stopped');
        const scope = await getScopes(dc);
        const continueResponse = await dc.continueRequest({ threadId: scope.thread.id });
        expect(continueResponse.body.allThreadsContinued).to.eq(!gdbNonStop);
    });
});
