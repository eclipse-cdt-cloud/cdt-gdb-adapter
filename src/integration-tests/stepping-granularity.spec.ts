/*********************************************************************
 * Copyright (c) 2023 Ericsson and others
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
    fillDefaults,
    resolveLineTagLocations,
} from './utils';
import { DebugProtocol } from '@vscode/debugprotocol';

interface StackState {
    main: DebugProtocol.StackFrame | undefined;
    elsewhere: DebugProtocol.StackFrame | undefined;
}

interface StackStateCheck {
    elsewhereDefined: boolean;
    line: number;
}

describe('Stepping', async function () {
    let dc: CdtDebugClient;
    const steppingProgram = path.join(testProgramsDir, 'stepping');
    const steppingSource = path.join(testProgramsDir, 'stepping.c');
    const lineTags = {
        'main for': 0,
        'main getFromElsewhere call': 0,
        'main printf call': 0,
        'getFromElsewhere entry': 0,
        'getFromElsewhere for': 0,
    };

    before(function () {
        resolveLineTagLocations(steppingSource, lineTags);
    });

    beforeEach(async function () {
        dc = await standardBeforeEach();

        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, { program: steppingProgram }),
            {
                path: steppingSource,
                line: lineTags['main getFromElsewhere call'],
            }
        );
    });

    afterEach(async () => {
        await dc.stop();
    });

    async function getFrameState(threadId: number) {
        const stack = await dc.stackTraceRequest({ threadId });
        const main = stack.body.stackFrames.find(
            (frame) => frame.name === 'main'
        );
        const elsewhere = stack.body.stackFrames.find(
            (frame) => frame.name === 'getFromElsewhere'
        );
        return { main, elsewhere };
    }

    function expectStackState(state: StackState, check: StackStateCheck) {
        if (check.elsewhereDefined) {
            expect(state.elsewhere).not.to.be.undefined;
        } else {
            expect(state.elsewhere).to.be.undefined;
        }
        const target = check.elsewhereDefined ? 'elsewhere' : 'main';
        expect(state[target]).not.to.be.undefined;
        expect(state[target]?.line).equal(
            check.line,
            `It should have stopped at line ${check.line}`
        );
    }

    it('steps in by line', async () => {
        const threads = await dc.threadsRequest();
        const threadId = threads.body.threads[0].id;
        expectStackState(await getFrameState(threadId), {
            elsewhereDefined: false,
            line: lineTags['main getFromElsewhere call'],
        });
        await Promise.all([
            dc.stepInRequest({ threadId, granularity: 'statement' }),
            dc.waitForEvent('stopped'),
        ]);
        expectStackState(await getFrameState(threadId), {
            elsewhereDefined: true,
            line: lineTags['getFromElsewhere entry'],
        });
        await Promise.all([
            dc.stepInRequest({ threadId, granularity: 'statement' }),
            dc.waitForEvent('stopped'),
        ]);
        expectStackState(await getFrameState(threadId), {
            elsewhereDefined: true,
            line: lineTags['getFromElsewhere for'],
        });
    });

    it('steps in by instruction', async () => {
        const threads = await dc.threadsRequest();
        const threadId = threads.body.threads[0].id;
        let state = await getFrameState(threadId);
        expectStackState(state, {
            elsewhereDefined: false,
            line: lineTags['main getFromElsewhere call'],
        });
        await Promise.all([
            dc.stepInRequest({ threadId, granularity: 'instruction' }),
            dc.waitForEvent('stopped'),
        ]);
        // First step should not take us straight to the function.
        expectStackState((state = await getFrameState(threadId)), {
            elsewhereDefined: false,
            line: lineTags['main getFromElsewhere call'],
        });
        // Step until we leave that line.
        while (
            state.main?.line === lineTags['main getFromElsewhere call'] &&
            !state.elsewhere
        ) {
            await Promise.all([
                dc.stepInRequest({ threadId, granularity: 'instruction' }),
                dc.waitForEvent('stopped'),
            ]);
            state = await getFrameState(threadId);
        }
        // First line we see should be inside `getFromElsewhere`
        expectStackState(state, {
            elsewhereDefined: true,
            line: lineTags['getFromElsewhere entry'],
        });
    });

    it('steps next by line and skips a function', async () => {
        const threads = await dc.threadsRequest();
        const threadId = threads.body.threads[0].id;
        expectStackState(await getFrameState(threadId), {
            elsewhereDefined: false,
            line: lineTags['main getFromElsewhere call'],
        });
        await Promise.all([
            dc.nextRequest({ threadId, granularity: 'statement' }),
            dc.waitForEvent('stopped'),
        ]);
        expectStackState(await getFrameState(threadId), {
            elsewhereDefined: false,
            line: lineTags['main printf call'],
        });
        await Promise.all([
            dc.nextRequest({ threadId, granularity: 'statement' }),
            dc.waitForEvent('stopped'),
        ]);
        expectStackState(await getFrameState(threadId), {
            elsewhereDefined: false,
            line: lineTags['main for'],
        });
    });

    it('steps next by instruction and skips a function', async () => {
        const threads = await dc.threadsRequest();
        const threadId = threads.body.threads[0].id;
        let state = await getFrameState(threadId);
        expectStackState(state, {
            elsewhereDefined: false,
            line: lineTags['main getFromElsewhere call'],
        });
        // Step until we get off line 'main getFromElsewhere call'.
        while (
            state.main?.line === lineTags['main getFromElsewhere call'] &&
            !state.elsewhere
        ) {
            await Promise.all([
                dc.nextRequest({ threadId, granularity: 'instruction' }),
                dc.waitForEvent('stopped'),
            ]);
            state = await getFrameState(threadId);
        }
        // The first line we should see after 'main getFromElsewhere call'
        // is 'main printf call', not something in `getFromElsewhere`.
        expectStackState(state, {
            elsewhereDefined: false,
            line: lineTags['main printf call'],
        });
    });
});
