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
    compareVariable,
    getScopes,
    resolveLineTagLocations,
    Scope,
    standardBeforeEach,
    testProgramsDir,
    verifyVariable,
    fillDefaults,
} from './utils';

describe('Variables CPP Test Suite', function () {
    let dc: CdtDebugClient;
    let scope: Scope;

    const varsCppProgram = path.join(testProgramsDir, 'vars_cpp');
    const varsCppSrc = path.join(testProgramsDir, 'vars_cpp.cpp');

    const lineTags = {
        'STOP HERE': 0,
    };

    before(function () {
        resolveLineTagLocations(varsCppSrc, lineTags);
    });

    beforeEach(async function () {
        dc = await standardBeforeEach();
        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, {
                program: varsCppProgram,
            }),
            {
                path: varsCppSrc,
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

    it('can read and set a cpp object variable', async function () {
        // check the initial conditions of the two variables
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(3);
        verifyVariable(vars.body.variables[0], 'fooA', 'Foo *', undefined, {
            hasChildren: true,
        });
        verifyVariable(vars.body.variables[1], 'fooB', 'Foo *', undefined, {
            hasChildren: true,
        });
        expect(
            vars.body.variables[0].value,
            'Value of fooA matches fooB'
        ).to.not.equal(vars.body.variables[1].value);
        // check that the children names and values are the same, but values are different
        let childrenA = await dc.variablesRequest({
            variablesReference: vars.body.variables[0].variablesReference,
        });
        let childrenB = await dc.variablesRequest({
            variablesReference: vars.body.variables[1].variablesReference,
        });
        expect(
            childrenA.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(childrenB.body.variables.length);
        compareVariable(
            childrenA.body.variables[0],
            childrenB.body.variables[0],
            true,
            true,
            false
        );
        compareVariable(
            childrenA.body.variables[1],
            childrenB.body.variables[1],
            true,
            true,
            false
        );
        compareVariable(
            childrenA.body.variables[2],
            childrenB.body.variables[2],
            true,
            true,
            false
        );
        // set fooA to be equal to fooB.
        const setFooA = await dc.setVariableRequest({
            name: 'fooA',
            value: vars.body.variables[1].value,
            variablesReference: vr,
        });
        expect(setFooA.body.value).to.equal(vars.body.variables[1].value);
        // check types and value after the set
        const vars2 = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars2.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(3);
        compareVariable(
            vars2.body.variables[0],
            vars2.body.variables[1],
            false,
            true,
            true
        );
        // check the objects are identical
        childrenA = await dc.variablesRequest({
            variablesReference: vars2.body.variables[0].variablesReference,
        });
        childrenB = await dc.variablesRequest({
            variablesReference: vars2.body.variables[1].variablesReference,
        });
        compareVariable(
            childrenA.body.variables[0],
            childrenB.body.variables[0],
            true,
            true,
            true
        );
        compareVariable(
            childrenA.body.variables[1],
            childrenB.body.variables[1],
            true,
            true,
            true
        );
        compareVariable(
            childrenA.body.variables[2],
            childrenB.body.variables[2],
            true,
            true,
            true
        );
    });

    it('can read and set nested variables from a cpp object', async function () {
        // check initial conditions of fooA and its child elements
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });
        expect(
            vars.body.variables.length,
            'There is a different number of variables than expected'
        ).to.equal(3);
        verifyVariable(vars.body.variables[0], 'fooA', 'Foo *', undefined, {
            hasChildren: true,
        });
        expect(
            vars.body.variables[0].variablesReference,
            `${vars.body.variables[0].name} has no children`
        ).to.not.equal(0);
        const childVR = vars.body.variables[0].variablesReference;
        let children = await dc.variablesRequest({
            variablesReference: childVR,
        });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(3);
        verifyVariable(children.body.variables[0], 'a', 'int', '1', {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[1], 'c', 'char', "97 'a'", {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[2], 'b', 'int', '2', {
            hasMemoryReference: false,
        });
        // set child value
        const setChild0 = await dc.setVariableRequest({
            name: children.body.variables[0].name,
            value: '55',
            variablesReference: vars.body.variables[0].variablesReference,
        });
        expect(setChild0.body.value).to.equal('55');
        // check the new values
        children = await dc.variablesRequest({
            variablesReference: vars.body.variables[0].variablesReference,
        });
        expect(
            children.body.variables.length,
            'There is a different number of child variables than expected'
        ).to.equal(3);
        verifyVariable(children.body.variables[0], 'a', 'int', '55', {
            hasMemoryReference: false,
        });
        // these two values should be unchanged.
        verifyVariable(children.body.variables[1], 'c', 'char', "97 'a'", {
            hasMemoryReference: false,
        });
        verifyVariable(children.body.variables[2], 'b', 'int', '2', {
            hasMemoryReference: false,
        });
    });
});
