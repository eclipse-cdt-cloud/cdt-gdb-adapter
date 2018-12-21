/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as cp from 'child_process';
import * as path from 'path';
import { DebugClient } from 'vscode-debugadapter-testsupport';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions

let dc: DebugClient;
let scopes: DebugProtocol.ScopesResponse;
let threads: DebugProtocol.ThreadsResponse;
const testProgramsDir = path.join(__dirname, '..', '..', 'src', 'integration-tests', 'test-programs');
const varsCppProgram = path.join(testProgramsDir, 'vars_cpp');
const varsCppSrc = path.join(testProgramsDir, 'vars_cpp.cpp');

beforeEach(async function () {
    // Build the test program
    cp.execSync('make', { cwd: testProgramsDir });

    let args: string = path.join(__dirname, '..', 'debugAdapter.js');
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        args = '--inspect-brk ' + args;
    }

    dc = new DebugClient('node', args, 'cppdbg', {
        shell: true,
    });
    await dc.start();
    await dc.initializeRequest();
    await dc.hitBreakpoint({ verbose: true, program: varsCppProgram }, { path: varsCppSrc, line: 36 });
    threads = await dc.threadsRequest();
    expect(threads.body.threads.length).to.equal(1);
    const stack = await dc.stackTraceRequest({ threadId: threads.body.threads[0].id });
    expect(stack.body.stackFrames.length).to.equal(1);
    scopes = await dc.scopesRequest({ frameId: stack.body.stackFrames[0].id });
    expect(scopes.body.scopes.length).to.equal(1);
});

afterEach(async function () {
    await dc.stop();
});

describe('Variables CPP Test Suite', function () {
    // Move the timeout out of the way if the adapter is going to be debugged.
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        this.timeout(9999999);
    }
    it('can read variables from a cpp object', function () {

    });

    it('can set variables in a cpp object', function () {

    });

});
