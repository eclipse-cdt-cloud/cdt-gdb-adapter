/*********************************************************************
 * Copyright (c) 2019 Arm and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { join } from 'path';
import { expect } from 'chai';
import { CdtDebugClient } from './debugClient';
import { LaunchRequestArguments } from '../GDBDebugSession';
import {
    standardBeforeEach,
    gdbPath,
    testProgramsDir,
    openGdbConsole,
    getScopes,
} from './utils';
import { StoppedEvent } from 'vscode-debugadapter';

describe('function breakpoints', async () => {
    let dc: CdtDebugClient;

    beforeEach(async () => {
        dc = await standardBeforeEach();

        await dc.launchRequest({
            verbose: true,
            gdb: gdbPath,
            program: join(testProgramsDir, 'functions'),
            openGdbConsole,
        } as LaunchRequestArguments);
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('hits the main function breakpoint', async () => {
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'main',
                },
            ],
        });
        await dc.configurationDoneRequest();
        dc.waitForEvent('stopped');
        const scope = await getScopes(dc);
        expect(scope.frame.line).to.eq(6);
    });

    it('hits the sub function breakpoint', async () => {
        await dc.setFunctionBreakpointsRequest({
            breakpoints: [
                {
                    name: 'sub',
                },
            ],
        });
        await dc.configurationDoneRequest();
        const event = await dc.waitForEvent('stopped') as StoppedEvent;
        expect(event.body.reason).to.eq('function breakpoint');
        const scope = await getScopes(dc);
        expect(scope.frame.line).to.eq(2);
    });
});
