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
import * as os from 'os';
import {
    LaunchRequestArguments,
    TargetLaunchRequestArguments,
} from '../types/session';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    gdbAsync,
    gdbNonStop,
    gdbVersionAtLeast,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('launch', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySpaceProgram = path.join(testProgramsDir, 'empty space');
    const emptySrc = path.join(testProgramsDir, 'empty.c');
    const emptySpaceSrc = path.join(testProgramsDir, 'empty space.c');
    const unicodeProgram = path.join(testProgramsDir, 'bug275-测试');
    // the name of this file is short enough to work around https://sourceware.org/bugzilla/show_bug.cgi?id=30618
    const unicodeSrc = path.join(testProgramsDir, 'bug275-测试.c');
    const loopForeverProgram = path.join(testProgramsDir, 'loopforever');

    beforeEach(async function () {
        dc = await standardBeforeEach();
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('can launch and hit a breakpoint', async function () {
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
            } as LaunchRequestArguments),
            {
                path: emptySrc,
                line: 3,
            }
        );
    });

    function makeRunArgTest(runArg: string) {
        return async function (this: Mocha.Context) {
            // This tests both local and remote cases and does not need to be
            // duplicated in launchRemote.spec.ts (beforeEach and afterEach are
            // similar enough here and there).
            const isAsync =
                gdbAsync &&
                (os.platform() !== 'win32' ||
                    isRemoteTest ||
                    (await gdbVersionAtLeast('13.0')));
            if (
                (!isAsync || (isRemoteTest && !gdbNonStop)) &&
                runArg === 'all'
            ) {
                // in sync mode when all threads are running we can't ask '-thread-info'
                // (remote needs non-stop to be really async)
                this.skip();
            }

            const eventCounter = { stopped: 0, continued: 0 };
            dc.on('stopped', () => {
                eventCounter.stopped++;
            });
            dc.on('continued', () => {
                eventCounter.continued++;
            });

            const launchArgs = fillDefaults(this.test, {
                program: loopForeverProgram,
                run: runArg,
            } as LaunchRequestArguments);

            await Promise.all([
                dc
                    .waitForEvent('initialized')
                    .then(() => dc.configurationDoneRequest()),
                dc.initializeRequest().then(() => dc.launchRequest(launchArgs)),
            ]);

            const threadInfo = JSON.parse(
                (
                    await dc.evaluateRequest({
                        expression: '>-thread-info',
                        context: 'repl',
                    })
                ).body.result
            );
            const threadStates = threadInfo.threads.map((t: any) => t.state);
            if (runArg === 'all') {
                expect(threadStates).to.contain('running');
                expect(threadStates).not.to.contain('stopped');
            } else if (runArg === 'preserve') {
                if (isRemoteTest) {
                    // GDBTargetDebugSession interprets "launch" as "launch
                    // gdbserver", not "launch the program", so this case actually
                    // behaves like an attach, not like a launch.
                    expect(threadStates).to.contain('stopped');
                } else {
                    // GDBDebugSessionBase implements "launch" as expected.
                    expect(threadStates).to.be.an('array').that.is.empty;
                }
            } else {
                expect(runArg).to.be.oneOf(['all', 'preserve']);
            }

            expect(eventCounter).to.deep.equal({
                stopped: isRemoteTest ? (runArg === 'all' ? 0 : 1) : 0,
                continued: 0,
            });
        };
    }

    it('can launch and run', makeRunArgTest('all'));
    it('can launch without running', makeRunArgTest('preserve'));

    it('receives an error when no port is provided nor a suitable regex', async function () {
        if (!isRemoteTest) {
            this.skip();
        }
        const errorMessage = await new Promise<Error>((resolve, reject) => {
            dc.launchRequest(
                fillDefaults(this.test, {
                    program: emptyProgram,
                    target: {
                        serverPortRegExp: 'Not a correct regex',
                        portDetectionTimeout: 1000,
                    },
                } as TargetLaunchRequestArguments)
            )
                .then(reject)
                .catch(resolve);
        });
        expect(errorMessage.message).to.satisfy(
            (msg: string) =>
                msg.includes('Error') &&
                msg.includes('port number not specified or regex is incorrect')
        );
    });

    it('reports an error when specifying a non-existent binary', async function () {
        const errorMessage = await new Promise<Error>((resolve, reject) => {
            dc.launchRequest(
                fillDefaults(this.test, {
                    program: '/does/not/exist',
                } as LaunchRequestArguments)
            )
                .then(reject)
                .catch(resolve);
        });

        // When launching a remote test gdbserver generates the error which is not exactly the same
        // as GDB's error
        expect(errorMessage.message).to.satisfy(
            (msg: string) =>
                msg.includes('/does/not/exist') &&
                (msg.includes('The system cannot find the path specified') ||
                    msg.includes('No such file or directory') ||
                    msg.includes('not found'))
        );
    });

    it('works with a space in file names', async function () {
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptySpaceProgram,
            } as LaunchRequestArguments),
            {
                path: emptySpaceSrc,
                line: 3,
            }
        );
    });

    it('works with unicode in file names', async function () {
        const isWindows = os.platform() === 'win32';
        if (!gdbNonStop && isWindows && isRemoteTest) {
            // on windows remote tests don't support the unicode in file name (except for non-stop which seems to)
            this.skip();
        }
        const args = { program: unicodeProgram } as LaunchRequestArguments;
        if (isWindows) {
            args['initCommands'] = ['set charset UTF-8'];
        }
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                ...args,
            } as LaunchRequestArguments),
            {
                path: unicodeSrc,
                line: 3,
            }
        );
    });

    it('provides a decent error if program is omitted', async function () {
        if (isRemoteTest) {
            // attachRemote.spec.ts is the test for when isRemoteTest
            this.skip();
        }

        const errorMessage = await new Promise<Error>((resolve, reject) => {
            dc.launchRequest(
                fillDefaults(this.test, {} as LaunchRequestArguments)
            )
                .then(reject)
                .catch(resolve);
        });

        expect(errorMessage.message).to.satisfy((msg: string) =>
            msg.includes('program must be specified')
        );
    });

    it('executes preConnectCommands before initCommands', async function () {
        if (isRemoteTest) {
            this.skip();
        }
        // Capture all stdout output
        const stdOutput: string[] = [];
        dc.on('output', (event) => {
            if (event.body.category === 'stdout') {
                stdOutput.push(event.body.output);
            }
        });

        // Use unique markers to verify execution order
        const preMarker = 'pre?test?marker';
        const initMarker = 'init?test?marker';

        await dc.launchRequest(
            fillDefaults(this.test, {
                program: emptyProgram,
                openGdbConsole: false,
                preConnectCommands: ['echo pre\\?test\\?marker\\n'],
                initCommands: ['echo init\\?test\\?marker\\n'],
            } as LaunchRequestArguments)
        );

        // Verify both commands produced output
        const allOutput = stdOutput.join('');
        expect(allOutput).to.include(preMarker);
        expect(allOutput).to.include(initMarker);

        // Verify order: preConnectCommands should appear before initCommands in the output
        const preConnectPos = allOutput.indexOf(preMarker);
        const initPos = allOutput.indexOf(initMarker);
        expect(preConnectPos).to.be.greaterThan(-1);
        expect(initPos).to.be.greaterThan(-1);
        expect(preConnectPos).to.be.lessThan(
            initPos,
            'preConnectCommands should execute before initCommands'
        );
    });
});
