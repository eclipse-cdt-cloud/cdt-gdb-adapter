/*********************************************************************
 * Copyright (c) 2019 Kichwa Coders and others
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
import {
    TargetAttachRequestArguments,
    TargetAttachArguments,
} from '../types/session';
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    gdbServerPath,
    gdbAsync,
    fillDefaults,
} from './utils';
import { expect } from 'chai';

describe('attach remote', function () {
    let dc: CdtDebugClient;
    let gdbserver: cp.ChildProcess;
    let port: string | undefined = undefined;
    const program = path.join(testProgramsDir, 'loopforever');
    const src = path.join(testProgramsDir, 'loopforever.c');

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
        gdbserver = cp.spawn(
            gdbServerPath,
            [':0', program, 'running-from-spawn'],
            {
                cwd: testProgramsDir,
            }
        );
        port = undefined; // reset port
        port = await new Promise<string>((resolve, reject) => {
            const regex = new RegExp(/Listening on port ([0-9]+)\r?\n/);
            let accumulatedStderr = '';
            if (gdbserver.stderr) {
                gdbserver.stderr.on('data', (data) => {
                    if (!port) {
                        const line = String(data);
                        accumulatedStderr += line;
                        const m = regex.exec(accumulatedStderr);
                        if (m !== null) {
                            resolve(m[1]);
                        }
                    }
                });
            } else {
                reject(new Error('Missing stderr on spawned gdbserver'));
            }
        });
    });

    afterEach(async function () {
        // Set max 30s timeout because disconnectRequest() in dc.stop() can hang
        // if a failing test left GDB in an unexpected state, causing us to miss
        // the backtrace output.
        if (this.timeout() > 30000) {
            this.timeout(30000);
        }
        await gdbserver.kill();
        await dc.stop();
    });

    it('can attach remote and hit a breakpoint', async function () {
        const attachArgs = fillDefaults(this.test, {
            program: program,
            target: {
                type: 'remote',
                parameters: [`localhost:${port}`],
            } as TargetAttachArguments,
        } as TargetAttachRequestArguments);
        await dc.attachHitBreakpoint(attachArgs, { line: 25, path: src });
        expect(await dc.evaluate('argv[1]')).to.contain('running-from-spawn');
    });

    it('can attach remote and hit a breakpoint without a program', async function () {
        if (os.platform() === 'win32') {
            // win32 host does support this use case
            this.skip();
        }
        const attachArgs = fillDefaults(this.test, {
            target: {
                type: 'remote',
                parameters: [`localhost:${port}`],
            } as TargetAttachArguments,
        } as TargetAttachRequestArguments);
        await dc.attachHitBreakpoint(attachArgs, { line: 25, path: src });
        expect(await dc.evaluate('argv[1]')).to.contain('running-from-spawn');
    });

    it('can attach to a non-stopping target and concurrently set breakpoints', async function () {
        if (os.platform() === 'win32' && !gdbAsync) {
            // win32 host can only pause remote + mi-async targets
            this.skip();
        }
        const attachArgs = fillDefaults(this.test, {
            program: program,
            target: {
                type: 'remote',
                parameters: [`localhost:${port}`],
            } as TargetAttachArguments,
            initCommands: [
                // Simulate a target that does not stop on attaching, unlike
                // what gdbserver does when attaching to a Unix process.
                '-exec-continue --all',
            ],
        } as TargetAttachRequestArguments);

        // Check that we can deal with multiple breakpoint requests coming in at
        // once, as from Visual Studio Code.
        await Promise.all([
            dc
                .waitForEvent('initialized')
                .then(() =>
                    Promise.all([
                        dc.setBreakpointsRequest({
                            breakpoints: [{ line: 28 }],
                            source: { path: src },
                        }),
                        dc.setFunctionBreakpointsRequest({ breakpoints: [] }),
                        dc.setInstructionBreakpointsRequest({
                            breakpoints: [],
                        }),
                    ])
                )
                .then(() => dc.configurationDoneRequest()),
            dc.initializeRequest().then(() => dc.attachRequest(attachArgs)),
        ]);

        // If that seems to have worked, check that we ended up in a sane state.
        await dc.pauseRequest({ threadId: 1 });
        await dc.waitForEvent('stopped');
        await dc.evaluate('stop = 1');
        await dc.continueRequest({ threadId: 1 });
        await dc.assertStoppedLocation('breakpoint', { line: 28 });
        expect(await dc.evaluate('argv[1]')).to.contain('running-from-spawn');
    });
});
