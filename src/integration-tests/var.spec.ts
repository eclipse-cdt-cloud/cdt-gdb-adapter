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
import * as path from 'path';
import { LaunchRequestArguments } from '..';
import { CdtDebugClient } from './debugClient';
import {
    gdbPath, getScopes, openGdbConsole, resolveLineTagLocations, Scope, standardBeforeEach,
    testProgramsDir, verifyVariable,
} from './utils';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions

describe('Variables Test Suite', function() {

    let dc: CdtDebugClient;
    let scope: Scope;
    const varsProgram = path.join(testProgramsDir, 'vars');
    const varsSrc = path.join(testProgramsDir, 'vars.c');
    const numVars = 8; // number of variables in the main() scope of vars.c

    const lineTags = {
        'STOP HERE': 0,
    };

    const hexValueRegex = /0x[\d]+/;

    before(function() {
        resolveLineTagLocations(varsSrc, lineTags);
    });

    beforeEach(async function() {
        dc = await standardBeforeEach();

        await dc.hitBreakpoint({
            verbose: true,
            gdb: gdbPath,
            program: varsProgram,
            openGdbConsole,
        } as LaunchRequestArguments, {
                path: varsSrc,
                line: lineTags['STOP HERE'],
            });
        scope = await getScopes(dc);
        expect(scope.scopes.body.scopes.length, 'Unexpected number of scopes returned').to.equal(1);
    });

    afterEach(async function() {
        await dc.stop();
    });

    // Move the timeout out of the way if the adapter is going to be debugged.
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        this.timeout(9999999);
    }
    it('can read and set simple variables in a program', async function() {
        // read the variables
        const vr = scope.scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[0], 'a', 'int', '1');
        verifyVariable(vars.body.variables[1], 'b', 'int', '2');
        // set the variables to something different
        await dc.setVariableRequest({ name: 'a', value: '25', variablesReference: vr });
        await dc.setVariableRequest({ name: 'b', value: '10', variablesReference: vr });
        // assert that the variables have been updated to the new values
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[0], 'a', 'int', '25');
        verifyVariable(vars.body.variables[1], 'b', 'int', '10');
        // step the program and see that the values were passed to the program and evaluated.
        await dc.nextRequest({ threadId: scope.threadId });
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[2], 'c', 'int', '35');
    });

    it('can read and set struct variables in a program', async function() {
        // step past the initialization for the structure
        await dc.nextRequest({ threadId: scope.threadId });
        await dc.nextRequest({ threadId: scope.threadId });
        scope = await getScopes(dc);
        expect(scope.scopes.body.scopes.length, 'Unexpected number of scopes returned').to.equal(1);
        // assert we can see the struct and its elements
        let vr = scope.scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[3], 'r', 'struct foo', '{...}', true);
        const childVR = vars.body.variables[3].variablesReference;
        let children = await dc.variablesRequest({ variablesReference: childVR });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected',
        ).to.equal(3);
        verifyVariable(children.body.variables[0], 'x', 'int', '1');
        verifyVariable(children.body.variables[1], 'y', 'int', '2');
        verifyVariable(children.body.variables[2], 'z', 'struct bar', '{...}', true);
        // set the variables to something different
        await dc.setVariableRequest({ name: 'x', value: '25', variablesReference: childVR });
        await dc.setVariableRequest({ name: 'y', value: '10', variablesReference: childVR });
        // assert that the variables have been updated to the new values
        children = await dc.variablesRequest({ variablesReference: childVR });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected',
        ).to.equal(3);
        verifyVariable(children.body.variables[0], 'x', 'int', '25');
        verifyVariable(children.body.variables[1], 'y', 'int', '10');
        // step the program and see that the values were passed to the program and evaluated.
        await dc.nextRequest({ threadId: scope.threadId });
        scope = await getScopes(dc);
        expect(scope.scopes.body.scopes.length, 'Unexpected number of scopes returned').to.equal(1);
        vr = scope.scopes.body.scopes[0].variablesReference;
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[4], 'd', 'int', '35');
    });

    it('can read and set nested struct variables in a program', async function() {
        // step past the initialization for the structure
        await dc.nextRequest({ threadId: scope.threadId });
        await dc.nextRequest({ threadId: scope.threadId });
        scope = await getScopes(dc);
        expect(scope.scopes.body.scopes.length, 'Unexpected number of scopes returned').to.equal(1);
        // assert we can see the 'foo' struct and its child 'bar' struct
        let vr = scope.scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[3], 'r', 'struct foo', '{...}', true);
        const childVR = vars.body.variables[3].variablesReference;
        const children = await dc.variablesRequest({ variablesReference: childVR });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected',
        ).to.equal(3);
        verifyVariable(children.body.variables[2], 'z', 'struct bar', '{...}', true);
        // assert we can see the elements of z
        const subChildVR = children.body.variables[2].variablesReference;
        let subChildren = await dc.variablesRequest({ variablesReference: subChildVR });
        expect(
            subChildren.body.variables.length,
            'There is a different number of grandchild variables than expected',
        ).to.equal(2);
        verifyVariable(subChildren.body.variables[0], 'a', 'int', '3');
        verifyVariable(subChildren.body.variables[1], 'b', 'int', '4');
        // set the variables to something different
        await dc.setVariableRequest({ name: 'a', value: '25', variablesReference: subChildVR });
        await dc.setVariableRequest({ name: 'b', value: '10', variablesReference: subChildVR });
        // assert that the variables have been updated to the new values
        subChildren = await dc.variablesRequest({ variablesReference: subChildVR });
        expect(
            subChildren.body.variables.length,
            'There is a different number of grandchild variables than expected',
        ).to.equal(2);
        verifyVariable(subChildren.body.variables[0], 'a', 'int', '25');
        verifyVariable(subChildren.body.variables[1], 'b', 'int', '10');
        // step the program and see that the values were passed to the program and evaluated.
        await dc.nextRequest({ threadId: scope.threadId });
        await dc.nextRequest({ threadId: scope.threadId });
        scope = await getScopes(dc);
        expect(scope.scopes.body.scopes.length, 'Unexpected number of scopes returned').to.equal(1);
        vr = scope.scopes.body.scopes[0].variablesReference;
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[5], 'e', 'int', '35');
    });

    it('can read and set array elements in a program', async function() {
        // skip ahead to array initialization
        const br = await dc.setBreakpointsRequest({ source: { path: varsSrc }, breakpoints: [{ line: 24 }] });
        expect(br.success).to.equal(true);
        await dc.continueRequest({ threadId: scope.threadId });
        scope = await getScopes(dc);
        expect(scope.scopes.body.scopes.length, 'Unexpected number of scopes returned').to.equal(1);
        // assert we can see the array and its elements
        let vr = scope.scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[6], 'f', 'int [3]', undefined, true);
        expect(hexValueRegex.test(vars.body.variables[6].value),
            'The display value of the array is not a hexidecimal address').to.equal(true);
        const childVR = vars.body.variables[6].variablesReference;
        let children = await dc.variablesRequest({ variablesReference: childVR });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected',
        ).to.equal(3);
        verifyVariable(children.body.variables[0], '[0]', 'int', '1');
        verifyVariable(children.body.variables[1], '[1]', 'int', '2');
        verifyVariable(children.body.variables[2], '[2]', 'int', '3');
        // set the variables to something different
        await dc.setVariableRequest({ name: '[0]', value: '11', variablesReference: childVR });
        await dc.setVariableRequest({ name: '[1]', value: '22', variablesReference: childVR });
        await dc.setVariableRequest({ name: '[2]', value: '33', variablesReference: childVR });
        // assert that the variables have been updated to the new values
        children = await dc.variablesRequest({ variablesReference: childVR });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected',
        ).to.equal(3);
        verifyVariable(children.body.variables[0], '[0]', 'int', '11');
        verifyVariable(children.body.variables[1], '[1]', 'int', '22');
        verifyVariable(children.body.variables[2], '[2]', 'int', '33');
        // step the program and see that the values were passed to the program and evaluated.
        await dc.nextRequest({ threadId: scope.threadId });
        scope = await getScopes(dc);
        expect(scope.scopes.body.scopes.length, 'Unexpected number of scopes returned').to.equal(1);
        vr = scope.scopes.body.scopes[0].variablesReference;
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(vars.body.variables.length, 'There is a different number of variables than expected').to.equal(numVars);
        verifyVariable(vars.body.variables[7], 'g', 'int', '66');
    });
});
