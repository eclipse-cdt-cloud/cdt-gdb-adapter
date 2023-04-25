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
    it('should be able to update value of a variable which has local scope and named "monitor"', async function () {
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
    it('should not be able to use monitor commands to an unsupported target', async function () {
        const err = await expectRejection(
            dc.evaluateRequest({
                context: 'repl',
                expression: '>monitor help',
                frameId: scope.frame.id,
            })
        );

        expect(err.message).eq(
            '"monitor" command not supported by this target.'
        );
    });
    it('should be able to use gdb command with prefix ">"', async function () {
        const res = await dc.evaluateRequest({
            context: 'repl',
            expression: '>help',
            frameId: scope.frame.id,
        });

        expect(res.body.result).eq('\r');
    });
});
