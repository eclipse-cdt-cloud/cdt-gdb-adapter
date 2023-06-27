/*********************************************************************
 * Copyright (c) 2023 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import * as path from 'path';
import * as os from 'os';
import { expect } from 'chai';
import { CdtDebugClient } from './debugClient';
import { standardBeforeEach, testProgramsDir, fillDefaults } from './utils';

// This mock adapter is overriding the getBreakpointOptions method.
const adapter =
    'integration-tests/mocks/debugAdapters/dynamicBreakpointOptions.js';
const argHardwareBreakpointTrue = '--hardware-breakpoint-true';
const argHardwareBreakpointFalse = '--hardware-breakpoint-false';
const argThrowError = '--throw-error';

describe('dynamic breakpoint options with hardware set to false', async () => {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        // Overriding breakpoint option hardware to false
        dc = await standardBeforeEach(adapter, [argHardwareBreakpointFalse]);
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: path.join(testProgramsDir, 'count'),
                hardwareBreakpoint: true,
            })
        );
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('insert breakpoint as software breakpoint', async () => {
        const bpResp = await dc.setBreakpointsRequest({
            source: {
                name: 'count.c',
                path: path.join(testProgramsDir, 'count.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 4,
                },
            ],
        });
        expect(bpResp.body.breakpoints.length).eq(1);
        expect(bpResp.body.breakpoints[0].verified).eq(true);
        expect(bpResp.body.breakpoints[0].message).eq(undefined);
        await dc.configurationDoneRequest();
        let isCorrect;
        let outputs;
        while (!isCorrect) {
            // Cover the case of getting event in Linux environment.
            // If cannot get correct event, program timeout and test case failed.
            outputs = await dc.waitForEvent('output');
            isCorrect = outputs.body.output.includes('breakpoint-modified');
        }
        expect(outputs?.body.output).includes('type="breakpoint"');
    });
});

describe('dynamic breakpoint options with hardware set to true', async () => {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        // Overriding breakpoint option hardware to true
        dc = await standardBeforeEach(adapter, [argHardwareBreakpointTrue]);
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: path.join(testProgramsDir, 'count'),
                hardwareBreakpoint: false,
            })
        );
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('insert breakpoint as hardware breakpoint', async function () {
        // Hardware breakpoints are not supported for Windows
        if (os.platform() === 'win32') {
            this.skip();
        }
        const bpResp = await dc.setBreakpointsRequest({
            source: {
                name: 'count.c',
                path: path.join(testProgramsDir, 'count.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 4,
                },
            ],
        });
        expect(bpResp.body.breakpoints.length).eq(1);
        expect(bpResp.body.breakpoints[0].verified).eq(true);
        expect(bpResp.body.breakpoints[0].message).eq(undefined);
        await dc.configurationDoneRequest();
        let isCorrect;
        let outputs;
        while (!isCorrect) {
            // Cover the case of getting event in Linux environment.
            // If cannot get correct event, program timeout and test case failed.
            outputs = await dc.waitForEvent('output');
            isCorrect = outputs.body.output.includes('breakpoint-modified');
        }
        expect(outputs?.body.output).includes('type="hw breakpoint"');
    });
});

describe('dynamic breakpoint options with throwing error', async () => {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        // Overriding breakpoint options and throwing error when getBreakpointOptions invoked
        dc = await standardBeforeEach(adapter, [argThrowError]);
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: path.join(testProgramsDir, 'count'),
                hardwareBreakpoint: false,
            })
        );
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('insert breakpoint is not performed', async () => {
        const bpResp = await dc.setBreakpointsRequest({
            source: {
                name: 'count.c',
                path: path.join(testProgramsDir, 'count.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 4,
                },
            ],
        });
        expect(bpResp.body.breakpoints.length).eq(1);
        expect(bpResp.body.breakpoints[0].verified).eq(false);
        expect(bpResp.body.breakpoints[0].message).not.eq(undefined);
    });
});
