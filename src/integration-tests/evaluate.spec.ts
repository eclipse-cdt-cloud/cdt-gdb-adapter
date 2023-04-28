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
    it('should be able to update the value of a variable named monitor and that variable has local scope', async function () {
        const res1 = await dc.evaluateRequest({
            context: 'repl',
            expression: 'monitor = 10',
            frameId: scope.frame.id,
        });

        expect(res1.body.result).eq('10');
        const res2 = await dc.evaluateRequest({
            context: 'repl',
            expression: 'monitor',
            frameId: scope.frame.id,
        });
        expect(res2.body.result).eq('10');
    });
    it('should be able to use GDB command', async function () {
        const res1 = await dc.evaluateRequest({
            context: 'repl',
            expression: '>help',
            frameId: scope.frame.id,
        });

        expect(res1.body.result).eq('\r');
        const res2 = await dc.evaluateRequest({
            context: 'repl',
            expression: '>-gdb-version',
            frameId: scope.frame.id,
        });

        expect(res2.body.result).eq('\r');
    });
    it('should reject entering an invalid MI command', async function () {
        const err = await expectRejection(
            dc.evaluateRequest({
                context: 'repl',
                expression: '>-a',
                frameId: scope.frame.id,
            })
        );

        expect(err.message).eq('Undefined MI command: a');
    });
});
