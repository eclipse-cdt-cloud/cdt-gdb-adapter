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
import * as utils from './utils';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions

let dc: DebugClient;
let scope: utils.Scope;

const testProgramsDir = path.join(__dirname, '..', '..', 'src', 'integration-tests', 'test-programs');
const varsCppProgram = path.join(testProgramsDir, 'vars_cpp');
const varsCppSrc = path.join(testProgramsDir, 'vars_cpp.cpp');

beforeEach(async function() {
    // Build the test program
    cp.execSync('make', { cwd: testProgramsDir });

    let args: string = path.join(__dirname, '..', 'debugAdapter.js');
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        args = '--inspect-brk ' + args;
    }

    dc = new DebugClient('node', args, 'gdb');
    await dc.start();
    await dc.initializeRequest();
    await dc.hitBreakpoint({ verbose: true, program: varsCppProgram }, { path: varsCppSrc, line: 37 });
    scope = await utils.getScopes(dc);
    expect(scope.scopes.body.scopes.length, 'Unexpected number of scopes returned').to.equal(1);
});

afterEach(async function() {
    await dc.stop();
});

describe('Variables CPP Test Suite', function() {
    // Move the timeout out of the way if the adapter is going to be debugged.
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        this.timeout(9999999);
    }

    it('can read and set a cpp object variable', async function() {
        // check the initial conditions of the two variables
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(3);
        utils.verifyVariable(vars.body.variables[0], 'fooA', 'Foo *', undefined, true);
        utils.verifyVariable(vars.body.variables[1], 'fooB', 'Foo *', undefined, true);
        expect(vars.body.variables[0].value, 'Value of fooA matches fooB').to.not.equal(vars.body.variables[1].value);
        // check that the children names and values are the same, but values are different
        let childrenA = await dc.variablesRequest({ variablesReference: vars.body.variables[0].variablesReference });
        let childrenB = await dc.variablesRequest({ variablesReference: vars.body.variables[1].variablesReference });
        expect(
            childrenA.body.variables.length,
            'There is a different number of child variables than expected',
        ).to.equal(childrenB.body.variables.length);
        utils.compareVariable(childrenA.body.variables[0], childrenB.body.variables[0], true, true, false);
        utils.compareVariable(childrenA.body.variables[1], childrenB.body.variables[1], true, true, false);
        utils.compareVariable(childrenA.body.variables[2], childrenB.body.variables[2], true, true, false);
        // set fooA to be equal to fooB.
        await dc.setVariableRequest({ name: 'fooA', value: vars.body.variables[1].value, variablesReference: vr });
        // check types and value after the set
        const vars2 = await dc.variablesRequest({ variablesReference: vr });
        expect(vars2.body.variables.length, 'There is a different number of variables than expected').to.equal(3);
        utils.compareVariable(vars2.body.variables[0], vars2.body.variables[1], false, true, true);
        // check the objects are identical
        childrenA = await dc.variablesRequest({ variablesReference: vars2.body.variables[0].variablesReference });
        childrenB = await dc.variablesRequest({ variablesReference: vars2.body.variables[1].variablesReference });
        utils.compareVariable(childrenA.body.variables[0], childrenB.body.variables[0], true, true, true);
        utils.compareVariable(childrenA.body.variables[1], childrenB.body.variables[1], true, true, true);
        utils.compareVariable(childrenA.body.variables[2], childrenB.body.variables[2], true, true, true);
    });

    it('can read and set nested variables from a cpp object', async function() {
        // check initial conditions of fooA and its child elements
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(3);
        utils.verifyVariable(vars.body.variables[0], 'fooA', 'Foo *', undefined, true);
        expect(
            vars.body.variables[0].variablesReference,
            `${vars.body.variables[0].name} has no children`,
        ).to.not.equal(0);
        const childVR = vars.body.variables[0].variablesReference;
        let children = await dc.variablesRequest({ variablesReference: childVR });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected',
        ).to.equal(3);
        utils.verifyVariable(children.body.variables[0], 'a', 'int', '1');
        utils.verifyVariable(children.body.variables[1], 'c', 'char', '97 \'a\'');
        utils.verifyVariable(children.body.variables[2], 'b', 'int', '2');
        // set child value
        await dc.setVariableRequest({
            name: children.body.variables[0].name,
            value: '55',
            variablesReference: vars.body.variables[0].variablesReference,
        });
        // check the new values
        children = await dc.variablesRequest({ variablesReference: vars.body.variables[0].variablesReference });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected',
        ).to.equal(3);
        utils.verifyVariable(children.body.variables[0], 'a', 'int', '55');
        // these two values should be unchanged.
        utils.verifyVariable(children.body.variables[1], 'c', 'char', '97 \'a\'');
        utils.verifyVariable(children.body.variables[2], 'b', 'int', '2');
    });
});
