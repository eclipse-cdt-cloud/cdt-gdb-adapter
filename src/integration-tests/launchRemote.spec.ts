/*********************************************************************
 * Copyright (c) 2019 Kichwa Coders and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import {
    TargetLaunchRequestArguments,
    TargetLaunchArguments,
} from '../GDBTargetDebugSession';
import { CdtDebugClient } from './debugClient';
import { fillDefaults, standardBeforeEach, testProgramsDir } from './utils';

describe('launch remote', function () {
    let dc: CdtDebugClient | undefined;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
    });

    afterEach(async function () {
        await dc?.stop();
    });

    it('can launch remote and hit a breakpoint', async function () {
        await dc?.hitBreakpoint(
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

    it('closes target server at exit', async function() {
        let config = this.test;
        config?.timeout(99999);
        await dc?.hitBreakpoint(
            fillDefaults(config, {
                program: emptyProgram,
                target: {
                    // By default we use --once with gdbserver so that it naturally quits
                    // when gdb disconnects. Here we leave that off and uses extended-remote
                    // so that gdbserver doesn't quit automatically
                    type: 'extended-remote',
                    serverParameters: [':0', emptyProgram],
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            {
                path: emptySrc,
                line: 3,
            }
        );
        await dc?.stop();
        dc = undefined;
    });
});
