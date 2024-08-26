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
import { ThreadContext, base64ToHex } from '../GDBDebugSession';
import { DebugProtocol } from '@vscode/debugprotocol';

interface VariableContext {
    name: string;
    threadId: number;
    varAddress: number;
    stackFramePosition: number;
}

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

    /**
     * Verify that `resp` contains the bytes `expectedBytes` and the
     * `expectedAddress` start address matches. In this case we know
     * we're searching for a string so truncate after 0 byte.
     *
     */
    function verifyReadMemoryResponse(
        resp: DebugProtocol.ReadMemoryResponse,
        expectedBytes: string,
        expectedAddress: number
    ) {
        const memData = base64ToHex(resp.body?.data ?? '').toString();
        const memString = Buffer.from(memData.toString(), 'hex').toString();
        // Only use the data before the 0 byte (truncate after)
        const simpleString = memString.substring(0, memString.search(/\0/));
        expect(simpleString).eq(expectedBytes);
        expect(resp.body?.address).match(/^0x[0-9a-fA-F]+$/);
        if (resp.body?.address) {
            const actualAddress = parseInt(resp.body?.address);
            expect(actualAddress).eq(expectedAddress);
        }
    }

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

    it('verify threadId,frameID for multiple threads', async function () {
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

        const variableContextArray: VariableContext[] = [];
        const threads = await dc.threadsRequest();
        // cycle through the threads and create an index for later
        for (const threadInfo of threads.body.threads) {
            // threadId is the id of the thread in DAP
            const threadId = threadInfo.id;
            if (threadId === undefined) {
                // Shouldn't have undefined thread.
                fail('unreachable');
            }
            if (!(threadInfo.name in threadNames)) {
                continue;
            }

            if (gdbNonStop) {
                const waitForStopped = dc.waitForEvent('stopped');
                const pr = dc.pauseRequest({ threadId });
                await Promise.all([pr, waitForStopped]);
            }

            const stack = await dc.stackTraceRequest({ threadId });
            let nameAddress: number | undefined = undefined;
            let stackFramePosition = 0;
            // Frame Reference ID starts at 1000 but actual stack frame # is index.
            for (const frame of stack.body.stackFrames) {
                if (frame.name === 'PrintHello') {
                    // Grab the address for "name" in this thread now because
                    // gdb-non-stop doesn't have different frame.id's for threads.
                    const addrOfVariableResp = await dc.evaluateRequest({
                        expression: 'name',
                        frameId: frame.id,
                    });
                    nameAddress = parseInt(addrOfVariableResp.body.result, 16);
                    break;
                }
                stackFramePosition++;
            }
            if (nameAddress === undefined) {
                fail("Failed to find address of name in 'PrintHello'");
            }

            variableContextArray.push({
                name: threadInfo.name.toString(),
                threadId: threadInfo.id,
                varAddress: nameAddress,
                stackFramePosition,
            });
        }
        // cycle through the threads and confirm each thread name (different for each thread)
        for (const context of variableContextArray) {
            // Get the address of the variable.
            const mem = await dc.readMemoryWithContextRequest([
                {
                    memoryReference: '0x' + context.varAddress.toString(16),
                    count: 10,
                },
                {
                    threadId: context.threadId,
                    frameId: context.stackFramePosition,
                } as ThreadContext,
            ]);
            verifyReadMemoryResponse(mem, context.name, context.varAddress);
        }
    });
});
