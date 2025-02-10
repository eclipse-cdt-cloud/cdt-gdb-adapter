/*********************************************************************
 * Copyright (c) 2025 Renesas Electronics Corporation and others
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
import { DebugProtocol } from '@vscode/debugprotocol';
import { MIBreakpointMode } from '../mi';

// This mock adapter is overriding the getBreakpointOptions method.
const adapter =
    'integration-tests/mocks/debugAdapters/dynamicBreakpointOptions.js';
const argHardwareBreakpointTrue = '--hardware-breakpoint-true';
const argHardwareBreakpointFalse = '--hardware-breakpoint-false';
const argBreakpointModeHardware = ['--breakpoint-mode', 'hardware'];
const argBreakpointModeSoftware = ['--breakpoint-mode', 'software'];

const program = 'count';

const startDebugClientWithArgs = async (
    test: Mocha.Test | undefined,
    ...args: string[]
) => {
    const dc = await standardBeforeEach(adapter, args);
    await dc.launchRequest(
        fillDefaults(test, {
            program: path.join(testProgramsDir, 'count'),
        })
    );
    return dc;
};

const sendBreakpointRequest = (
    dc: CdtDebugClient,
    options?: Partial<DebugProtocol.SourceBreakpoint>
) => {
    return dc.setBreakpointsRequest({
        source: {
            name: `${program}.c`,
            path: path.join(testProgramsDir, `${program}.c`),
        },
        breakpoints: [
            {
                column: 1,
                line: 4,
                ...(options ?? {}),
            },
        ],
    });
};

const expectBreakpoint = async (
    dc: CdtDebugClient,
    response: DebugProtocol.SetBreakpointsResponse,
    breakpointMode: MIBreakpointMode
) => {
    expect(response.body.breakpoints.length).eq(1);
    expect(response.body.breakpoints[0].verified).eq(true);
    expect(response.body.breakpoints[0].message).eq(undefined);
    await dc.configurationDoneRequest();

    let isCorrect;
    let outputs;
    while (!isCorrect) {
        // Cover the case of getting event in Linux environment.
        // If cannot get correct event, program timeout and test case failed.
        outputs = await dc.waitForEvent('output');
        isCorrect = outputs.body.output.includes('breakpoint-modified');
    }
    expect(outputs?.body.output).includes(
        `type="${
            breakpointMode === 'hardware' ? 'hw breakpoint' : 'breakpoint'
        }"`
    );
    const stoppedOutput = await dc.waitForEvent('stopped');
    expect(stoppedOutput.body?.reason).eq('breakpoint');
};

// Hardware breakpoint tests are not working, so skipped for Windows.
// For further information, please check the discussion here:
// https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/350
const skipHardwareBreakpointTest = os.platform() === 'win32';

describe('breakpoint mode', async () => {
    let dc: CdtDebugClient;

    afterEach(async () => {
        await dc.stop();
    });

    describe('with no override', async () => {
        beforeEach(async function () {
            dc = await startDebugClientWithArgs(this.currentTest);
        });

        it('insert breakpoint as hardware breakpoint', async function () {
            if (skipHardwareBreakpointTest) {
                this.skip();
            }

            const response = await sendBreakpointRequest(dc, {
                mode: 'hardware',
            });

            await expectBreakpoint(dc, response, 'hardware');
        });

        it('insert breakpoint as software breakpoint', async function () {
            const response = await sendBreakpointRequest(dc, {
                mode: 'software',
            });

            await expectBreakpoint(dc, response, 'software');
        });
    });

    describe('with options hardware is true', async () => {
        beforeEach(async function () {
            dc = await startDebugClientWithArgs(
                this.currentTest,
                argHardwareBreakpointTrue
            );
        });

        it('when no mode - insert breakpoint as hardware breakpoint', async function () {
            if (skipHardwareBreakpointTest) {
                this.skip();
            }

            const response = await sendBreakpointRequest(dc);

            await expectBreakpoint(dc, response, 'hardware');
        });

        it('when mode is hardware - insert breakpoint as hardware breakpoint', async function () {
            if (skipHardwareBreakpointTest) {
                this.skip();
            }

            const response = await sendBreakpointRequest(dc, {
                mode: 'hardware',
            });

            await expectBreakpoint(dc, response, 'hardware');
        });

        it('when mode is software - insert breakpoint as software breakpoint', async function () {
            const response = await sendBreakpointRequest(dc, {
                mode: 'software',
            });

            await expectBreakpoint(dc, response, 'software');
        });
    });

    describe('with options hardware is false', async () => {
        beforeEach(async function () {
            dc = await startDebugClientWithArgs(
                this.currentTest,
                argHardwareBreakpointFalse
            );
        });

        it('when no mode - insert breakpoint as software breakpoint', async function () {
            const response = await sendBreakpointRequest(dc);

            await expectBreakpoint(dc, response, 'software');
        });

        it('when mode is hardware - insert breakpoint as hardware breakpoint', async function () {
            if (skipHardwareBreakpointTest) {
                this.skip();
            }

            const response = await sendBreakpointRequest(dc, {
                mode: 'hardware',
            });

            await expectBreakpoint(dc, response, 'hardware');
        });

        it('when mode is software - insert breakpoint as software breakpoint', async function () {
            const response = await sendBreakpointRequest(dc, {
                mode: 'software',
            });

            await expectBreakpoint(dc, response, 'software');
        });
    });

    describe('with options mode overriden to hardware', async () => {
        beforeEach(async function () {
            dc = await startDebugClientWithArgs(
                this.currentTest,
                ...argBreakpointModeHardware
            );
        });

        it('with no mode in request - insert breakpoint as hardware breakpoint', async function () {
            if (skipHardwareBreakpointTest) {
                this.skip();
            }

            const response = await sendBreakpointRequest(dc);

            await expectBreakpoint(dc, response, 'hardware');
        });

        it('with mode is hardware in request - insert breakpoint as hardware breakpoint', async function () {
            if (skipHardwareBreakpointTest) {
                this.skip();
            }

            const response = await sendBreakpointRequest(dc, {
                mode: 'hardware',
            });

            await expectBreakpoint(dc, response, 'hardware');
        });

        it('with mode is software in request - still insert breakpoint as hardware breakpoint', async function () {
            if (skipHardwareBreakpointTest) {
                this.skip();
            }

            const response = await sendBreakpointRequest(dc, {
                mode: 'software',
            });

            await expectBreakpoint(dc, response, 'hardware');
        });
    });

    describe('with options mode overriden to software', async () => {
        beforeEach(async function () {
            dc = await startDebugClientWithArgs(
                this.currentTest,
                ...argBreakpointModeSoftware
            );
        });

        it('with no mode in request - insert breakpoint as software breakpoint', async function () {
            const response = await sendBreakpointRequest(dc);

            await expectBreakpoint(dc, response, 'software');
        });

        it('with mode is hardware in request - still insert breakpoint as software breakpoint', async function () {
            const response = await sendBreakpointRequest(dc, {
                mode: 'hardware',
            });

            await expectBreakpoint(dc, response, 'software');
        });

        it('with mode is software in request - insert breakpoint as software breakpoint', async function () {
            const response = await sendBreakpointRequest(dc, {
                mode: 'software',
            });

            await expectBreakpoint(dc, response, 'software');
        });
    });
});
