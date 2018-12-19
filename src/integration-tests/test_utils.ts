/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import { DebugClient } from 'vscode-debugadapter-testsupport';
import { DebugProtocol } from 'vscode-debugprotocol';

export interface Scope {
    threadId: number;
    frameId: number;
    scopes: DebugProtocol.ScopesResponse;
}

export async function getScopes(
        dc: DebugClient,
        threadIndex = 0,
        stackIndex = 0,
        ): Promise<Scope> {
    // threads
    const threads = await dc.threadsRequest();
    expect(threads.body.threads.length).to.be.at.least(threadIndex + 1);
    const threadId = threads.body.threads[threadIndex].id;
    // stack trace
    const stack = await dc.stackTraceRequest({ threadId});
    expect(stack.body.stackFrames.length).to.be.at.least(stackIndex + 1);
    const frameId = stack.body.stackFrames[stackIndex].id;
    const scopes = await dc.scopesRequest({ frameId });
    return Promise.resolve({threadId, frameId, scopes});
}
