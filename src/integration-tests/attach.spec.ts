/*********************************************************************
 * Copyright (c) 2023 Kichwa Coders and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as cp from 'child_process';
import * as path from 'path';
import { AttachRequestArguments } from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { expect } from 'chai';

describe('attach', function () {
    let dc: CdtDebugClient;
    let inferior: cp.ChildProcess;
    const program = path.join(testProgramsDir, 'loopforever');
    const src = path.join(testProgramsDir, 'loopforever.c');

    beforeEach(async function () {
        dc = await standardBeforeEach();
        inferior = cp.spawn(program, ['running-from-spawn'], {
            cwd: testProgramsDir,
        });
    });

    afterEach(async function () {
        await dc.stop();
        inferior.kill();
    });

    it('can attach and hit a breakpoint', async function () {
        if (isRemoteTest) {
            // attachRemote.spec.ts is the test for when isRemoteTest
            this.skip();
        }

        const attachArgs = fillDefaults(this.test, {
            program: program,
            processId: `${inferior.pid}`,
        } as AttachRequestArguments);
        await dc.attachHitBreakpoint(attachArgs, { line: 25, path: src });
        expect(await dc.evaluate('argv[1]')).to.contain('running-from-spawn');
    });
});
