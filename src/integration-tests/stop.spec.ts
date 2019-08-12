/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { CdtDebugClient } from './debugClient';
import { standardBeforeEach, gdbPath, testProgramsDir, openGdbConsole } from './utils';
import { LaunchRequestArguments } from '../GDBDebugSession';
import { expect } from 'chai';
import * as path from 'path';

describe('stop', async () => {

    let dc: CdtDebugClient;

    beforeEach(async () => {
        dc = await standardBeforeEach();
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('handles segv', async () => {
        await dc.launchRequest({
            verbose: true,
            gdb: gdbPath,
            program: path.join(testProgramsDir, 'segv'),
            openGdbConsole,
        } as LaunchRequestArguments);
        await dc.configurationDoneRequest();
        const stoppedEvent = await dc.waitForEvent('stopped');
        expect(stoppedEvent.body.reason).to.eq('SIGSEGV');
    });
});
