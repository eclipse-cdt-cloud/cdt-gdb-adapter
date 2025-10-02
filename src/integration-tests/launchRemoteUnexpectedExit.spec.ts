/*********************************************************************
 * Copyright (c) 2025 Arm Ltd., Kichwa Coders and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import {
    TargetLaunchRequestArguments,
    TargetLaunchArguments,
} from '../types/session';
import { CdtDebugClient } from './debugClient';
import {
    expectRejection,
    fillDefaults,
    gdbAsync,
    getScopes,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { assert, expect } from 'chai';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as chai from 'chai';
import * as chaistring from 'chai-string';
chai.use(chaistring);

describe('launch remote unexpected session exit', function () {
    let dc: CdtDebugClient;
    let stdOutput: string[] = [];
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const WAIT_FOR_EVENT_TIMEOUT = 1000;
    // GDB Server seems to exit in different ways when forcefully shut down. Depending
    // on mode, timing, host OS, etc.
    // We only care about it ending, hence both exit or signalled end satisfy the tests.
    const GDBSERVER_ENDED_REGEXP_STR = 'gdbserver (exited|killed)';

    const getDefaults = (
        test?: Mocha.Runnable,
        overrides?: unknown
    ): TargetLaunchRequestArguments => {
        return fillDefaults(test, {
            program: emptyProgram,
            target: {
                type: 'remote',
                serverDisconnectTimeout: 0,
            } as TargetLaunchArguments,
            ...(overrides as TargetLaunchArguments),
        } as TargetLaunchRequestArguments);
    };

    const waitForServerOutput = async (
        dc: CdtDebugClient,
        output: string
    ): Promise<DebugProtocol.OutputEvent> => {
        return dc.waitForOutputEvent(
            'server',
            output,
            true,
            WAIT_FOR_EVENT_TIMEOUT
        );
    };

    const stdOutputContains = (text: string): boolean => {
        return stdOutput.some((line) => line.startsWith(text));
    };

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
        // Capture output events, spyOn doesn't work well with logger
        dc.on('output', (event) => {
            if (event.body.category === 'stdout') {
                stdOutput.push(event.body.output);
            }
        });
    });

    afterEach(async function () {
        await dc.stop();
        stdOutput = [];
    });

    it("ends GDB server if GDB exits through CLI 'quit' command", async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Launch
        await dc.launch(getDefaults(this.test));
        // Get frame ID and build evaluateArguments
        const scope = await getScopes(dc);
        const evaluateRequestArgs: DebugProtocol.EvaluateArguments = {
            expression: '> quit',
            frameId: scope.frame.id,
            context: 'repl',
        };
        // Wait for multiple events, don't care about order
        const pendingPromises = [
            waitForServerOutput(dc, GDBSERVER_ENDED_REGEXP_STR),
            dc.waitForEvent('terminated', WAIT_FOR_EVENT_TIMEOUT),
        ];
        // Don't await evaluate response, it may not come depending on how quickly session shuts down.
        dc.evaluateRequest(evaluateRequestArgs);
        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await Promise.all(pendingPromises);

        expect(
            stdOutputContains(
                'GDB Remote session: GDB server exited, exiting session'
            )
        ).to.be.true;
    });

    it('sends error response and terminates GDB server if incorrect GDB path', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const pendingPromises = [
            waitForServerOutput(dc, GDBSERVER_ENDED_REGEXP_STR),
            waitForServerOutput(dc, 'gdbserver stopped'),
        ];
        // Launch
        const invalidGDBName = 'invalid_gdb';
        const launchPromise = dc.launch(
            getDefaults(this.test, { gdb: invalidGDBName })
        );

        const rejectError = await expectRejection(launchPromise);
        expect(rejectError.message).to.equal(`spawn ${invalidGDBName} ENOENT`);

        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await Promise.all(pendingPromises);

        expect(
            stdOutputContains(
                'GDB Remote session: GDB server exited, exiting session'
            )
        ).to.be.true;
    });

    it('sends error response and terminates GDB server if incorrect GDB CLI arg', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const outputPromise = waitForServerOutput(
            dc,
            GDBSERVER_ENDED_REGEXP_STR
        );
        // Launch
        const launchPromise = dc.launch(
            getDefaults(this.test, {
                target: { serverParameters: ['unknown-CLI-arg'] },
            })
        );

        const rejectError = await expectRejection(launchPromise);
        expect(rejectError.message).to.startWith(
            `gdbserver exited with code 1`
        );

        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await outputPromise;

        expect(
            stdOutputContains(
                'GDB Remote session: ' + 'GDB server exited, exiting session'
            )
        ).to.be.true;
    });

    it('sends error response if incorrect GDB server path', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const outputPromise = waitForServerOutput(
            dc,
            'gdbserver has hit error'
        );
        // Launch
        const invalidGDBServerName = 'invalid_gdbserver';
        const launchPromise = dc.launch(
            getDefaults(this.test, {
                target: {
                    type: 'remote', // required, overrides don't merge
                    server: invalidGDBServerName,
                } as TargetLaunchArguments,
            })
        );
        const rejectError = await expectRejection(launchPromise);
        expect(rejectError.message).to.startWith(
            `gdbserver has hit error Error: spawn ${invalidGDBServerName} ENOENT`
        );

        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await outputPromise;

        // Not expecting GDB session exit message, server should have errored out before that.
        expect(
            stdOutputContains(
                'GDB Remote session: GDB server exited, exiting session'
            )
        ).to.be.false;
    });

    it('sends error response if incorrect GDB server CLI arg', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const outputPromise = waitForServerOutput(
            dc,
            GDBSERVER_ENDED_REGEXP_STR
        );
        // Launch
        const launchPromise = dc.launch(
            getDefaults(this.test, {
                target: { serverParameters: ['unknown-CLI-arg'] },
            })
        );

        const rejectError = await expectRejection(launchPromise);
        expect(rejectError.message).to.startWith(
            `gdbserver exited with code 1`
        );

        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await outputPromise;

        expect(
            stdOutputContains(
                'GDB Remote session: GDB server exited, exiting session'
            )
        ).to.be.true;
    });

    it("terminates GDB if GDB Server unexpectedly terminates (uses 'watchServerProcess'='true' instead of 'undefined')", async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const gdbserverPIDPromise = dc.waitForOutputEvent(
            'stdout',
            /GDB Remote session: Spawned GDB Server \(PID \d+\)/.source,
            true,
            WAIT_FOR_EVENT_TIMEOUT
        );
        // Launch
        await dc.launch(
            getDefaults(this.test, { target: { watchServerProcess: true } })
        );
        const spawnedOutput = await gdbserverPIDPromise;
        expect(spawnedOutput).to.exist;
        const pidRegExp =
            /GDB Remote session: Spawned GDB Server \(PID (\d+)\)/;
        const pidMatch = spawnedOutput.body.output.match(pidRegExp);
        assert(pidMatch?.length === 2);
        const pidNum = parseInt(pidMatch[1]);
        const waitForPromises = [
            waitForServerOutput(dc, GDBSERVER_ENDED_REGEXP_STR),
            waitForServerOutput(dc, 'gdb exited'),
            dc.waitForEvent('terminated', WAIT_FOR_EVENT_TIMEOUT),
        ];
        process.kill(pidNum);

        // Any test error will throw here
        await Promise.all(waitForPromises);

        expect(
            stdOutputContains(
                'GDB Remote session: GDB server exited, exiting session'
            )
        ).to.be.true;
    });

    it("keeps GDB running if GDB Server terminates early and if 'watchServerProcess'='false'", async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const gdbserverPIDPromise = dc.waitForOutputEvent(
            'stdout',
            /GDB Remote session: Spawned GDB Server \(PID \d+\)/.source,
            true,
            WAIT_FOR_EVENT_TIMEOUT
        );
        // Launch
        await dc.launch(
            getDefaults(this.test, { target: { watchServerProcess: false } })
        );
        const spawnedOutput = await gdbserverPIDPromise;
        expect(spawnedOutput).to.exist;
        const pidRegExp =
            /GDB Remote session: Spawned GDB Server \(PID (\d+)\)/;
        const pidMatch = spawnedOutput.body.output.match(pidRegExp);
        assert(pidMatch?.length === 2);
        const pidNum = parseInt(pidMatch[1]);
        const waitForPromisesComplete = waitForServerOutput(
            dc,
            GDBSERVER_ENDED_REGEXP_STR
        );
        const waitForPromiseFailTimeout = 500;
        const waitForPromisesTimeout = [
            dc.waitForOutputEvent(
                'server',
                'gdb exited',
                true,
                waitForPromiseFailTimeout
            ),
            dc.waitForEvent('terminated', waitForPromiseFailTimeout),
        ];

        process.kill(pidNum);

        // Any test error will throw here
        await waitForPromisesComplete;
        await expectRejection(Promise.all(waitForPromisesTimeout));

        // In this case, the GDB session must not exit, hence check for not containing the exit message
        expect(
            stdOutputContains(
                'GDB Remote session: GDB server exited, exiting session'
            )
        ).to.be.false;
    });

    it('terminates GDB Server if GDB unexpectedly terminates', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const gdbserverPIDPromise = dc.waitForOutputEvent(
            'stdout',
            /Spawned GDB \(PID \d+\)/.source,
            true,
            WAIT_FOR_EVENT_TIMEOUT
        );
        // Launch
        await dc.launch(getDefaults(this.test));
        const spawnedOutput = await gdbserverPIDPromise;
        expect(spawnedOutput).to.exist;
        const pidRegExp = /Spawned GDB \(PID (\d+)\)/;
        const pidMatch = spawnedOutput.body.output.match(pidRegExp);
        assert(pidMatch?.length === 2);
        const pidNum = parseInt(pidMatch[1]);
        const waitForPromises = [
            // GDB doesn't print anything on termination, only wait for server
            waitForServerOutput(dc, GDBSERVER_ENDED_REGEXP_STR),
            dc.waitForEvent('terminated', WAIT_FOR_EVENT_TIMEOUT),
        ];
        process.kill(pidNum);

        // Any test error will throw here
        await Promise.all(waitForPromises);

        expect(
            stdOutputContains(
                'GDB Remote session: GDB server exited, exiting session'
            )
        ).to.be.true;
    });

    it("ends GDB server if GDB exits through CLI 'quit' command using graceful shutdown", async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Launch
        await dc.launch({
            ...getDefaults(this.test),
            target: {
                ...getDefaults(this.test).target,
                serverDisconnectTimeout: 2000, // Use graceful shutdown
            } as TargetLaunchArguments,
        } as TargetLaunchRequestArguments);
        const wait_for_event_timeout = 1000;

        // Get frame ID and build evaluateArguments
        const scope = await getScopes(dc);
        const evaluateRequestArgs: DebugProtocol.EvaluateArguments = {
            expression: '> quit',
            frameId: scope.frame.id,
            context: 'repl',
        };
        // Wait for multiple events, don't care about order
        const pendingPromises = [
            waitForServerOutput(dc, GDBSERVER_ENDED_REGEXP_STR),
            dc.waitForEvent('terminated', wait_for_event_timeout),
        ];
        // Don't await evaluate response, it may not come depending on how quickly session shuts down.
        dc.evaluateRequest(evaluateRequestArgs);
        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await Promise.all(pendingPromises);
    });
});
