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
const varsProgram = path.join(testProgramsDir, 'vars');
const varsSrc = path.join(testProgramsDir, 'vars.c');

beforeEach(async function() {
    // Build the test program
    cp.execSync('make', { cwd: testProgramsDir });

    let args: string = path.join(__dirname, '..', 'debugAdapter.js');
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        args = '--inspect-brk ' + args;
    }

    dc = new DebugClient('node', args, 'gdb', {
        shell: true,
    });
    await dc.start();
    await dc.initializeRequest();
    await dc.hitBreakpoint({ verbose: true, program: varsProgram }, { path: varsSrc, line: 5 });
    threads = await dc.threadsRequest();
    expect(threads.body.threads.length).to.equal(1);
    const stack = await dc.stackTraceRequest({ threadId: threads.body.threads[0].id });
    expect(stack.body.stackFrames.length).to.equal(1);
    scopes = await dc.scopesRequest({ frameId: stack.body.stackFrames[0].id });
    expect(scopes.body.scopes.length).to.equal(1);
});

afterEach(async function() {
    await dc.stop();
});

describe('Variables Test Suite', function() {
    // Move the timeout out of the way if the adapter is going to be debugged.
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        this.timeout(9999999);
    }
    it('can read variables from a program', async function() {
        const vars = await dc.variablesRequest({ variablesReference: scopes.body.scopes[0].variablesReference });
        expect(vars.body.variables.length).to.equal(3);
        expect(vars.body.variables[0].name).to.equal('a');
        expect(vars.body.variables[0].value).to.equal('1');
        expect(vars.body.variables[1].name).to.equal('b');
        expect(vars.body.variables[1].value).to.equal('2');
    });

    it('can set variables in a program', async function() {
        const vr = scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length).to.equal(3);
        expect(vars.body.variables[0].name).to.equal('a');
        expect(vars.body.variables[0].value).to.equal('1');
        expect(vars.body.variables[1].name).to.equal('b');
        expect(vars.body.variables[1].value).to.equal('2');
        // set the variables to something different
        await dc.setVariableRequest({ name: 'a', value: '25', variablesReference: vr });
        await dc.setVariableRequest({ name: 'b', value: '10', variablesReference: vr });
        // assert that the variables have been updated to the new values
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length).to.equal(3);
        expect(vars.body.variables[0].name).to.equal('a');
        expect(vars.body.variables[0].value).to.equal('25');
        expect(vars.body.variables[1].name).to.equal('b');
        expect(vars.body.variables[1].value).to.equal('10');
        // step the program and see that the values were passed to the program and evaluated.
        await dc.nextRequest({ threadId: threads.body.threads[0].id });
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length).to.equal(3);
        expect(vars.body.variables[2].name).to.equal('c');
        expect(vars.body.variables[2].value).to.equal('35');
    });
});
