/*********************************************************************
 * Copyright (c) 2023 Kichwa Coders Canada Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

// import { expect } from 'chai';
import * as path from 'path';
import { LaunchRequestArguments } from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    getScopes,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('terminated', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');

    beforeEach(async function () {
        dc = await standardBeforeEach();
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('terminated event arrives after continuing after a breakpoint', async function () {
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
            } as LaunchRequestArguments),
            {
                path: emptySrc,
                line: 3,
            }
        );

        await Promise.all([
            dc.waitForEvent('terminated'),
            dc.continueRequest({ threadId: (await getScopes(dc)).thread.id }),
        ]);
    });

    it('terminated event arrives on a short run', async function () {
        await Promise.all([
            dc.waitForEvent('terminated'),

            dc
                .waitForEvent('initialized')
                .then((_event) => dc.configurationDoneRequest()),

            dc.launch(
                fillDefaults(this.test, {
                    program: emptyProgram,
                } as LaunchRequestArguments)
            ),
        ]);
    });
});
