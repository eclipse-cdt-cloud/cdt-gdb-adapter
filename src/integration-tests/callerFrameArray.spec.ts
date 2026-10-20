/*********************************************************************
 * Copyright (c) 2026 S. Comins and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as path from 'path';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    resolveLineTagLocations,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('caller-frame array addresses', function () {
    let dc: CdtDebugClient;
    const program = path.join(testProgramsDir, 'frame_arrays');
    const source = path.join(testProgramsDir, 'frame_arrays.c');
    const lineTags = {
        'BREAK HERE': 0,
    };

    before(function () {
        resolveLineTagLocations(source, lineTags);
    });

    beforeEach(async function () {
        dc = await standardBeforeEach();
        await dc.hitBreakpoint(fillDefaults(this.currentTest, { program }), {
            path: source,
            line: lineTags['BREAK HERE'],
        });
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('uses the selected caller frame when evaluating an array address', async function () {
        const threads = await dc.threadsRequest();
        const stack = await dc.stackTraceRequest({
            threadId: threads.body.threads[0].id,
        });
        const caller = stack.body.stackFrames.find(
            (frame) => frame.name === 'caller_frame'
        );
        expect(caller, 'caller frame was not present in the stack').to.exist;
        if (!caller) {
            throw new Error('caller frame was not present in the stack');
        }

        const scopes = await dc.scopesRequest({ frameId: caller.id });
        const locals = scopes.body.scopes[0];
        expect(locals, 'caller locals scope was not present').to.exist;
        if (!locals) {
            throw new Error('caller locals scope was not present');
        }
        const variables = await dc.variablesRequest({
            variablesReference: locals.variablesReference,
        });
        const array = variables.body.variables.find(
            (variable) => variable.name === 'items'
        );
        expect(array, 'caller array was not present').to.exist;
        if (!array) {
            throw new Error('caller array was not present');
        }

        const selectedFrameAddress = await dc.evaluateRequest({
            context: 'watch',
            expression: '&items',
            frameId: caller.id,
        });
        const currentFrame = stack.body.stackFrames[0];
        const currentFrameAddress = await dc.evaluateRequest({
            context: 'watch',
            expression: '&items',
            frameId: currentFrame.id,
        });

        expect(BigInt(array.value)).to.equal(
            BigInt(selectedFrameAddress.body.result)
        );
        expect(BigInt(array.value)).to.not.equal(
            BigInt(currentFrameAddress.body.result)
        );
    });
});
