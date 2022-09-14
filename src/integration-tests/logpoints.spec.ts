/*********************************************************************
 * Copyright (c) 2019 Arm and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { join } from 'path';
import { expect } from 'chai';
import { CdtDebugClient } from './debugClient';
import { LaunchRequestArguments } from '../GDBDebugSession';
import {
    standardBeforeEach,
    gdbPath,
    testProgramsDir,
    openGdbConsole,
    gdbAsync,
    gdbNonStop,
} from './utils';

describe('logpoints', async () => {
    let dc: CdtDebugClient;

    beforeEach(async () => {
        dc = await standardBeforeEach();

        await dc.launchRequest({
            verbose: true,
            gdb: gdbPath,
            program: join(testProgramsDir, 'count'),
            openGdbConsole,
            gdbAsync,
            gdbNonStop,
        } as LaunchRequestArguments);
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('hits a logpoint', async () => {
        const logMessage = 'log message';

        await dc.setBreakpointsRequest({
            source: {
                name: 'count.c',
                path: join(testProgramsDir, 'count.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 4,
                    logMessage,
                },
            ],
        });
        await dc.configurationDoneRequest();
        const logEvent = await dc.waitForOutputEvent('console');
        expect(logEvent.body.output).to.eq(logMessage);
    });

    it('supports changing log messages', async () => {
        const logMessage = 'log message';

        await dc.setBreakpointsRequest({
            source: {
                name: 'count.c',
                path: join(testProgramsDir, 'count.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 4,
                    logMessage: 'something uninteresting',
                },
            ],
        });
        await dc.setBreakpointsRequest({
            source: {
                name: 'count.c',
                path: join(testProgramsDir, 'count.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 4,
                    logMessage,
                },
            ],
        });
        await dc.configurationDoneRequest();
        const logEvent = await dc.waitForOutputEvent('console');
        expect(logEvent.body.output).to.eq(logMessage);
    });
});
