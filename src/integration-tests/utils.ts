/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
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
    expect(threads.body.threads.length, 'There are fewer threads than expected.').to.be.at.least(threadIndex + 1);
    const threadId = threads.body.threads[threadIndex].id;
    // stack trace
    const stack = await dc.stackTraceRequest({ threadId});
    expect(stack.body.stackFrames.length, 'There are fewer stack frames than expected.').to.be.at.least(stackIndex + 1);
    const frameId = stack.body.stackFrames[stackIndex].id;
    const scopes = await dc.scopesRequest({ frameId });
    return Promise.resolve({threadId, frameId, scopes});
}

/**
 * Wrap `promise` in a new Promise that resolves if `promise` is rejected, and is rejected if `promise` is resolved.
 *
 * This is useful when we expect `promise` to be reject and want to test that it is indeed the case.
 */
export function expectRejection<T>(promise: Promise<T>): Promise<Error> {
    return new Promise<Error>((resolve, reject) => {
        promise.then(reject).catch(resolve);
    });
}
