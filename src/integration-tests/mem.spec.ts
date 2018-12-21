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
import * as cp from 'child_process';
import * as path from 'path';
import { DebugClient } from 'vscode-debugadapter-testsupport';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { MemoryResponse } from '../GDBDebugSession';
import { expectRejection } from './utils';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions

let dc: DebugClient;
let scope: DebugProtocol.Scope;
const testProgramsDir = path.join(__dirname, '..', '..', 'src', 'integration-tests', 'test-programs');
const memProgram = path.join(testProgramsDir, 'mem');
const memSrc = path.join(testProgramsDir, 'mem.c');

function getAdapterAndArgs(): string {
    let args: string = path.join(__dirname, '..', 'debugAdapter.js');
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        args = '--inspect-brk ' + args;
    }
    return args;
}

beforeEach(async function() {
    // Build the test program
    cp.execSync('make', { cwd: testProgramsDir });

    dc = new DebugClient('node', getAdapterAndArgs(), 'cppdbg', {
        shell: true,
    });
    await dc.start();
    await dc.initializeRequest();
    await dc.hitBreakpoint({
        program: memProgram,
    }, { path: memSrc, line: 12 });
    const threads = await dc.threadsRequest();
    expect(threads.body.threads.length).to.equal(1);
    const stack = await dc.stackTraceRequest({ threadId: threads.body.threads[0].id });
    expect(stack.body.stackFrames.length).to.equal(1);
    const scopes = await dc.scopesRequest({ frameId: stack.body.stackFrames[0].id });
    expect(scopes.body.scopes.length).to.equal(1);
    scope = scopes.body.scopes[0];
});

afterEach(async function() {
    await dc.stop();
});

describe('Memory Test Suite', function() {
    it('can read memory', async function() {
        // Get the address of the array through a local variables request.
        const vars = await dc.variablesRequest({
            variablesReference: scope.variablesReference,
        });

        let addr: number = 0;
        for (const v of vars.body.variables) {
            if (v.name === 'parray') {
                addr = parseInt(v.value, 16);
            }
        }

        const mem = (await dc.send('cdt-gdb-adapter/Memory', {
            address: addr,
            length: 10,
        })) as MemoryResponse;

        expect(mem.body.data).eq('f1efd4fd7248450c2d13');
    });

    it('handles unable to read memory', async function() {
        // This test will only work for targets for which address 0 is not readable, which is good enough for now.
        const err = await expectRejection(dc.send('cdt-gdb-adapter/Memory', {
            address: 0,
            length: 10,
        }));
        expect(err.message).contains('Unable to read memory');
    });
});
