/*********************************************************************
 * Copyright (c) 2025 Arm Ltd and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { expect } from 'chai';
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    fillDefaults,
    isRemoteTest,
    gdbAsync,
    gdbNonStop,
} from './utils';
import { TargetLaunchRequestArguments } from '../types/session';

// This mock adapter creates a standard GDB backend and and stub auxiliary GDB backend
const auxiliaryGdbAdapter =
    'integration-tests/mocks/debugAdapters/auxiliaryGdb.js';

describe('auxiliary gdb', async () => {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        if (!isRemoteTest || !gdbAsync || gdbNonStop) {
            this.skip();
            return;
        }
        dc = await standardBeforeEach(auxiliaryGdbAdapter);
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program: path.join(testProgramsDir, 'loopForever'),
                auxiliaryGdb: true,
            } as TargetLaunchRequestArguments)
        );
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('do nothing', async () => {
        expect(true).eq(true);
    });
});
