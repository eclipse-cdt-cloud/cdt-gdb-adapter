/*********************************************************************
 * Copyright (c) 2023 Kichwa Coders Canada Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import * as os from 'os';
import { LaunchRequestArguments } from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    getScopes,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('stderr', function () {
    let dc: CdtDebugClient;
    const program = path.join(testProgramsDir, 'stderr');
    const source = path.join(testProgramsDir, 'stderr.c');

    beforeEach(async function () {
        dc = await standardBeforeEach();
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('receives stderr from inferior as output events', async function () {
        if (isRemoteTest) {
            // remote tests the inferior stdout/err comes out the remote end, so
            // no output events from the adapter
            this.skip();
        }

        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: program,
            } as LaunchRequestArguments),
            {
                path: source,
                line: 5,
            }
        );

        const stderr = dc.waitForOutputEvent(
            'stderr',
            `STDERR Here I am${os.platform() === 'win32' ? '\r\n' : '\n'}`
        );

        const scope = await getScopes(dc);
        await Promise.all([
            dc.continueRequest({ threadId: scope.thread.id }),
            stderr,
        ]);
    });
});
