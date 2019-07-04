/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { DebugProtocol } from 'vscode-debugprotocol';
import { CdtDebugClient } from './debugClient';
import { standardBefore, standardBeforeEach, gdbPath, testProgramsDir, openGdbConsole } from './utils';
import { LaunchRequestArguments } from '../GDBDebugSession';
import { expect } from 'chai';
import * as path from 'path';

describe('stop', async () => {

    let dc: CdtDebugClient;

    before(standardBefore);

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
        const stoppedEvent = await dc.waitForEvent('stopped') as DebugProtocol.StoppedEvent;
        expect(stoppedEvent.body.reason).to.eq('pause');
        expect(stoppedEvent.body.text).to.eq('SIGSEGV');
    });

    it('handles pause request', async () => {
        await dc.launchRequest({
            verbose: true,
            gdb: gdbPath,
            program: path.join(testProgramsDir, 'loop'),
            openGdbConsole,
        } as LaunchRequestArguments);
        await dc.configurationDoneRequest();
        const { body: { threads } } = await dc.threadsRequest();
        expect(threads).lengthOf(1);
        const mainThread = threads[0];
        const [, stoppedEvent] = await Promise.all([
            dc.pauseRequest({ threadId: mainThread.id }),
            dc.waitForEvent('stopped') as Promise<DebugProtocol.StoppedEvent>,
        ]);
        expect(stoppedEvent.body.reason).to.equal('pause');
        expect(stoppedEvent.body.text).to.equal('SIGINT');
    });

});
