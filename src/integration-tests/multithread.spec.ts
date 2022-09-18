/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada Inc. and others.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    resolveLineTagLocations,
    isRemoteTest,
    gdbNonStop,
    fillDefaults,
} from './utils';
import { expect } from 'chai';
import * as path from 'path';
import { fail } from 'assert';
import * as os from 'os';

describe('multithread', async function () {
    this.timeout(5000);

    let dc: CdtDebugClient;
    const program = path.join(testProgramsDir, 'MultiThread');
    const source = path.join(testProgramsDir, 'MultiThread.cc');

    const threadNames = {
        monday: 0,
        tuesday: 1,
        wednesday: 2,
        thursday: 3,
        friday: 4,
    };

    const lineTags = {
        LINE_MAIN_ALL_THREADS_STARTED: 0,
    };

    before(function () {
        resolveLineTagLocations(source, lineTags);
    });

    beforeEach(async () => {
        dc = await standardBeforeEach();
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('sees all threads', async function () {
        if (!gdbNonStop && os.platform() === 'win32' && isRemoteTest) {
            // The way thread names are set in remote tests on windows is unsupported
            this.skip();
        }
        if (gdbNonStop && os.platform() === 'win32') {
            // non-stop unsupported on Windows
            this.skip();
        }

        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: program,
            }),
            {
                path: source,
                line: lineTags['LINE_MAIN_ALL_THREADS_STARTED'],
            }
        );

        const threads = await dc.threadsRequest();
        const nameToId = new Map(
            threads.body.threads.map((thread) => [thread.name, thread.id])
        );
        // Make sure all 5 threads are there
        expect(nameToId).to.include.keys(Object.keys(threadNames));
        // and make sure that there is at least 6 threads.
        // We don't care about the name of the "main" thread
        expect(threads.body.threads).length.greaterThanOrEqual(6);

        // check that each thread can be communicated with individually
        for (const [name, idInProgram] of Object.entries(threadNames)) {
            // There are multiple ids/indexes.
            // idInProgram cooresponds to the variable thread_id in the C++ source
            // threadId is the id of the thread in DAP
            const threadId = nameToId.get(name);
            if (threadId === undefined) {
                // unreachable because of expect above
                fail('unreachable');
            }

            if (gdbNonStop) {
                const waitForStopped = dc.waitForEvent('stopped');
                const pr = dc.pauseRequest({ threadId });
                await Promise.all([pr, waitForStopped]);
            }

            const stack = await dc.stackTraceRequest({ threadId });
            let frameId: number | undefined = undefined;
            for (const frame of stack.body.stackFrames) {
                if (frame.name === 'PrintHello') {
                    frameId = frame.id;
                    break;
                }
            }
            if (frameId === undefined) {
                fail("Failed to find frame with name 'PrintHello'");
            }
            const scopes = await dc.scopesRequest({ frameId });
            const vr = scopes.body.scopes[0].variablesReference;
            const vars = await dc.variablesRequest({ variablesReference: vr });
            const varnameToValue = new Map(
                vars.body.variables.map((variable) => [
                    variable.name,
                    variable.value,
                ])
            );
            expect(varnameToValue.get('thread_id')).to.equal(
                idInProgram.toString()
            );
            // The "name" variable is a pointer, so is displayed as an address + the
            // extracted nul terminated string
            expect(varnameToValue.get('name')).to.contain(name);
        }
    });
});
