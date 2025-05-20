/*********************************************************************
 * Copyright (c) 2025 Arm Ltd
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
/*
fillDefaults(test, {
    program: path.join(testProgramsDir, program),
    customResetCommands: [
        'monitor reset halt hardware',
    ],
})
dc.send('cdt-gdb-adapter/customReset');
*/



import * as path from 'path';
import {
    TargetLaunchRequestArguments,
    TargetLaunchArguments,
} from '../types/session';
import { CdtDebugClient } from './debugClient';
import { fillDefaults, isRemoteTest, standardBeforeEach, testProgramsDir } from './utils';
import * as os from 'os';

describe('custom reset', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
    });

    afterEach(async function () {
        await dc.stop();
    });

    it.only('tests sending custom reset commands', async function () {
        if (!isRemoteTest) {
            // command is implemented in the remote adapter
            // but not in the local adapter
            // so skip this test if not running remote
            this.skip();
        }

        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
                customResetCommands: [
                    'print 42',
                ],            
                target: {
                    type: 'remote',
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            {
                path: emptySrc,
                line: 3,
            }
        );

        dc.customRequest('cdt-gdb-adapter/customReset');
        await dc.waitForOutputEvent(
            'stdout',
            `$1 = 42${os.platform() === 'win32' ? '\r\n' : '\n'}`
        );
    });
    

    it('can launch remote and hit a breakpoint', async function () {
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
                customResetCommands: [
                    'monitor reset halt hardware',
                ],            
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

});
