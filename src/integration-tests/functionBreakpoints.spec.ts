/*********************************************************************
 * Copyright (c) 2019 Arm and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { expect } from 'chai';
import { join } from 'path';
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    getScopes,
    fillDefaults,
    gdbAsync,
    isRemoteTest,
    hardwareBreakpoint,
} from './utils';
import * as os from 'os';

describe('function breakpoints', async function () {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        dc = await standardBeforeEach();

        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: join(testProgramsDir, 'functions'),
            })
        );
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('set type of function breakpoint', async () => {
        const bpResp = await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'main',
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
        let substring: string;
        if (hardwareBreakpoint) {
            substring = 'type="hw breakpoint"';
        } else {
            substring = 'type="breakpoint"';
        }
        expect(outputs?.body.output).includes(substring);
    });

    it('hits the main function breakpoint', async () => {
        const bpResp = await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'main',
                },
            ],
        });
        expect(bpResp.body.breakpoints.length).eq(1);
        expect(bpResp.body.breakpoints[0].verified).eq(true);
        expect(bpResp.body.breakpoints[0].message).eq(undefined);
        await dc.configurationDoneRequest();
        await dc.assertStoppedLocation('function breakpoint', { line: 14 });
    });

    it('hits the sub function breakpoint', async () => {
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'sub',
                },
            ],
        });
        await dc.configurationDoneRequest();
        await dc.assertStoppedLocation('function breakpoint', { line: 10 });
    });

    it('can set and hit the sub function breakpoint while program is running', async function () {
        if (os.platform() === 'win32' && (!isRemoteTest || !gdbAsync)) {
            // win32 host can only pause remote + mi-async targets
            this.skip();
        }
        const bpResp1 = await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'main',
                },
            ],
        });
        expect(bpResp1.body.breakpoints.length).to.eq(1);
        await dc.configurationDoneRequest();
        await dc.waitForEvent('stopped');
        const scope = await getScopes(dc);
        await dc.continueRequest({ threadId: scope.thread.id });

        // start listening for stopped events before we issue the
        // setBreakpointsRequest to ensure we don't get extra
        // stopped events
        const stoppedEventWaitor = dc.waitForEvent('stopped');

        const bpResp2 = await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'sub',
                },
            ],
        });
        expect(bpResp2.body.breakpoints.length).to.eq(1);
        await dc.assertStoppedLocation('function breakpoint', {
            line: 10,
            path: /functions.c$/,
        });
        const stoppedEvent = await stoppedEventWaitor;
        expect(stoppedEvent).to.have.property('body');
        expect(stoppedEvent.body).to.have.property(
            'reason',
            'function breakpoint'
        );
    });

    it('handles <MULTIPLE> responses (e.g. multiple static functions with same name)', async () => {
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'staticfunc1',
                },
            ],
        });
        await dc.configurationDoneRequest();
        await dc.assertStoppedLocation('function breakpoint', {
            line: 3,
            path: /functions.c$/,
        });
        const scope = await getScopes(dc);
        await dc.continue(
            { threadId: scope.thread.id },
            'function breakpoint',
            { line: 2, path: /functions_other.c$/ }
        );
    });

    it('handles <MULTIPLE> function changes', async () => {
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'staticfunc1',
                },
            ],
        });
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'staticfunc2',
                },
            ],
        });
        await dc.configurationDoneRequest();
        await dc.assertStoppedLocation('function breakpoint', {
            line: 6,
            path: /functions.c$/,
        });
        const scope = await getScopes(dc);
        await dc.continue(
            { threadId: scope.thread.id },
            'function breakpoint',
            { line: 5, path: /functions_other.c$/ }
        );
    });

    it('handles <MULTIPLE> mixed with line breakpoints', async () => {
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'staticfunc1',
                },
            ],
        });

        // This a regression test as this did not lead to an error back to
        // the user, but did mean that the adapter was trying to do:
        //  -break-delete 1.1 1.2
        // which gets a warning back from GDB:
        //  warning: bad breakpoint number at or near '0'
        let logOutput = '';
        dc.on('output', (e) => {
            if (e.body.category === 'log') {
                logOutput += e.body.output;
            }
        });
        await dc.setBreakpointsRequest({
            source: {
                name: 'functions.c',
                path: path.join(testProgramsDir, 'functions.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 14,
                },
            ],
        });
        expect(logOutput).does.not.contain('warning');
        await dc.configurationDoneRequest();
        await dc.assertStoppedLocation('breakpoint', {
            line: 14,
            path: /functions.c$/,
        });
    });

    it('fails gracefully on unknown function', async () => {
        const bpResp = await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'mainBAD',
                },
            ],
        });
        expect(bpResp.body.breakpoints.length).eq(1);
        expect(bpResp.body.breakpoints[0].verified).eq(false);
        expect(bpResp.body.breakpoints[0].message).not.eq(undefined);
    });

    it('maintains breakpoint order when modifying function breakpoints', async () => {
        const bpResp1 = await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'main',
                },
            ],
        });
        const bpResp2 = await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'sub',
                },
                {
                    name: 'main',
                },
            ],
        });
        // Unlike with line breakpoints, function breakpoints don't
        // really report back anything other than the ID that can
        // be used to check order is maintained
        expect(bpResp2.body.breakpoints[1].id).eq(
            bpResp1.body.breakpoints[0].id
        );
        expect(bpResp2.body.breakpoints[0].id).not.eq(
            bpResp1.body.breakpoints[0].id
        );
    });

    it('deletes breakpoints in gdb when removed in IDE', async () => {
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'sub',
                },
                {
                    name: 'main',
                },
            ],
        });
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'sub',
                },
            ],
        });
        await dc.configurationDoneRequest();
        await dc.assertStoppedLocation('function breakpoint', { line: 10 });
    });
});
