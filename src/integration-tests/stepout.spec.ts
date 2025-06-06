/*********************************************************************
 * Copyright (c) 2019 Arm and others
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
    getScopes,
    fillDefaults,
    isRemoteTest,
} from './utils';
import { TargetLaunchRequestArguments } from '../types/session';

describe('stepout', async function () {
    let dc: CdtDebugClient;

    beforeEach(async function () {
        dc = await standardBeforeEach();
        if (isRemoteTest) {
            await dc.launchRequest(
                fillDefaults(this.currentTest, {
                    program: path.join(testProgramsDir, 'functions'),
                    target: {
                        port: 2333,
                        type: 'remote',
                        serverParameters: [
                            ':2333',
                            path.join(testProgramsDir, 'functions'),
                        ],
                    },
                } as unknown as TargetLaunchRequestArguments)
            );
        } else {
            await dc.launchRequest(
                fillDefaults(this.currentTest, {
                    program: path.join(testProgramsDir, 'functions'),
                })
            );
        }
    });

    afterEach(async () => {
        await dc.stop();
    });

    it('should step out from staticfunc1 to main', async () => {
        await dc.setBreakpointsRequest({
            source: {
                name: 'functions.c',
                path: path.join(testProgramsDir, 'functions.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: 3,
                },
            ],
        });
        await dc.configurationDoneRequest();
        await dc.waitForEvent('stopped');
        const scope = await getScopes(dc);
        await dc.stepOutRequest({
            threadId: scope.thread.id,
        });
        const stepOutEvent = await dc.waitForEvent('stopped');
        expect(stepOutEvent.body.reason).eq('step');
        const stackTrace = await dc.stackTraceRequest({
            threadId: stepOutEvent.body.threadId,
        });
        expect(stackTrace.body.stackFrames[0].name.includes('main'));
    });
});
