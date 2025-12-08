/*********************************************************************
 * Copyright (c) 2024 Kichwa Coders and others
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
    LaunchRequestArguments,
    AttachRequestArguments,
    TargetLaunchRequestArguments,
    TargetAttachRequestArguments,
    TargetLaunchArguments,
    TargetAttachArguments,
} from '../types/session';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    standardBeforeEach,
    testProgramsDir,
    gdbServerPath,
    isRemoteTest,
} from './utils';

describe('preConnectCommands execution order', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');
    const loopForeverProgram = path.join(testProgramsDir, 'loopforever');
    const loopForeverSrc = path.join(testProgramsDir, 'loopforever.c');

    afterEach(async function () {
        await dc.stop();
    });

    it('gdb launch: preConnectCommands before initCommands', async function () {
        if (isRemoteTest) {
            this.skip();
        }
        dc = await standardBeforeEach();

        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
                preConnectCommands: ['echo [1] preConnectCommands\\n'],
                initCommands: ['echo [2] initCommands\\n'],
            } as LaunchRequestArguments),
            { path: emptySrc, line: 3 }
        );
    });

    it('gdb attach: preConnectCommands before initCommands', async function () {
        if (isRemoteTest) {
            this.skip();
        }
        dc = await standardBeforeEach();
        const inferior = cp.spawn(loopForeverProgram, [], {
            cwd: testProgramsDir,
        });

        try {
            await dc.attachHitBreakpoint(
                fillDefaults(this.test, {
                    program: loopForeverProgram,
                    processId: `${inferior.pid}`,
                    preConnectCommands: ['echo [1] preConnectCommands\\n'],
                    initCommands: ['echo [2] initCommands\\n'],
                } as AttachRequestArguments),
                { line: 25, path: loopForeverSrc }
            );
        } finally {
            inferior.kill();
        }
    });

    it('gdbtarget launch: preConnectCommands before connection and initCommands', async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');

        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
                preConnectCommands: ['echo [1] preConnectCommands\\n'],
                initCommands: ['echo [2] initCommands\\n'],
                target: { type: 'remote' } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            { path: emptySrc, line: 3 }
        );
    });

    it('gdbtarget attach: preConnectCommands before connection and initCommands', async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
        const gdbserver = cp.spawn(
            gdbServerPath,
            [':0', loopForeverProgram],
            { cwd: testProgramsDir }
        );

        try {
            const port = await new Promise<string>((resolve, reject) => {
                const regex = /Listening on port ([0-9]+)\r?\n/;
                let stderr = '';
                if (gdbserver.stderr) {
                    gdbserver.stderr.on('data', (data) => {
                        stderr += String(data);
                        const m = regex.exec(stderr);
                        if (m) resolve(m[1]);
                    });
                } else {
                    reject(new Error('Missing stderr'));
                }
            });

            await dc.attachHitBreakpoint(
                fillDefaults(this.test, {
                    program: loopForeverProgram,
                    preConnectCommands: ['echo [1] preConnectCommands\\n'],
                    initCommands: ['echo [2] initCommands\\n'],
                    target: {
                        type: 'remote',
                        parameters: [`localhost:${port}`],
                    } as TargetAttachArguments,
                } as TargetAttachRequestArguments),
                { line: 25, path: loopForeverSrc }
            );
        } finally {
            gdbserver.kill();
        }
    });
});
