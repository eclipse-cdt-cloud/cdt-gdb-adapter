/*********************************************************************
 * Copyright (c) 2026 Arm Limited and others
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
    testProgramsDir,
    standardBeforeEach,
    fillDefaults,
    debugServerPort,
} from './utils';
import { expect } from 'chai';

describe('Miscellaneous GDB Commands Tests', function () {
    let dc: CdtDebugClient;

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
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('should retrieve a valid list of completions for a valid command', async function () {
        const completions: any = await dc.send('completions', {
            text: '>pr',
            column: 3,
        });
        expect(completions.body.targets).to.be.an('array');
        const expectedCompletion = {
            label: 'print',
            length: 1,
            start: 2,
        };
        expect(completions.body.targets).to.deep.include(expectedCompletion);
    });

    it('should retrieve a empty list for an invalid command', async function () {
        const text = '>invalidCommand';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.length,
        });
        expect(completions.body.targets).to.be.an('array');
        expect(completions.body.targets).to.not.deep.include({
            label: 'invalidCommand',
            length: 0,
            start: 0,
        });
    });

    it('should retrieve a valid list of completions for a valid command without a complete argument', async function () {
        const text = ' > b ma';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.length + 1,
        });
        expect(completions.body.targets).to.be.an('array');
        const expectedCompletion = {
            label: ' b main',
            length: text.slice(text.indexOf('>') + 1, text.length).length, // everything after the ">" character should be replaced
            start: text.indexOf('>') + 2, // vscode is 1-based, so we need to add 2 to the index of '>'
        };
        expect(completions.body.targets).to.deep.include(expectedCompletion);
    });

    it('should have a starting position exactly at where the command starts', async function () {
        const text = '   >   python-interactive';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.length - 3,
        });
        expect(completions.body.targets).to.be.an('array');
        const expectedCompletion = {
            label: '   python-interactive',
            length: text.slice(text.indexOf('>') + 1, text.length - 4).length, // as column is text.length - 4, subtract 4 from the length to mimic python-intera|ctive. Everything after '>' should be replaced
            start: text.indexOf('>') + 2,
        };
        expect(completions.body.targets).to.deep.include(expectedCompletion);
    });

    it('should not return completions for a command when cursor is before the > character', async function () {
        const text = '   >   python-interactive';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.indexOf('>') - 1, // cursor is before the ">" character
        });
        expect(completions.body).to.be.undefined;
    });

    it('should only return completions for a command that is written before the cursor position', async function () {
        const text = '   >   interrupt';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.indexOf('p') - 1, // cursor is before the "p" character
        });
        expect(completions.body.targets).to.be.an('array');
        expect(completions.body.targets.length).to.be.greaterThan(1);
    });
});

describe('Miscellaneous GDB commands tests with columnStartAt1 set to false', function () {
    let dc: CdtDebugClient;

    const evaluateProgram = path.join(testProgramsDir, 'evaluate');
    const evaluateSrc = path.join(testProgramsDir, 'evaluate.cpp');

    beforeEach(async function () {
        const initRequestArgs = {
            supportsRunInTerminalRequest: true,
            supportsMemoryEvent: true,
            supportsMemoryReferences: true,
            adapterID: this['_debugType'],
            linesStartAt1: true,
            columnsStartAt1: false,
            pathFormat: 'path',
        };
        dc = new CdtDebugClient();
        await dc.start(debugServerPort);
        await dc.initializeRequest(initRequestArgs);
        await dc.hitBreakpoint(
            fillDefaults(this.currentTest, {
                program: evaluateProgram,
            }),
            {
                path: evaluateSrc,
                line: 2,
            }
        );
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('should retrieve a valid list of completions for a valid command', async function () {
        const completions: any = await dc.send('completions', {
            text: '>pr',
            column: 3,
        });
        expect(completions.body.targets).to.be.an('array');
        const expectedCompletion = {
            label: 'print',
            length: 1,
            start: 2,
        };
        expect(completions.body.targets).to.deep.include(expectedCompletion);
    });

    it('should retrieve a empty list for an invalid command', async function () {
        const text = '>invalidCommand';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.length,
        });
        expect(completions.body.targets).to.be.an('array');
        expect(completions.body.targets).to.not.deep.include({
            label: 'invalidCommand',
            length: 0,
            start: 0,
        });
    });

    it('should retrieve a valid list of completions for a valid command without a complete argument', async function () {
        const text = ' > b ma';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.length + 1,
        });
        expect(completions.body.targets).to.be.an('array');
        const expectedCompletion = {
            label: ' b main',
            length: text.slice(text.indexOf('>') + 1, text.length).length, // everything after the ">" character should be replaced
            start: text.indexOf('>') + 2, // vscode is 1-based, so we need to add 2 to the index of '>'
        };
        expect(completions.body.targets).to.deep.include(expectedCompletion);
    });

    it('should have a starting position exactly at where the command starts', async function () {
        const text = '   >   python-interactive';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.length - 3,
        });
        expect(completions.body.targets).to.be.an('array');
        const expectedCompletion = {
            label: '   python-interactive',
            length: text.slice(text.indexOf('>') + 1, text.length - 4).length, // as column is text.length - 4, subtract 4 from the length to mimic python-intera|ctive. Everything after '>' should be replaced
            start: text.indexOf('>') + 2,
        };
        expect(completions.body.targets).to.deep.include(expectedCompletion);
    });

    it('should not return completions for a command when cursor is before the > character', async function () {
        const text = '   >   python-interactive';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.indexOf('>') - 1, // cursor is before the ">" character
        });
        expect(completions.body).to.be.undefined;
    });

    it('should only return completions for a command that is written before the cursor position', async function () {
        const text = '   >   interrupt';
        const completions: any = await dc.send('completions', {
            text: text,
            column: text.indexOf('p') - 1, // cursor is before the "p" character
        });
        expect(completions.body.targets).to.be.an('array');
        expect(completions.body.targets.length).to.be.greaterThan(1);
    });
});
