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
import * as fs from 'fs';
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
import { DebugProtocol } from '@vscode/debugprotocol';
// import { ILocation } from '@vscode/debugadapter-testsupport/lib/debugClient';

describe('Variables Test Suite', function () {
    let dc: CdtDebugClient;
    let scope: Scope;
    const varsProgram = path.join(testProgramsDir, 'vars');
    const varsSrc = path.join(testProgramsDir, 'vars.c');
    const numVars = 12; // number of variables in the main() scope of vars.c

    const lineTags = {
        'STOP HERE': 0,
        'After array init': 0,
        'char string setup': 0,
        end: 0,
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
        verifyVariable(children.body.variables[0], '[0]', 'int', '1', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[1], '[1]', 'int', '2', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[2], '[2]', 'int', '3', {
            hasMemoryReference: false,
        });
        // set the variables to something different
        const set0inHex = await dc.setVariableRequest({
            name: '[0]',
            value: '0x11',
            variablesReference: childVR,
        });
        expect(set0inHex.body.value).to.equal('17');
        const set0 = await dc.setVariableRequest({
            name: '[0]',
            value: '11',
            variablesReference: childVR,
        });
        expect(set0.body.value).to.equal('11');
        const set1 = await dc.setVariableRequest({
            name: '[1]',
            value: '22',
            variablesReference: childVR,
        });
        expect(set1.body.value).to.equal('22');
        const set2 = await dc.setVariableRequest({
            name: '[2]',
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
        verifyVariable(children.body.variables[0], '[0]', 'int', '11', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[1], '[1]', 'int', '22', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[2], '[2]', 'int', '33', {
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

    it('can evaluate anonymous and deeply nested structs and unions', async function () {
        // skip ahead to the end
        const br = await dc.setBreakpointsRequest({
            source: { path: varsSrc },
            breakpoints: [{ line: lineTags['end'] }],
        });
        expect(br.success).to.equal(true);
        await dc.continue({ threadId: scope.thread.id }, 'breakpoint', {
            line: lineTags['end'],
            path: varsSrc,
        });
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(2);
        // assert we can see the struct
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(numVars);
        verifyVariable(vars.body.variables[11], 'n', 'struct nest', '{...}', {
            hasChildren: true,
        });

        interface ExpandedVariable {
            name: string;
            type?: string;
            evaluateName?: string;
            children?: ExpandedVariable[];
        }
        async function expandRecursively(
            variablesReference: number
        ): Promise<ExpandedVariable[] | undefined> {
            if (variablesReference <= 0) return undefined;
            const vars = (await dc.variablesRequest({ variablesReference }))
                .body.variables;
            const exp = await Promise.all(
                vars.map((v) => expandRecursively(v.variablesReference))
            );
            return vars.map((v, i) => {
                const r: ExpandedVariable = {
                    name: v.name,
                    type: v.type,
                    evaluateName: v.evaluateName,
                };
                if (exp[i]) r.children = exp[i];
                return r;
            });
        }
        const structure = await expandRecursively(
            vars.body.variables[11].variablesReference
        );
        expect(structure).to.deep.equal(
            JSON.parse(
                fs.readFileSync(
                    path.join(testProgramsDir, '..', 'var_nest_expected.json'),
                    { encoding: 'utf-8' }
                )
            )
        );
    });
});

describe('Global Variables Test Suite', function () {
    let dc: CdtDebugClient;
    let scope: Scope;

    const varsGlobalsProgram = path.join(testProgramsDir, 'vars_globals');
    const varsGlobalsSrc = path.join(testProgramsDir, 'vars_globals.c');
    const lineTags = {
        INITIAL_STOP: 0,
        RETURN: 0,
    };

    before(function () {
        resolveLineTagLocations(varsGlobalsSrc, lineTags);
    });

    beforeEach(async function () {
        dc = await standardBeforeEach();
        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, {
                program: varsGlobalsProgram,
                showGlobalVariables: true,
            }),
            {
                path: varsGlobalsSrc,
                line: lineTags['INITIAL_STOP'],
            }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(3);
        expect(scope.scopes.body.scopes[1].name).to.equal('Global');
    });

    afterEach(async function () {
        await dc.stop();
    });

    const findVar = (
        vars: DebugProtocol.Variable[],
        name: string
    ): DebugProtocol.Variable => {
        const v = vars.find((v) => v.name === name);
        expect(v, `Variable '${name}' not found`).to.exist;
        return v as DebugProtocol.Variable;
    };

    it('can read simple global variables in a program', async function () {
        const vr = scope.scopes.body.scopes[1].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        const globalInt: DebugProtocol.Variable = findVar(
            vars.body.variables,
            'global_int'
        );
        verifyVariable(globalInt, 'global_int', 'volatile int', '42');
    });

    it('can read and set struct global variables in a program', async function () {
        let vr = scope.scopes.body.scopes[1].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        let s0: DebugProtocol.Variable = findVar(vars.body.variables, 's0');
        verifyVariable(s0, 's0', 'volatile STRUCT_WITH_ARRAY', '{...}', {
            hasChildren: true,
        });
        let childrenS0Ref = s0.variablesReference;
        let childrenS0 = await dc.variablesRequest({
            variablesReference: childrenS0Ref,
        });
        expect(
            childrenS0.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(3);
        verifyVariable(childrenS0.body.variables[0], 'a', 'int', '1', {
            hasMemoryReference: false,
        });
        verifyVariable(childrenS0.body.variables[1], 'b', 'int', '2', {
            hasMemoryReference: false,
        });
        verifyVariable(
            childrenS0.body.variables[2],
            'char_array',
            'char [11]',
            '[11]',
            {
                hasChildren: true,
                hasMemoryReference: false,
            }
        );
        // set the variables to something different
        const setAinHex = await dc.setVariableRequest({
            name: 'a',
            value: '0x25',
            variablesReference: childrenS0Ref,
        });
        expect(setAinHex.body.value).to.equal('37');
        const setA = await dc.setVariableRequest({
            name: 'a',
            value: '25',
            variablesReference: childrenS0Ref,
        });
        expect(setA.body.value).to.equal('25');
        const setB = await dc.setVariableRequest({
            name: 'b',
            value: '10',
            variablesReference: childrenS0Ref,
        });
        expect(setB.body.value).to.equal('10');
        // assert that the variables have been updated to the new values
        childrenS0 = await dc.variablesRequest({
            variablesReference: childrenS0Ref,
        });
        expect(
            childrenS0.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(3);
        verifyVariable(childrenS0.body.variables[0], 'a', 'int', '25', {
            hasMemoryReference: false,
        });
        verifyVariable(childrenS0.body.variables[1], 'b', 'int', '10', {
            hasMemoryReference: false,
        });
        // step the program and see that the values were passed to the program and evaluated.
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsGlobalsSrc, line: lineTags['INITIAL_STOP'] + 1 }
        );
        await dc.next(
            { threadId: scope.thread.id },
            { path: varsGlobalsSrc, line: lineTags['INITIAL_STOP'] + 2 }
        );
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(3);
        vr = scope.scopes.body.scopes[1].variablesReference;
        vars = await dc.variablesRequest({ variablesReference: vr });
        s0 = findVar(vars.body.variables, 's0');
        verifyVariable(s0, 's0', 'volatile STRUCT_WITH_ARRAY', '{...}', {
            hasChildren: true,
        });
        childrenS0Ref = s0.variablesReference;
        childrenS0 = await dc.variablesRequest({
            variablesReference: childrenS0Ref,
        });
        expect(
            childrenS0.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(3);
        verifyVariable(childrenS0.body.variables[0], 'a', 'int', '250', {
            hasMemoryReference: false,
        });
        verifyVariable(childrenS0.body.variables[1], 'b', 'int', '20', {
            hasMemoryReference: false,
        });
        verifyVariable(
            childrenS0.body.variables[2],
            'char_array',
            'char [11]',
            '[11]',
            {
                hasChildren: true,
                hasMemoryReference: false,
            }
        );
    });

    it('can read and set array element in global variables in a program', async function () {
        const vr = scope.scopes.body.scopes[1].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        const s0: DebugProtocol.Variable = findVar(vars.body.variables, 's0');
        verifyVariable(s0, 's0', 'volatile STRUCT_WITH_ARRAY', '{...}', {
            hasChildren: true,
        });
        const childrenS0Ref = s0.variablesReference;
        const childrenS0 = await dc.variablesRequest({
            variablesReference: childrenS0Ref,
        });
        expect(
            childrenS0.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(3);
        verifyVariable(
            childrenS0.body.variables[2],
            'char_array',
            'char [11]',
            '[11]',
            {
                hasChildren: true,
                hasMemoryReference: false,
            }
        );
        const charArrayRef = childrenS0.body.variables[2].variablesReference;
        let charArray = await dc.variablesRequest({
            variablesReference: charArrayRef,
        });
        expect(
            charArray.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(11);
        verifyVariable(charArray.body.variables[0], '[0]', 'char', "99 'c'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[1], '[1]', 'char', "104 'h'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[2], '[2]', 'char', "97 'a'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[3], '[3]', 'char', "114 'r'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[4], '[4]', 'char', "95 '_'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[5], '[5]', 'char', "97 'a'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[6], '[6]', 'char', "114 'r'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[7], '[7]', 'char', "114 'r'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[8], '[8]', 'char', "97 'a'", {
            hasMemoryReference: false,
        });
        verifyVariable(charArray.body.variables[9], '[9]', 'char', "121 'y'", {
            hasMemoryReference: false,
        });
        verifyVariable(
            charArray.body.variables[10],
            '[10]',
            'char',
            "0 '\\000'",
            {
                hasMemoryReference: false,
            }
        );
        // set the variable to something different
        const setChar = await dc.setVariableRequest({
            name: '[0]',
            value: '67',
            variablesReference: charArrayRef,
        });
        expect(setChar.body.value).to.equal("67 'C'");
        // assert that the variables have been updated to the new values
        charArray = await dc.variablesRequest({
            variablesReference: charArrayRef,
        });
        expect(
            charArray.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(11);
        verifyVariable(charArray.body.variables[0], '[0]', 'char', "67 'C'", {
            hasMemoryReference: false,
        });
    });

    it('can read and set nested struct global variables in a program', async function () {
        let vr = scope.scopes.body.scopes[1].variablesReference;
        let vars = await dc.variablesRequest({ variablesReference: vr });
        let s1: DebugProtocol.Variable = findVar(vars.body.variables, 's1');
        verifyVariable(s1, 's1', 'volatile PARENT_STRUCT', '{...}', {
            hasChildren: true,
        });
        let childrenS1Ref = s1.variablesReference;
        let childrenS1 = await dc.variablesRequest({
            variablesReference: childrenS1Ref,
        });
        expect(
            childrenS1.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(4);
        verifyVariable(
            childrenS1.body.variables[3],
            'children',
            'CHILD_STRUCT [2]',
            '[2]',
            {
                hasChildren: true,
                hasMemoryReference: false,
            }
        );
        let grandChildRef = childrenS1.body.variables[3].variablesReference;
        let grandChild = await dc.variablesRequest({
            variablesReference: grandChildRef,
        });
        expect(
            grandChild.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(2);
        verifyVariable(
            grandChild.body.variables[0],
            '[0]',
            'CHILD_STRUCT',
            '{...}',
            {
                hasChildren: true,
                hasMemoryReference: false,
            }
        );
        let grandGrandChildRef =
            grandChild.body.variables[0].variablesReference;
        let grandGrandChild = await dc.variablesRequest({
            variablesReference: grandGrandChildRef,
        });
        expect(
            grandGrandChild.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(2);
        verifyVariable(grandGrandChild.body.variables[0], 'x', 'int', '6', {
            hasMemoryReference: false,
        });
        verifyVariable(grandGrandChild.body.variables[1], 'y', 'int', '7', {
            hasMemoryReference: false,
        });
        // set the variable to something different
        const setX = await dc.setVariableRequest({
            name: 'x',
            value: '11',
            variablesReference: grandGrandChildRef,
        });
        expect(setX.body.value).to.equal('11');
        const setY = await dc.setVariableRequest({
            name: 'y',
            value: '12',
            variablesReference: grandGrandChildRef,
        });
        expect(setY.body.value).to.equal('12');
        // assert that the variables have been updated to the new values
        grandGrandChild = await dc.variablesRequest({
            variablesReference: grandGrandChildRef,
        });
        expect(
            grandGrandChild.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(2);
        verifyVariable(grandGrandChild.body.variables[0], 'x', 'int', '11', {
            hasMemoryReference: false,
        });
        verifyVariable(grandGrandChild.body.variables[1], 'y', 'int', '12', {
            hasMemoryReference: false,
        });
        // continue to hit bp see that the values were passed to the program and evaluated.
        const br = await dc.setBreakpointsRequest({
            source: { path: varsGlobalsSrc },
            breakpoints: [{ line: lineTags['RETURN'] }],
        });
        expect(br.success).to.equal(true);
        await dc.continue({ threadId: scope.thread.id }, 'breakpoint', {
            line: lineTags['RETURN'],
            path: varsGlobalsSrc,
        });
        scope = await getScopes(dc);
        expect(
            scope.scopes.body.scopes.length,
            'Unexpected number of scopes returned'
        ).to.equal(3);
        vr = scope.scopes.body.scopes[1].variablesReference;
        expect(scope.scopes.body.scopes[1].name).to.be.equal('Global');
        vars = await dc.variablesRequest({ variablesReference: vr });
        s1 = findVar(vars.body.variables, 's1');
        verifyVariable(s1, 's1', 'volatile PARENT_STRUCT', '{...}', {
            hasChildren: true,
        });
        childrenS1Ref = s1.variablesReference;
        childrenS1 = await dc.variablesRequest({
            variablesReference: childrenS1Ref,
        });
        expect(
            childrenS1.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(4);
        verifyVariable(
            childrenS1.body.variables[3],
            'children',
            'CHILD_STRUCT [2]',
            '[2]',
            {
                hasChildren: true,
                hasMemoryReference: false,
            }
        );
        grandChildRef = childrenS1.body.variables[3].variablesReference;
        grandChild = await dc.variablesRequest({
            variablesReference: grandChildRef,
        });
        expect(
            grandChild.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(2);
        verifyVariable(
            grandChild.body.variables[0],
            '[0]',
            'CHILD_STRUCT',
            '{...}',
            {
                hasChildren: true,
                hasMemoryReference: false,
            }
        );
        grandGrandChildRef = grandChild.body.variables[0].variablesReference;
        grandGrandChild = await dc.variablesRequest({
            variablesReference: grandGrandChildRef,
        });
        expect(
            grandGrandChild.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(2);
        verifyVariable(grandGrandChild.body.variables[0], 'x', 'int', '41', {
            hasMemoryReference: false,
        });
        verifyVariable(grandGrandChild.body.variables[1], 'y', 'int', '52', {
            hasMemoryReference: false,
        });
    });
});
