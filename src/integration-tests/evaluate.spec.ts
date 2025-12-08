/*********************************************************************
 * Copyright (c) 2019 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { CdtDebugClient } from './debugClient';
import {
    expectRejection,
    fillDefaults,
    getScopes,
    isRemoteTest,
    resolveLineTagLocations,
    Scope,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { expect } from 'chai';

describe('evaluate request', function () {
    let dc: CdtDebugClient;
    let scope: Scope;

    const evaluateProgram = path.join(testProgramsDir, 'evaluate');
    const evaluateSrc = path.join(testProgramsDir, 'evaluate.cpp');

    beforeEach(async function () {
        dc = await standardBeforeEach();
        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, {
                program: evaluateProgram,
            }),
            {
                path: evaluateSrc,
                line: 2,
            }
        );
        scope = await getScopes(dc);
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('should evaluate a simple literal expression', async function () {
        const res = await dc.evaluateRequest({
            context: 'repl',
            expression: '2 + 2',
            frameId: scope.frame.id,
        });

        expect(res.body.result).eq('4');
    });

    it('should reject evaluation of expression without a frame', async function () {
        if (isRemoteTest) {
            this.skip();
        }

        const err = await expectRejection(
            dc.evaluateRequest({
                context: 'repl',
                expression: '2 + 2',
            })
        );

        expect(err.message).eq(
            'Evaluation of expression without frameId is not supported.'
        );
    });

    it('should send an error when evaluating an invalid expression', async function () {
        const err = await dc.evaluateRequest({
            context: 'repl',
            expression: '2 +',
            frameId: scope.frame.id,
        });

        expect(err.body.result).eq('Error: could not evaluate expression');
    });

    it('should send a warning when evaluating an enable/disable breakpoint command is sent', async function () {
        const event = dc.waitForOutputEvent(
            'stdout',
            'warning: "enable" and "disable" commands cannot be reflected in the GUI'
        );
        await dc.evaluateRequest({
            context: 'repl',
            expression: '> enable',
            frameId: scope.frame.id,
        });
        await event;
    });

    it('should send a warning when the commands command is sent', async function () {
        const event = dc.waitForOutputEvent(
            'stdout',
            'warning: commands command is not supported via GDB/MI interface'
        );
        await dc.evaluateRequest({
            context: 'repl',
            expression: '> commands',
            frameId: scope.frame.id,
        });
        await event;
    });

    it('should send a warning when evaluating a delete instruction breakpoint command is sent', async function () {
        // set instruction breakpoint
        await dc.setInstructionBreakpointsRequest({
            breakpoints: [
                {
                    instructionReference: '0x71c',
                },
            ],
        });
        const event = dc.waitForOutputEvent(
            'stdout',
            'warning: "delete" command not working for IDE instruction breakpoints, please delete from GUI'
        );
        await dc.evaluateRequest({
            context: 'repl',
            expression: '> delete 2',
            frameId: scope.frame.id,
        });
        await event;
    });

    it('should not send a warning when evaluating an enable/disable command is sent', async function () {
        const event = dc.waitForOutputEvent(
            'stdout',
            'warning: "enable" and "disable" commands cannot be reflected in the GUI'
        );
        await dc.evaluateRequest({
            context: 'repl',
            expression: '> enable mem',
            frameId: scope.frame.id,
        });
        const output = await Promise.race([
            event,
            new Promise<undefined>((resolve) =>
                setTimeout(() => resolve(undefined), 1000)
            ),
        ]);
        expect(output).eq(undefined);
    });

    it('should be able to update the value of a variable named monitor and that variable has local scope', async function () {
        const res1 = await dc.evaluateRequest({
            context: 'repl',
            expression: 'monitor = 10',
            frameId: scope.frame.id,
        });

        expect(res1.body.result).eq('10');
        const res2 = await dc.evaluateRequest({
            context: 'repl',
            expression: 'monitor',
            frameId: scope.frame.id,
        });
        expect(res2.body.result).eq('10');
    });
    it('should be able to use GDB command', async function () {
        const res1 = await dc.evaluateRequest({
            context: 'repl',
            expression: '>help',
            frameId: scope.frame.id,
        });

        expect(res1.body.result).eq('\r');
        const res2 = await dc.evaluateRequest({
            context: 'repl',
            expression: '>-gdb-version',
            frameId: scope.frame.id,
        });

        expect(res2.body.result).eq('\r');
    });
    it('should reject entering an invalid MI command', async function () {
        const err = await expectRejection(
            dc.evaluateRequest({
                context: 'repl',
                expression: '>-a',
                frameId: scope.frame.id,
            })
        );

        expect(err.message).eq('Undefined MI command: a');
    });
});

describe('evaluate request global variables', function () {
    let dc: CdtDebugClient;
    let scope: Scope;

    const varsGlobalsProgram = path.join(testProgramsDir, 'vars_globals');
    const varsGlobalsSrc = path.join(testProgramsDir, 'vars_globals.c');
    const lineTags = {
        INITIAL_STOP: 0,
    };

    before(function () {
        resolveLineTagLocations(varsGlobalsSrc, lineTags);
    });

    beforeEach(async function () {
        dc = await standardBeforeEach();
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: varsGlobalsProgram,
            })
        );
        await dc.setBreakpointsRequest({
            source: { path: varsGlobalsSrc },
            breakpoints: [{ line: lineTags['INITIAL_STOP'] }],
        });
        await Promise.all([
            dc.waitForEvent('stopped'),
            dc.configurationDoneRequest(),
        ]);
        scope = await getScopes(dc);
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('evaluates a global struct variable and creates sensible evaluate names for members', async function () {
        const arrayContent = 'char_array';
        const arrayLength = arrayContent.length + 1; // +1 for '\0'
        const resolvedExpression = await dc.evaluateRequest({
            context: 'hover',
            expression: 's0',
            frameId: scope.frame.id,
        });

        expect(resolvedExpression.body.result).to.equal('{...}');

        const children = await dc.variablesRequest({
            variablesReference: resolvedExpression.body.variablesReference,
        });
        expect(children.body.variables).lengthOf(3);
        const childrenContents = [
            { name: 'a', hasChildren: false },
            { name: 'b', hasChildren: false },
            { name: 'char_array', hasChildren: true },
        ];
        children.body.variables.forEach((variable, index) => {
            expect(variable.name).to.equal(childrenContents[index].name);
            expect(variable.evaluateName).to.equal(
                `s0.${childrenContents[index].name}`
            );
            if (childrenContents[index].hasChildren) {
                expect(variable.variablesReference).not.to.equal(0);
            } else {
                expect(variable.variablesReference).to.equal(0);
            }
        });

        const arrayChildren = await dc.variablesRequest({
            variablesReference: children.body.variables[2].variablesReference,
        });
        expect(arrayChildren.body.variables).lengthOf(arrayLength);
        arrayChildren.body.variables.forEach((variable, index) => {
            expect(variable.name).to.equal(`[${index}]`);
            expect(variable.evaluateName).to.equal(`s0.char_array[${index}]`);
            expect(variable.variablesReference).to.equal(0);
            const charCode =
                index === arrayLength - 1 ? 0 : arrayContent.charCodeAt(index);
            const charValue = `${charCode} '${charCode === 0 ? '\\000' : String.fromCharCode(charCode)}'`;
            expect(variable.value).to.equal(charValue);
        });
    });

    it('evaluates a pointer to a more complex struct variable and creates sensible evaluate names for members', async function () {
        const resolvedExpression = await dc.evaluateRequest({
            context: 'hover',
            expression: 's1',
            frameId: scope.frame.id,
        });

        expect(resolvedExpression.body.result).to.endWith('{...}');

        const members = await dc.variablesRequest({
            variablesReference: resolvedExpression.body.variablesReference,
        });
        expect(members.body.variables).lengthOf(4);
        const memberContents = [
            { name: 'm', hasChildren: false },
            { name: 'n', hasChildren: false },
            { name: 'child', hasChildren: true },
            { name: 'children', hasChildren: true },
        ];
        members.body.variables.forEach((variable, index) => {
            expect(variable.name).to.equal(memberContents[index].name);
            expect(variable.evaluateName).to.equal(
                `s1.${memberContents[index].name}`
            );
            if (memberContents[index].hasChildren) {
                expect(variable.variablesReference).not.to.equal(0);
            } else {
                expect(variable.variablesReference).to.equal(0);
            }
        });

        // Child
        const child = await dc.variablesRequest({
            variablesReference: members.body.variables[2].variablesReference,
        });
        expect(child.body.variables).lengthOf(2);
        child.body.variables.forEach((variable, index) => {
            const childName = index === 0 ? 'x' : 'y';
            expect(variable.name).to.equal(childName);
            expect(variable.evaluateName).to.equal(`s1.child.${childName}`);
            expect(variable.variablesReference).to.equal(0);
        });

        // Children
        const children = await dc.variablesRequest({
            variablesReference: members.body.variables[3].variablesReference,
        });
        expect(children.body.variables).lengthOf(2);
        children.body.variables.forEach(async (variable, index) => {
            expect(variable.name).to.equal(`[${index}]`);
            expect(variable.value).to.equal(`{...}`);
            expect(variable.evaluateName).to.equal(`s1.children[${index}]`);
            expect(variable.variablesReference).not.to.equal(0);
            // Grand children
            const grandChildren = await dc.variablesRequest({
                variablesReference: variable.variablesReference,
            });
            expect(grandChildren.body.variables).lengthOf(2);
            grandChildren.body.variables.forEach((gcVariable, gcIndex) => {
                const childName = gcIndex === 0 ? 'x' : 'y';
                expect(gcVariable.name).to.equal(childName);
                expect(gcVariable.evaluateName).to.equal(
                    `s1.children[${index}].${childName}`
                );
                expect(gcVariable.variablesReference).to.equal(0);
            });
        });
    });
});
