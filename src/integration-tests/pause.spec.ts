/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada Inc. and others.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    gdbAsync,
    isRemoteTest,
    fillDefaults,
} from './utils';
import * as path from 'path';
import * as os from 'os';

describe('pause', async () => {
    let dc: CdtDebugClient;

    beforeEach(async () => {
        dc = await standardBeforeEach();
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('can be paused', async function () {
        if (os.platform() === 'win32' && (!isRemoteTest || !gdbAsync)) {
            // win32 host can only pause remote + mi-async targets
            this.skip();
        }
        await dc.launchRequest(
            fillDefaults(this.test, {
                program: path.join(testProgramsDir, 'loopforever'),
            })
        );
        await dc.configurationDoneRequest();
        const waitForStopped = dc.waitForEvent('stopped');
        const threads = await dc.threadsRequest();
        const pr = dc.pauseRequest({ threadId: threads.body.threads[0].id });
        await Promise.all([pr, waitForStopped]);
    });
});
