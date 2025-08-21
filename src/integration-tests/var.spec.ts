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
import { CdtDebugClient } from './debugClient';
import {
    getScopes,
    resolveLineTagLocations,
    Scope,
    standardBeforeEach,
    testProgramsDir,
    verifyVariable,
    verifyRegister,
    fillDefaults,
} from './utils';
import * as chai from 'chai';
import * as chaistring from 'chai-string';
chai.use(chaistring);

describe('Variables Test Suite', function () {
    let dc: CdtDebugClient;
    let scope: Scope;
    const varsProgram = path.join(testProgramsDir, 'vars');
    const varsSrc = path.join(testProgramsDir, 'vars.c');
    const numVars = 11; // number of variables in the main() scope of vars.c

    const lineTags = {
        'STOP HERE': 0,
        'After array init': 0,
        'char string setup': 0,
    };

    const hexValueRegex = /^0x[\da-fA-F]+$/;

    before(function () {
        resolveLineTagLocations(varsSrc, lineTags);
    });

    beforeEach(async function () {
        dc = await standardBeforeEach();

        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, {
                program: varsProgram,
            }),
            {
                path: varsSrc,
                line: lineTags['STOP HERE'],
            }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('can read and set simple variables in a program', async function () {
        // read the variables
        let vr = scope.scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[0], 'a', 'int', '1');
        verifyVariable(vars.body.variables[1], 'b', 'int', '2');
        // set the variables to something different
        const setAinHex = await dc.setVariableRequest({
            name: 'a',
            value: '0x25',
            variablesReference: vr,
        });
        expect(setAinHex.body.value).to.equal('37');
        const setA = await dc.setVariableRequest({
            name: 'a',
            value: '25',
            variablesReference: vr,
        });
        expect(setA.body.value).to.equal('25');
        const setB = await dc.setVariableRequest({
            name: 'b',
            value: '10',
            variablesReference: vr,
        });
        expect(setB.body.value).to.equal('10');
        // assert that the variables have been updated to the new values
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[0], 'a', 'int', '25');
        verifyVariable(vars.body.variables[1], 'b', 'int', '10');
        // step the program and see that the values were passed to the program and evaluated.
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['STOP HERE'] + 1 }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        vr = scope.scopes.body.scopes[0].variablesReference;
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[2], 'c', 'int', '35');
    });

    it('can read and set simple registers in a program', async function () {
        // read the registers
        const vr = scope.scopes.body.scopes[1].variablesReference;
        const vr1 = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        const vars1 = await dc.variablesRequest({ variablesReference: vr1 });

        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.be.greaterThanOrEqual(5); // 5 is a good bet to make sure that code has probably worked
        const r0 = vars.body.variables[0];
        const r1 = vars.body.variables[1];
        const rn = vars.body.variables[vars.body.variables.length - 1];
        // can't check specific names or register values easily as that
        // is not cross platform
        expect(r0.evaluateName).to.startWith('$');
        expect(r0.name).to.not.equal(r1.name);
        // add other useful tests here, especially ones that test boundary conditions
        expect(rn?.evaluateName).to.startWith('$'); // check last registers
        // set the registers value to something different
        const setR0 = await dc.setVariableRequest({
            name: r0.name,
            value: '55',
            variablesReference: vr,
        });
        expect(setR0.body.value).to.equal('0x37');
        const setR0inHex = await dc.setVariableRequest({
            name: r0.name,
            value: '0x55',
            variablesReference: vr,
        });
        expect(setR0inHex.body.value).to.equal('0x55');
        const setR1inHex = await dc.setVariableRequest({
            name: r1.name,
            value: '0x45',
            variablesReference: vr,
        });
        expect(setR1inHex.body.value).to.equal('0x45');
        const setR1 = await dc.setVariableRequest({
            name: r1.name,
            value: '45',
            variablesReference: vr,
        });
        expect(setR1.body.value).to.equal('0x2d');
        // assert that the registers value have been updated to the new values
        const vars2 = await dc.variablesRequest({ variablesReference: vr });
        const vars3 = await dc.variablesRequest({ variablesReference: vr1 });
        expect(
            vars2.body.variables.length,
            'There is a different number of registers than expected'
        ).to.equal(vars.body.variables.length);
        verifyRegister(vars2.body.variables[0], r0.name, '0x55');
        verifyRegister(vars2.body.variables[1], r1.name, '0x2d');
        verifyRegister(
            vars3.body.variables[8],
            r0.name,
            vars1.body.variables[8].value
        );
    });

    it('can read and set struct variables in a program', async function () {
        // step past the initialization for the structure
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['STOP HERE'] + 1 }
        );
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['STOP HERE'] + 2 }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        // assert we can see the struct and its elements
        let vr = scope.scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[3], 'r', 'struct foo', '{...}', {
            hasChildren: true,
        });
        const childVR = vars.body.variables[3].variablesReference;
        let children = await dc.variablesRequest({
            variablesReference: childVR,
        });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(4);
        verifyVariable(children.body.variables[0], 'x', 'int', '1', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[1], 'y', 'int', '2', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[2], 'z', 'struct bar', '{...}', {
            hasChildren: true,
            hasMemoryReference: false,
        });
        // set the variables to something different
        const setXinHex = await dc.setVariableRequest({
            name: 'x',
            value: '0x25',
            variablesReference: childVR,
        });
        expect(setXinHex.body.value).to.equal('37');
        const setX = await dc.setVariableRequest({
            name: 'x',
            value: '25',
            variablesReference: childVR,
        });
        expect(setX.body.value).to.equal('25');
        const setY = await dc.setVariableRequest({
            name: 'y',
            value: '10',
            variablesReference: childVR,
        });
        expect(setY.body.value).to.equal('10');
        // assert that the variables have been updated to the new values
        children = await dc.variablesRequest({ variablesReference: childVR });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(4);
        verifyVariable(children.body.variables[0], 'x', 'int', '25', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[1], 'y', 'int', '10', {
            hasMemoryReference: false,
        });
        // step the program and see that the values were passed to the program and evaluated.
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['STOP HERE'] + 3 }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        vr = scope.scopes.body.scopes[0].variablesReference;
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[4], 'd', 'int', '35');
    });

    it('can read and set nested struct variables in a program', async function () {
        // step past the initialization for the structure
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['STOP HERE'] + 1 }
        );
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['STOP HERE'] + 2 }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        // assert we can see the 'foo' struct and its child 'bar' struct
        let vr = scope.scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[3], 'r', 'struct foo', '{...}', {
            hasChildren: true,
        });
        const childVR = vars.body.variables[3].variablesReference;
        const children = await dc.variablesRequest({
            variablesReference: childVR,
        });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(4);
        verifyVariable(children.body.variables[2], 'z', 'struct bar', '{...}', {
            hasChildren: true,
            hasMemoryReference: false,
        });
        // assert we can see the elements of z
        const subChildVR = children.body.variables[2].variablesReference;
        let subChildren = await dc.variablesRequest({
            variablesReference: subChildVR,
        });
        expect(
            subChildren.body.variables.length,
            'There is a different number of grandchild variables than expected'
        ).to.equal(2);
        verifyVariable(subChildren.body.variables[0], 'a', 'int', '3', {
            hasMemoryReference: false,
        });
        verifyVariable(subChildren.body.variables[1], 'b', 'int', '4', {
            hasMemoryReference: false,
        });

        // Evaluate the child structure foo.bar of r
        let res = await dc.evaluateRequest({
            context: 'variables',
            expression: 'r.z',
            frameId: scope.frame.id,
        });
        expect(res.body.result).eq('{\n  "a": 3,\n  "b": 4\n}');

        // Evaluate the child structure foo.baz of r
        res = await dc.evaluateRequest({
            context: 'variables',
            expression: 'r.aa',
            frameId: scope.frame.id,
        });
        expect(res.body.result).eq('{\n  "w": 3.1415,\n  "v": 1234.5678\n}');

        // set the variables to something different
        const setAinHex = await dc.setVariableRequest({
            name: 'a',
            value: '0x25',
            variablesReference: subChildVR,
        });
        expect(setAinHex.body.value).to.equal('37');
        const setA = await dc.setVariableRequest({
            name: 'a',
            value: '25',
            variablesReference: subChildVR,
        });
        expect(setA.body.value).to.equal('25');
        const setB = await dc.setVariableRequest({
            name: 'b',
            value: '10',
            variablesReference: subChildVR,
        });
        expect(setB.body.value).to.equal('10');
        // assert that the variables have been updated to the new values
        subChildren = await dc.variablesRequest({
            variablesReference: subChildVR,
        });
        expect(
            subChildren.body.variables.length,
            'There is a different number of grandchild variables than expected'
        ).to.equal(2);
        verifyVariable(subChildren.body.variables[0], 'a', 'int', '25', {
            hasMemoryReference: false,
        });
        verifyVariable(subChildren.body.variables[1], 'b', 'int', '10', {
            hasMemoryReference: false,
        });
        // step the program and see that the values were passed to the program and evaluated.
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['STOP HERE'] + 3 }
        );
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['STOP HERE'] + 4 }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        vr = scope.scopes.body.scopes[0].variablesReference;
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[5], 'e', 'int', '35');
    });

    it('can read and set array elements in a program', async function () {
        // skip ahead to array initialization
        const br = await dc.setBreakpointsRequest({
            source: { path: varsSrc },
            breakpoints: [{ line: lineTags['After array init'] }],
        });
        expect(br.success).to.equal(true);
        await dc.continue({ threadId: scope.thread.id }, 'breakpoint', {
            line: lineTags['After array init'],
            path: varsSrc,
        });
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        // assert we can see the array and its elements
        let vr = scope.scopes.body.scopes[0].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[6], 'f', 'int [3]', undefined, {
            hasChildren: true,
        });
        expect(
            vars.body.variables[6].value,
            'The display value of the array is not a hexadecimal address'
        ).to.match(hexValueRegex);
        const childVR = vars.body.variables[6].variablesReference;
        let children = await dc.variablesRequest({
            variablesReference: childVR,
        });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(3);
        verifyVariable(children.body.variables[0], '0', 'int', '1', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[1], '1', 'int', '2', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[2], '2', 'int', '3', {
            hasMemoryReference: false,
        });
        // set the variables to something different
        const set0inHex = await dc.setVariableRequest({
            name: '0',
            value: '0x11',
            variablesReference: childVR,
        });
        expect(set0inHex.body.value).to.equal('17');
        const set0 = await dc.setVariableRequest({
            name: '0',
            value: '11',
            variablesReference: childVR,
        });
        expect(set0.body.value).to.equal('11');
        const set1 = await dc.setVariableRequest({
            name: '1',
            value: '22',
            variablesReference: childVR,
        });
        expect(set1.body.value).to.equal('22');
        const set2 = await dc.setVariableRequest({
            name: '2',
            value: '33',
            variablesReference: childVR,
        });
        expect(set2.body.value).to.equal('33');
        // assert that the variables have been updated to the new values
        children = await dc.variablesRequest({ variablesReference: childVR });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(3);
        verifyVariable(children.body.variables[0], '0', 'int', '11', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[1], '1', 'int', '22', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[2], '2', 'int', '33', {
            hasMemoryReference: false,
        });
        // step the program and see that the values were passed to the program and evaluated.
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['After array init'] + 1 }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        vr = scope.scopes.body.scopes[0].variablesReference;
        vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[7], 'g', 'int', '66');
    });

    it('can evaluate char array elements (string)', async function () {
        // skip ahead to array initialization
        const br = await dc.setBreakpointsRequest({
            source: { path: varsSrc },
            breakpoints: [{ line: lineTags['char string setup'] }],
        });
        expect(br.success).to.equal(true);
        await dc.continue({ threadId: scope.thread.id }, 'breakpoint', {
            line: lineTags['char string setup'],
            path: varsSrc,
        });
        // step the program and see that the values were passed to the program and evaluated.
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsSrc, line: lineTags['char string setup'] + 1 }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        // assert we can see the array and its elements
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        // Evaluate the non-string char array
        let res = await dc.evaluateRequest({
            context: 'variables',
            expression: 'h',
            frameId: scope.frame.id,
        });
        expect(res.body.result).eq(
            '[\n  "1 \'\\\\001\'",\n  "16 \'\\\\020\'",\n  "32 \' \'"\n]'
        );
        // Evaluate the string char array
        res = await dc.evaluateRequest({
            context: 'variables',
            expression: 'k',
            frameId: scope.frame.id,
        });
        expect(res.body.result).eq(
            '[\n  "104 \'h\'",\n  "101 \'e\'",\n  "108 \'l\'",\n  "108 \'l\'",\n  "111 \'o\'",\n  "0 \'\\\\000\'"\n]'
        );
    });
});
