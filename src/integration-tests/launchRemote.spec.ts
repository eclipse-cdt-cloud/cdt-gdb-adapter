/*********************************************************************
 * Copyright (c) 2019 Kichwa Coders and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as cp from 'child_process';
import * as path from 'path';
import {
    TargetLaunchRequestArguments,
    TargetLaunchArguments,
} from '../types/session';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    gdbAsync,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { expect } from 'chai';
import * as os from 'os';

describe('launch remote', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');
    const loopForeverProgram = path.join(testProgramsDir, 'loopforever');

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('can launch remote and hit a breakpoint', async function () {
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
                target: {
                    type: 'remote',
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            {
                path: emptySrc,
                line: 3,
            }
        );
    });

    it('can print a message to the debug console sent from a socket server', async function () {
        const socketServer = cp.spawn(
            'node',
            [`${path.join(testProgramsDir, 'socketServer.js')}`],
            {
                cwd: testProgramsDir,
            }
        );
        // Ensure that the socket port is defined prior to the test.
        let socketPort = '';
        socketServer.stdout.on('data', (data) => {
            socketPort = data.toString();
            socketPort = socketPort.substring(0, socketPort.indexOf('\n'));
        });

        // Sleep for 1 second before running test to ensure socketPort is defined.
        await new Promise((f) => setTimeout(f, 1000));
        expect(socketPort).not.eq('');

        await dc.getDebugConsoleOutput(
            fillDefaults(this.test, {
                program: emptyProgram,
                openGdbConsole: false,
                initCommands: ['break _fini'],
                target: {
                    uart: {
                        socketPort: socketPort,
                        eolCharacter: 'LF',
                    },
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            'Socket',
            `Hello World!${os.EOL}`
        );

        // Kill the spawned process.
        socketServer.kill();
    });

    it('can print a message to the debug console sent from across a serial line', async function () {
        // Skip this test on Windows - socat utility only available on Linux.
        if (os.platform() === 'win32') this.skip();

        // Start a virtual serial line. Use /tmp/ttyV0 and /tmp/ttyV1 to refer to the two ends.
        const virtualSerialLine = cp.spawn('socat', [
            '-d',
            '-d',
            'pty,rawer,echo=0,link=/tmp/ttyV0',
            'pty,rawer,echo=0,link=/tmp/ttyV1',
        ]);

        await dc.getDebugConsoleOutput(
            fillDefaults(this.test, {
                program: emptyProgram,
                openGdbConsole: false,
                initCommands: ['break _fini'],
                preRunCommands: [`shell echo "Hello World!" > /tmp/ttyV1`],
                target: {
                    uart: {
                        serialPort: '/tmp/ttyV0',
                        eolCharacter: 'LF',
                        baudRate: 38400,
                    },
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            'Serial Port',
            `Hello World!${os.EOL}`
        );

        // Kill the spawned process.
        virtualSerialLine.kill();
    });

    it('can show user error on debug console if UART fails to open - Serial Port', async function () {
        const output = await dc.getDebugConsoleOutput(
            fillDefaults(this.test, {
                program: emptyProgram,
                openGdbConsole: false,
                initCommands: ['break _fini'],
                target: {
                    uart: {
                        serialPort: '/mistake',
                    },
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            'Serial Port',
            'error on serial port connection',
            true
        );
        expect(output.body.output).contains('mistake');
    });

    it('can show user error on debug console if UART fails to open - Socket', async function () {
        await dc.getDebugConsoleOutput(
            fillDefaults(this.test, {
                program: emptyProgram,
                openGdbConsole: false,
                initCommands: ['break _fini'],
                target: {
                    uart: {
                        socketPort: '0',
                    },
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            'Socket',
            'error on socket connection',
            true
        );
    });

    it('should not reject evaluation of expression without a frame', async function () {
        await dc.launchRequest(
            fillDefaults(this.test, {
                program: loopForeverProgram,
                target: {
                    type: 'remote',
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments)
        );

        const ret = await dc.evaluateRequest({
            context: 'repl',
            expression: '>help',
        });
        expect(ret.body.result).to.include('\r');
        expect(ret.command).to.include('evaluate');
    });

    it('returns empty responses for selected requests after disconnect from remote', async function () {
        const args = {
            program: loopForeverProgram,
            target: {
                type: 'remote',
            } as TargetLaunchArguments,
        } as TargetLaunchRequestArguments;

        if (gdbAsync) {
            // Arguments which require gdbAsync support
            Object.assign(args, { customResetCommands: ['help'] });
        }

        // Launch
        await dc.launchRequest(fillDefaults(this.test, args));

        // Disconnect
        await dc.disconnectRequest();

        // Capture output events, spyOn doesn't work well with logger
        const stdOutput: string[] = [];
        dc.on('output', (event) => {
            if (event.body.category === 'stdout') {
                stdOutput.push(event.body.output);
            }
        });
        const expectedLogOutput = [
            'Debug adapter cannot process memory request, skipping it.',
            'Debug adapter cannot process data breakpoint info request, skipping it.',
            'Debug adapter cannot process data breakpoints request, skipping it.',
            'Debug adapter cannot process instruction breakpoints request, skipping it.',
            'Debug adapter cannot process breakpoints request, skipping it.',
            'Debug adapter cannot process function breakpoints request, skipping it.',
            'Debug adapter cannot process threads request, skipping it.',
            'Debug adapter cannot process stack trace request, skipping it.',
            'Debug adapter cannot process next request, skipping it.',
            'Debug adapter cannot process step in request, skipping it.',
            'Debug adapter cannot process step out request, skipping it.',
            'Debug adapter cannot process continue request, skipping it.',
            'Debug adapter cannot process pause request, skipping it.',
            'Debug adapter cannot process scopes request, skipping it.',
            'Debug adapter cannot process variables request, skipping it.',
            'Debug adapter cannot process set variable request, skipping it.',
            'Debug adapter cannot process evaluate request, skipping it.',
            'Debug adapter cannot process disassemble request, skipping it.',
            'Debug adapter cannot process read memory request, skipping it.',
            'Debug adapter cannot process write memory request, skipping it.',
        ];
        //Following requests get bounced and return "empty" responses instead of throwing errors
        const requestPromises = [
            dc.customRequest('cdt-gdb-adapter/Memory', {}),
            dc.dataBreakpointInfoRequest({ name: 'foo' }),
            dc.setDataBreakpointsRequest({
                breakpoints: [{ dataId: 'foo' }],
            }),
            dc.setInstructionBreakpointsRequest({
                breakpoints: [{ instructionReference: '0x0' }],
            }),
            dc.setBreakpointsRequest({
                source: {},
                breakpoints: [{ line: 1 }],
            }),
            dc.setFunctionBreakpointsRequest({
                breakpoints: [{ name: 'func' }],
            }),
            dc.threadsRequest(),
            dc.stackTraceRequest({ threadId: 0 }),
            dc.nextRequest({ threadId: 0 }),
            dc.stepInRequest({ threadId: 0 }),
            dc.stepOutRequest({ threadId: 0 }),
            dc.continueRequest({ threadId: 0 }),
            dc.pauseRequest({ threadId: 0 }),
            dc.scopesRequest({ frameId: 0 }),
            dc.variablesRequest({ variablesReference: 0 }),
            dc.setVariableRequest({
                variablesReference: 0,
                name: 'var',
                value: 'value',
            }),
            dc.evaluateRequest({ expression: 'var' }),
            dc.disassembleRequest({
                memoryReference: '0x0',
                instructionCount: 1,
            }),
            dc.readMemoryRequest({ memoryReference: '0x0', count: 1 }),
            dc.writeMemoryRequest({ memoryReference: '0x0', data: '00' }),
        ];
        if (gdbAsync) {
            // Requests which require gdbAsync support
            expectedLogOutput.push(
                'Debug adapter cannot process custom reset request, skipping it.'
            );
            requestPromises.push(
                dc.customRequest('cdt-gdb-adapter/customReset')
            );
        }
        await Promise.all(requestPromises);
        expect(
            expectedLogOutput.every((log) =>
                stdOutput.some((std) => std.startsWith(log))
            )
        ).to.be.true;
    });
});
