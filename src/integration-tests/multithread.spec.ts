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
    gdbAsync,
} from './utils';
import { assert, expect } from 'chai';
import * as path from 'path';
import { fail } from 'assert';
import * as os from 'os';

describe('multithread', async function () {
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
        LINE_THREAD_IN_HELLO: 0,
        LINE_THREAD_INNER: 0,
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
            let printHelloFrameId: number | undefined = undefined;
            let callerFrameId: number | undefined = undefined;
            for (const frame of stack.body.stackFrames) {
                if (frame.name === 'PrintHello') {
                    printHelloFrameId = frame.id;
                } else if (printHelloFrameId !== undefined) {
                    callerFrameId = frame.id;
                    break;
                }
            }
            if (printHelloFrameId === undefined) {
                fail("Failed to find frame with name 'PrintHello'");
            }
            if (callerFrameId === undefined) {
                fail("Failed to find frame that called 'PrintHello'");
            }

            {
                const scopes = await dc.scopesRequest({
                    frameId: callerFrameId,
                });
                const vr = scopes.body.scopes[0].variablesReference;
                const vars = await dc.variablesRequest({
                    variablesReference: vr,
                });
                const varnameToValue = new Map(
                    vars.body.variables.map((variable) => [
                        variable.name,
                        variable.value,
                    ])
                );
                // Make sure we aren't getting the HelloWorld frame's variables.
                // The calling method (in glibc or similar) may end up with a local
                // variable called thread_id, if so, update this heuristic
                expect(varnameToValue.get('thread_id')).to.be.undefined;
            }
            {
                const scopes = await dc.scopesRequest({
                    frameId: printHelloFrameId,
                });
                const vr = scopes.body.scopes[0].variablesReference;
                const vars = await dc.variablesRequest({
                    variablesReference: vr,
                });
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
            {
                // Make sure we can get variables for frame 0,
                // the contents of those variables don't actually matter
                // as the thread will probably be stopped in a library
                // somewhere waiting for a semaphore
                // This is a test for #235
                const scopes = await dc.scopesRequest({
                    frameId: stack.body.stackFrames[0].id,
                });
                const vr = scopes.body.scopes[0].variablesReference;

                const vars = await dc.variablesRequest({
                    variablesReference: vr,
                });
                const varnameToValue = new Map(
                    vars.body.variables.map((variable) => [
                        variable.name,
                        variable.value,
                    ])
                );
                // Make sure we aren't getting the HelloWorld frame's variables.
                // The calling method (in glibc or similar) may end up with a local
                // variable called thread_id, if so, update this heuristic
                // We could be stopped PrintHello, so we don't perform the check
                // if that is the case
                if (stack.body.stackFrames[0].id !== printHelloFrameId) {
                    expect(varnameToValue.get('thread_id')).to.be.undefined;
                }
            }
        }
    });

    it('async resume for gdb-non-stop off', async function () {
        if (gdbNonStop) {
            // This test is covering only gdb-non-stop off mode
            this.skip();
        } else if (os.platform() === 'win32' && (!isRemoteTest || !gdbAsync)) {
            // Only supported in win32 host with remote + mi-async targets
            this.skip();
        }

        await dc.launchRequest(
            fillDefaults(this.test, {
                program,
            })
        );
        await dc.setBreakpointsRequest({
            source: {
                path: source,
            },
            breakpoints: [
                {
                    line: lineTags['LINE_MAIN_ALL_THREADS_STARTED'],
                },
                {
                    line: lineTags['LINE_THREAD_IN_HELLO'],
                },
            ],
        });

        const waitForStop = dc.waitForEvent('stopped');
        await dc.configurationDoneRequest();
        await waitForStop;

        const threads = await dc.threadsRequest();

        // make sure that there is at least 2 threads.
        expect(threads.body.threads).length.greaterThanOrEqual(2);

        const waitForContinue = dc.waitForEvent('continued');
        // Send continue to thread 2
        dc.send('cdt-gdb-tests/executeCommand', {
            command: '-exec-continue --thread 2',
        });

        const event = await waitForContinue;

        // In allThreadsContinued:true case we are expecting id of the first thread no matter which thread is continued
        assert.deepEqual(event.body, {
            threadId: threads.body.threads[0].id,
            allThreadsContinued: true,
        });
    });

    it('async resume for gdb-non-stop on', async function () {
        if (!gdbNonStop) {
            // This test is covering only gdb-non-stop on
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

        // make sure that there is at least 6 threads.
        expect(threads.body.threads).length.greaterThanOrEqual(6);

        // stop the running threads
        const runningThreads = threads.body.threads.filter(
            (t) => (t as unknown as { running?: boolean }).running
        );
        for (const thread of runningThreads) {
            const waitForStop = dc.waitForEvent('stopped');
            await dc.pauseRequest({ threadId: thread.id });
            await waitForStop;
        }

        for (const thread of threads.body.threads) {
            const waitForContinue = dc.waitForEvent('continued');
            // Send an async continue request and wait for the continue event.
            dc.send('cdt-gdb-tests/executeCommand', {
                command: `-exec-continue --thread ${thread.id}`,
            });
            const event = await waitForContinue;

            assert.deepEqual<any>(event.body, {
                threadId: thread.id,
                allThreadsContinued: false,
            });
        }
    });

    it('gets varible values at different frames for different threads', async function () {
        if (!gdbNonStop) {
            // This test is covering only gdb-non-stop on
            this.skip();
        }

        await dc.launchRequest(
            fillDefaults(this.test, {
                program,
            })
        );
        await dc.setBreakpointsRequest({
            source: {
                path: source,
            },
            breakpoints: [
                {
                    line: lineTags['LINE_MAIN_ALL_THREADS_STARTED'],
                },
                {
                    line: lineTags['LINE_THREAD_INNER'],
                },
            ],
        });

        const waitForStop = dc.waitForEvent('stopped');
        await dc.configurationDoneRequest();
        await waitForStop;

        // make sure that all the threads have stopped
        // TODO instead of a sleep, wait until all threads have stopped
        await new Promise((f) => setTimeout(f, 1000));
        const threads = await dc.threadsRequest();
        const runningThreads = threads.body.threads.filter(
            (t) => (t as unknown as { running?: boolean }).running
        );
        expect(runningThreads).to.be.an('array').that.is.empty;
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

            const stack = await dc.stackTraceRequest({ threadId });

            // Iterate through stack frames:
            // Stack frame 0 is the inner method
            // Stack frames 1 to id + 1 are the recursive method
            // Stack frame id + 2 is PrintHello
            for (let i = 0; i < idInProgram + 3; i++) {
                if (i == 0) {
                    expect(stack.body.stackFrames[i].name).to.eq(
                        'inner_method'
                    );
                } else if (i == idInProgram + 2) {
                    expect(stack.body.stackFrames[i].name).to.eq('PrintHello');
                } else {
                    expect(stack.body.stackFrames[i].name).to.eq('recursive');
                }

                const scopes = await dc.scopesRequest({
                    frameId: stack.body.stackFrames[i].id,
                });
                const vr = scopes.body.scopes[0].variablesReference;
                const vars = await dc.variablesRequest({
                    variablesReference: vr,
                });
                const varnameToValue = new Map(
                    vars.body.variables.map((variable) => [
                        variable.name,
                        variable.value,
                    ])
                );
                expect(varnameToValue.get('thread_id')).to.equal(
                    idInProgram.toString()
                );

                if (i == 0) {
                    expect(varnameToValue.get('thread_id_plus_1')).to.equal(
                        (idInProgram + 1).toString()
                    );
                    expect(varnameToValue.get('thread_id_plus_2')).to.equal(
                        (idInProgram + 2).toString()
                    );
                }

                if (i > 0 && i < idInProgram + 2) {
                    expect(varnameToValue.get('depth')).to.equal(
                        (i - 1).toString()
                    );
                }
            }
        }
    });

    it('gets and sets register values at different frames for different threads', async function () {
        if (!gdbNonStop) {
            // This test is covering only gdb-non-stop on
            this.skip();
        }

        await dc.launchRequest(
            fillDefaults(this.test, {
                program,
            })
        );
        await dc.setBreakpointsRequest({
            source: {
                path: source,
            },
            breakpoints: [
                {
                    line: lineTags['LINE_MAIN_ALL_THREADS_STARTED'],
                },
                {
                    line: lineTags['LINE_THREAD_INNER'],
                },
            ],
        });

        const waitForStop = dc.waitForEvent('stopped');
        await dc.configurationDoneRequest();
        await waitForStop;

        // make sure that all the threads have stopped
        // TODO instead of a sleep, wait until all threads have stopped
        await new Promise((f) => setTimeout(f, 1000));
        const threads = await dc.threadsRequest();
        const runningThreads = threads.body.threads.filter(
            (t) => (t as unknown as { running?: boolean }).running
        );
        expect(runningThreads).to.be.an('array').that.is.empty;
        const nameToId = new Map(
            threads.body.threads.map((thread) => [thread.name, thread.id])
        );

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

            const stack = await dc.stackTraceRequest({ threadId });

            // Iterate through stack frames:
            // Stack frame 0 is the inner method
            // Stack frames 1 to id + 1 are the recursive method
            // Stack frame id + 2 is PrintHello
            for (let i = 0; i < idInProgram + 3; i++) {
                if (i == 0) {
                    expect(stack.body.stackFrames[i].name).to.eq(
                        'inner_method'
                    );
                } else if (i == idInProgram + 2) {
                    expect(stack.body.stackFrames[i].name).to.eq('PrintHello');
                } else {
                    expect(stack.body.stackFrames[i].name).to.eq('recursive');
                }

                const scopes = await dc.scopesRequest({
                    frameId: stack.body.stackFrames[i].id,
                });
                const vr = scopes.body.scopes[1].variablesReference;
                const vars = await dc.variablesRequest({
                    variablesReference: vr,
                });

                const regPC = vars.body.variables.find(
                    (v) => v.name === 'pc' || v.name === 'rip'
                );
                // assert instead of expect to make tsc happy so we don't need forbidden non-null assertions below
                assert(regPC !== undefined, 'expected regPC to exist');
                const reg0 = vars.body.variables[0];

                const setRegPC = await dc.setVariableRequest({
                    name: regPC.name,
                    value: '0x200',
                    variablesReference: vr,
                });
                expect(setRegPC.body.value).to.equal('0x200');

                const setReg0 = await dc.setVariableRequest({
                    name: reg0.name,
                    value: '0x55555',
                    variablesReference: vr,
                });
                expect(setReg0.body.value).to.equal('0x55555');

                const vars1 = await dc.variablesRequest({
                    variablesReference: vr,
                });
                expect(vars1.body.variables.length).to.equal(
                    vars.body.variables.length
                );

                const varnameToValue1 = new Map(
                    vars1.body.variables.map((variable) => [
                        variable.name,
                        variable.value,
                    ])
                );
                expect(varnameToValue1.get(regPC.name)).to.equal('0x200');
                expect(varnameToValue1.get(reg0.name)).to.equal('0x55555');

                await dc.setVariableRequest({
                    name: regPC.name,
                    value: regPC.value,
                    variablesReference: vr,
                });
                await dc.setVariableRequest({
                    name: reg0.name,
                    value: reg0.value,
                    variablesReference: vr,
                });
            }
        }
    });
});
