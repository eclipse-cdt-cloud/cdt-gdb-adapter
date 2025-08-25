/*********************************************************************
 * Copyright (c) 2023 Kichwa Coders and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { AttachRequestArguments } from '../types/session';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    gdbAsync,
    gdbNonStop,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { expect } from 'chai';
import { DebugProtocol } from '@vscode/debugprotocol';

describe('attach', function () {
    let dc: CdtDebugClient;
    let inferior: cp.ChildProcess;
    const program = path.join(testProgramsDir, 'loopforever');
    const src = path.join(testProgramsDir, 'loopforever.c');

    beforeEach(async function () {
        dc = await standardBeforeEach();
        inferior = cp.spawn(program, ['running-from-spawn'], {
            cwd: testProgramsDir,
        });
    });

    afterEach(async function () {
        await dc.stop();
        inferior.kill();
    });

    it('can attach and hit a breakpoint', async function () {
        if (isRemoteTest) {
            // attachRemote.spec.ts is the test for when isRemoteTest
            this.skip();
        }

        const attachArgs = fillDefaults(this.test, {
            program: program,
            processId: `${inferior.pid}`,
        } as AttachRequestArguments);
        await dc.attachHitBreakpoint(attachArgs, { line: 25, path: src });
        expect(await dc.evaluate('argv[1]')).to.contain('running-from-spawn');
    });

    it('can attach and hit a breakpoint with no program specified', async function () {
        if (isRemoteTest) {
            // attachRemote.spec.ts is the test for when isRemoteTest
            this.skip();
        }

        const attachArgs = fillDefaults(this.test, {
            processId: `${inferior.pid}`,
        } as AttachRequestArguments);
        await dc.attachHitBreakpoint(attachArgs, { line: 25, path: src });
        expect(await dc.evaluate('argv[1]')).to.contain('running-from-spawn');
    });

    it('can attach to a non-stopping target and has thread names from the beginning', async function () {
        if (isRemoteTest) {
            // attachRemote.spec.ts is the test for when isRemoteTest
            this.skip();
        }
        if ((!gdbAsync && !gdbNonStop) || os.platform() === 'win32') {
            // This functionality is currently only available in async (incl.
            // non-stop) mode.
            // Windows always belongs in this case because native debugging does
            // not support async mode there in GDB < 13, so we are actually in
            // sync even when we requested async.
            this.skip();
        }

        const attachArgs = fillDefaults(this.test, {
            processId: `${inferior.pid}`,
            initCommands: [
                'thread name mythreadname',
                // Simulate a target that does not stop on attaching, unlike
                // what gdbserver does when attaching to a Unix process.
                '-exec-continue --all',
            ],
        } as AttachRequestArguments);

        await Promise.all([
            dc
                .waitForEvent('initialized')
                .then(() => dc.configurationDoneRequest()),
            dc.initializeRequest().then(() => dc.attachRequest(attachArgs)),
        ]);

        try {
            const threadsResponse = await dc.threadsRequest();
            expect(threadsResponse.success).to.be.true;
            expect(threadsResponse.body.threads)
                .to.be.an('array')
                .that.satisfies((threads: DebugProtocol.Thread[]) =>
                    threads.some((t) => t.name === 'mythreadname')
                );
        } finally {
            // This is redundant as long as this case is skipped above, but
            // becomes necessary if and when that restriction is lifted.
            if (!gdbAsync) {
                // In sync mode we need to stop the program again, otherwise
                // afterEach cannot send any commands and gets stuck.
                dc.pauseRequest({ threadId: -1 });
            }
        }
    });
});
