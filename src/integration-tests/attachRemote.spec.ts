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
    TargetAttachRequestArguments,
    TargetAttachArguments,
} from '../GDBTargetDebugSession';
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    gdbServerPath,
    fillDefaults,
} from './utils';
import { expect } from 'chai';

describe('attach remote', function () {
    let dc: CdtDebugClient;
    let gdbserver: cp.ChildProcess;
    let port: number;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
        gdbserver = cp.spawn(
            gdbServerPath,
            [':0', emptyProgram, 'running-from-spawn'],
            {
                cwd: testProgramsDir,
            }
        );
        port = await new Promise<number>((resolve, reject) => {
            if (gdbserver.stderr) {
                gdbserver.stderr.on('data', (data) => {
                    const line = String(data);
                    const LISTENING_ON_PORT = 'Listening on port ';
                    const index = line.indexOf(LISTENING_ON_PORT);
                    if (index >= 0) {
                        const portStr = line
                            .substr(index + LISTENING_ON_PORT.length, 6)
                            .trim();
                        resolve(parseInt(portStr, 10));
                    }
                });
            } else {
                reject(new Error('Missing stderr on spawned gdbserver'));
            }
        });
    });

    afterEach(async function () {
        await gdbserver.kill();
        await dc.stop();
    });

    it('can attach remote and hit a breakpoint', async function () {
        const attachArgs = fillDefaults(this.test, {
            program: emptyProgram,
            target: {
                type: 'remote',
                parameters: [`localhost:${port}`],
            } as TargetAttachArguments,
        } as TargetAttachRequestArguments);
        await dc.attachHitBreakpoint(attachArgs, { line: 3, path: emptySrc });
        expect(await dc.evaluate('argv[1]')).to.contain('running-from-spawn');
    });
});
