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
    fillDefaults,
    gdbAsync,
    getScopes,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { assert, expect } from 'chai';
import { DebugProtocol } from '@vscode/debugprotocol';

// GDB Server seems to exit in different ways when forcefully shut down. Depending
// on mode, timing, host OS, etc.
// We only care about it ending, hence both exit or signalled end satisfy the tests.
const GDBSERVER_ENDED_REGEXP_STR = "(gdbserver has exited|gdbserver is killed)";

describe('launch remote unexpected session exit', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const WAIT_FOR_EVENT_TIMEOUT = 1000;

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
    });

    afterEach(async function () {
        await dc.stop();
    });

    it("ends GDB server if GDB exits through CLI 'quit' command", async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Launch
        await dc.launch(
            fillDefaults(this.test, {
                program: emptyProgram,
                target: {
                    type: 'remote',
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments)
        );
        // Get frame ID and build evaluateArguments
        const scope = await getScopes(dc);
        const evaluateRequestArgs: DebugProtocol.EvaluateArguments = {
            expression: '> quit',
            frameId: scope.frame.id,
            context: 'repl',
        };
        // Wait for multiple events, don't care about order
        const pendingPromises = [
            dc.waitForOutputEvent(
                'server',
                GDBSERVER_ENDED_REGEXP_STR,
                true,
                WAIT_FOR_EVENT_TIMEOUT
            ),
            dc.waitForEvent('terminated', WAIT_FOR_EVENT_TIMEOUT),
        ];
        // Don't await evaluate response, it may not come depending on how quickly session shuts down.
        dc.evaluateRequest(evaluateRequestArgs);
        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await Promise.all(pendingPromises);
    });

    it('sends error response and terminates GDB server if incorrect GDB path', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const pendingPromises = [
            dc.waitForOutputEvent(
                'server',
                GDBSERVER_ENDED_REGEXP_STR,
                true,
                WAIT_FOR_EVENT_TIMEOUT
            ),
            dc.waitForOutputEvent(
                'server',
                'gdbserver stopped',
                true,
                WAIT_FOR_EVENT_TIMEOUT
            ),
        ];
        // Launch
        const invalidGDBName = 'invalid_gdb';
        try {
            await dc.launch(
                fillDefaults(this.test, {
                    program: emptyProgram,
                    gdb: invalidGDBName,
                    target: {
                        type: 'remote',
                    } as TargetLaunchArguments,
                } as TargetLaunchRequestArguments)
            );
        } catch (err) {
            const errMessage = (err as Error).message;
            expect(errMessage).to.equal(`spawn ${invalidGDBName} ENOENT`);
        }
        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await Promise.all(pendingPromises);
    });

    it('sends error response and terminates GDB server if incorrect GDB CLI arg', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const outputPromise = dc.waitForOutputEvent(
            'server',
            GDBSERVER_ENDED_REGEXP_STR,
            true,
            WAIT_FOR_EVENT_TIMEOUT
        );
        // Launch
        try {
            await dc.launch(
                fillDefaults(this.test, {
                    program: emptyProgram,
                    target: {
                        type: 'remote',
                        serverParameters: ['unknown-CLI-arg'],
                    } as TargetLaunchArguments,
                } as TargetLaunchRequestArguments)
            );
        } catch (err) {
            const errMessage = (err as Error).message;
            expect(errMessage.startsWith(`gdbserver has exited with code 1`)).to
                .be.true;
        }
        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await outputPromise;
    });

    it('sends error response if incorrect GDB server path', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const outputPromise = dc.waitForOutputEvent(
            'server',
            'gdbserver has hit error',
            true,
            WAIT_FOR_EVENT_TIMEOUT
        );
        // Launch
        const invalidGDBServerName = 'invalid_gdbserver';
        try {
            await dc.launch(
                fillDefaults(this.test, {
                    program: emptyProgram,
                    target: {
                        type: 'remote',
                        server: invalidGDBServerName,
                    } as TargetLaunchArguments,
                } as TargetLaunchRequestArguments)
            );
        } catch (err) {
            const errMessage = (err as Error).message;
            expect(errMessage).to.equal(
                `gdbserver has hit error Error: spawn ${invalidGDBServerName} ENOENT\n`
            );
        }
        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await outputPromise;
    });

    it('sends error response if incorrect GDB server CLI arg', async function () {
        // Only run for remote and gdbAsync
        if (!isRemoteTest || !gdbAsync) {
            this.skip();
        }
        // Rather long timeout, needed to wait through entire launch and exit process
        const outputPromise = dc.waitForOutputEvent(
            'server',
            GDBSERVER_ENDED_REGEXP_STR,
            true,
            WAIT_FOR_EVENT_TIMEOUT
        );
        // Launch
        try {
            await dc.launch(
                fillDefaults(this.test, {
                    program: emptyProgram,
                    target: {
                        type: 'remote',
                        serverParameters: ['unknown-CLI-arg'],
                    } as TargetLaunchArguments,
                } as TargetLaunchRequestArguments)
            );
        } catch (err) {
            const errMessage = (err as Error).message;
            expect(errMessage.startsWith(`gdbserver has exited with code 1`)).to
                .be.true;
        }
        // Wait for promises to resolve. No need for further checks, something would throw in error case.
        await outputPromise;
    });

    it('terminates GDB if GDB Server unexpectedly terminates', async function () {
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
            fillDefaults(this.test, {
                program: emptyProgram,
                target: {
                    type: 'remote',
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments)
        );
        const spawnedOutput = await gdbserverPIDPromise;
        expect(spawnedOutput).to.exist;
        const pidRegExp =
            /GDB Remote session: Spawned GDB Server \(PID (\d+)\)/;
        const pidMatch = spawnedOutput.body.output.match(pidRegExp);
        assert(pidMatch?.length === 2);
        const pidNum = parseInt(pidMatch[1]);
        const waitForPromises = [
            dc.waitForOutputEvent(
                'server',
                GDBSERVER_ENDED_REGEXP_STR,
                true,
                WAIT_FOR_EVENT_TIMEOUT
            ),
            dc.waitForOutputEvent(
                'server',
                'gdb exited',
                true,
                WAIT_FOR_EVENT_TIMEOUT
            ),
            dc.waitForEvent('terminated', WAIT_FOR_EVENT_TIMEOUT),
        ];
        // TODO: try using listeners instead of waiting for printed output.
        // But probably better to go with the (user-visible) output.
        //process.addListener()
        process.kill(pidNum);
        // Any test error will throw here
        await Promise.all(waitForPromises);
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
        await dc.launch(
            fillDefaults(this.test, {
                program: emptyProgram,
                target: {
                    type: 'remote',
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments)
        );
        const spawnedOutput = await gdbserverPIDPromise;
        expect(spawnedOutput).to.exist;
        const pidRegExp = /Spawned GDB \(PID (\d+)\)/;
        const pidMatch = spawnedOutput.body.output.match(pidRegExp);
        assert(pidMatch?.length === 2);
        const pidNum = parseInt(pidMatch[1]);
        const waitForPromises = [
            // GDB doesn't print anything on termination, only wait for server
            dc.waitForOutputEvent(
                'server',
                GDBSERVER_ENDED_REGEXP_STR,
                true,
                WAIT_FOR_EVENT_TIMEOUT
            ),
            dc.waitForEvent('terminated', WAIT_FOR_EVENT_TIMEOUT),
        ];
        process.kill(pidNum);
        // Any test error will throw here
        await Promise.all(waitForPromises);
    });
});
