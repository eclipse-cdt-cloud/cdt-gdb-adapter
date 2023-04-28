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
    expectRejection,
    fillDefaults,
    getScopes,
    Scope,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('evaluate request', function () {
    let dc: CdtDebugClient;
    let scope: Scope;

    const evaluateProgram = path.join(testProgramsDir, 'evaluate');
    const evaluateSrc = path.join(testProgramsDir, 'evaluate.cpp');

    beforeEach(async function () {
        dc = await standardBeforeEach();
        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, {
                program: evaluateProgram,
            }),
            {
                path: evaluateSrc,
                line: 2,
            }
        );
        scope = await getScopes(dc);
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('should evaluate a simple literal expression', async function () {
        const res = await dc.evaluateRequest({
            context: 'repl',
            expression: '2 + 2',
            frameId: scope.frame.id,
        });

        expect(res.body.result).eq('4');
    });

    it('should reject evaluation of expression without a frame', async function () {
        const err = await expectRejection(
            dc.evaluateRequest({
                context: 'repl',
                expression: '2 + 2',
            })
        );

        expect(err.message).eq(
            'Evaluation of expression without frameId is not supported.'
        );
    });

    it('should reject evaluation of invalid expression', async function () {
        const err = await expectRejection(
            dc.evaluateRequest({
                context: 'repl',
                expression: '2 +',
                frameId: scope.frame.id,
            })
        );

        expect(err.message).eq('-var-create: unable to create variable object');
    });
});
