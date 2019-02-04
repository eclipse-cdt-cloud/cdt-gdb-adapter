/*********************************************************************
 * Copyright (c) 2019 Ericsson and others
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
    expectRejection, gdbPath, getScopes, openGdbConsole, Scope, standardBefore, standardBeforeEach, testProgramsDir,
} from './utils';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions

let dc: CdtDebugClient;
let scope: Scope;

const evaluateProgram = path.join(testProgramsDir, 'evaluate');
const evaluateSrc = path.join(testProgramsDir, 'evaluate.cpp');

before(standardBefore);

beforeEach(async function() {
    // Move the timeout out of the way if the adapter is going to be debugged.
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        this.timeout(9999999);
    }
    dc = await standardBeforeEach();
    await dc.hitBreakpoint({
        verbose: true,
        gdb: gdbPath,
        program: evaluateProgram,
        logFile: '/tmp/gdb.log',
        openGdbConsole,
    }, {
        path: evaluateSrc,
        line: 2,
    });
    scope = await getScopes(dc);
});

afterEach(async function() {
    await dc.stop();
});

describe('evaluate request', function() {
    // Move the timeout out of the way if the adapter is going to be debugged.
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        this.timeout(9999999);
    }

    it('should evaluate a simple literal expression', async function() {
        const res = await dc.evaluateRequest({
            context: 'repl',
            expression: '2 + 2',
            frameId: scope.frameId,
        });

        expect(res.body.result).eq('4');
    });

    it('should reject evaluation of expression without a frame', async function() {
        const err = await expectRejection(dc.evaluateRequest({
            context: 'repl',
            expression: '2 + 2',
        }));

        expect(err.message).eq('Evaluation of expression without frameId is not supported.');
    });

    it('should reject evaluation of invalid expression', async function() {
        const err = await expectRejection(dc.evaluateRequest({
            context: 'repl',
            expression: '2 +',
            frameId: scope.frameId,
        }));

        expect(err.message).eq('-var-create: unable to create variable object');
    });
});
