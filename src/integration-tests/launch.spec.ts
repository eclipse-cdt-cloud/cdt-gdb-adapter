/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as path from 'path';
import { LaunchRequestArguments } from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import { standardBefore, standardBeforeEach, testProgramsDir } from './utils';
import { gdbPath, openGdbConsole } from './utils';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions

describe('launch', function() {

    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');

    before(standardBefore);

    beforeEach(async function() {
        dc = await standardBeforeEach();
    });

    afterEach(async function() {
        await dc.stop();
    });

    // Move the timeout out of the way if the adapter is going to be debugged.
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        this.timeout(9999999);
    }

    it('can launch and hit a breakpoint', async function() {
        await dc.hitBreakpoint({
            verbose: true,
            gdb: gdbPath,
            program: emptyProgram,
            openGdbConsole,
        } as LaunchRequestArguments, {
                path: emptySrc,
                line: 3,
            });
    });

    it('reports an error when specifying a non-existent binary', async function() {
        const errorMessage = await new Promise<Error>((resolve, reject) => {
            dc.launchRequest({
                verbose: true,
                gdb: gdbPath,
                program: '/does/not/exist',
                openGdbConsole,
            } as LaunchRequestArguments)
                .then(reject)
                .catch(resolve);
        });

        expect(errorMessage.message).eq('/does/not/exist: No such file or directory.');
    });
});
