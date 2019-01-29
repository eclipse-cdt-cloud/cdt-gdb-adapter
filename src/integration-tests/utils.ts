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
import * as cp from 'child_process';
import * as path from 'path';
import { DebugProtocol } from 'vscode-debugprotocol';
import { CdtDebugClient } from './debugClient';

export interface Scope {
    threadId: number;
    frameId: number;
    scopes: DebugProtocol.ScopesResponse;
}

export async function getScopes(
    dc: CdtDebugClient,
    threadIndex = 0,
    stackIndex = 0,
): Promise<Scope> {
    // threads
    const threads = await dc.threadsRequest();
    expect(threads.body.threads.length, 'There are fewer threads than expected.').to.be.at.least(threadIndex + 1);
    const threadId = threads.body.threads[threadIndex].id;
    // stack trace
    const stack = await dc.stackTraceRequest({ threadId });
    expect(stack.body.stackFrames.length, 'There are fewer stack frames than expected.').to.be.at.least(stackIndex + 1);
    const frameId = stack.body.stackFrames[stackIndex].id;
    const scopes = await dc.scopesRequest({ frameId });
    return Promise.resolve({ threadId, frameId, scopes });
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

/**
 * Test a given variable returned from a variablesRequest against an expected name, type, and/or value.
 */
export function verifyVariable(
    variable: DebugProtocol.Variable,
    expectedName: string,
    expectedType?: string,
    expectedValue?: string,
    hasChildren = false,
) {
    expect(variable.name, `The name of ${expectedName} is wrong`).to.equal(expectedName);
    if (expectedType) {
        expect(variable.type, `The type of ${expectedName} is wrong`).to.equal(expectedType);
    }
    if (expectedValue) {
        expect(variable.value, `The value of ${expectedName} is wrong`).to.equal(expectedValue);
    }
    if (hasChildren) {
        expect(variable.variablesReference, `${expectedName} has no children`).to.not.equal(0);
    } else {
        expect(variable.variablesReference, `${expectedName} has children`).to.equal(0);
    }
}

export function compareVariable(
    varA: DebugProtocol.Variable,
    varB: DebugProtocol.Variable,
    namesMatch: boolean,
    typesMatch: boolean,
    valuesMatch: boolean,
) {
    if (namesMatch) {
        expect(varA.name, `The name of ${varA.name} and ${varB.name} does not match`).to.equal(varB.name);
    } else {
        expect(varA.name, `The name of ${varA.name} and ${varB.name} matches`).to.not.equal(varB.name);
    }
    if (typesMatch) {
        expect(varA.type, `The type of ${varA.name} and ${varB.name} does not match`).to.equal(varB.type);
    } else {
        expect(varA.type, `The type of ${varA.name} and ${varB.name} match`).to.equal(varB.type);
    }
    if (valuesMatch) {
        expect(varA.value, `The value of ${varA.name} and ${varB.name} do not match`).to.equal(varB.value);
    } else {
        expect(varA.value, `The value of ${varA.name} and ${varB.name} matches`).to.not.equal(varB.value);
    }
}

export const testProgramsDir = path.join(__dirname, '..', '..', 'src', 'integration-tests', 'test-programs');

export async function standardBefore(): Promise<void> {
    // Build the test program
    cp.execSync('make', { cwd: testProgramsDir });
}

function getAdapterAndArgs(): string {
    let args: string = path.join(__dirname, '..', 'debugAdapter.js');
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        args = '--inspect-brk ' + args;
    }
    return args;
}

export async function standardBeforeEach(): Promise<CdtDebugClient> {
    const dc: CdtDebugClient = new CdtDebugClient('node', getAdapterAndArgs(), 'cppdbg', {
        shell: true,
    });
    await dc.start();
    await dc.initializeRequest();

    return dc;
}

export const openGdbConsole: boolean = process.argv.indexOf('--run-in-terminal') !== -1;
export const gdbPath: string | undefined = getGdbPathCli();

function getGdbPathCli(): string | undefined {
    const keyIndex = process.argv.indexOf('--gdb-path');
    if (keyIndex === -1) {
        return undefined;
    }
    return process.argv[keyIndex + 1];
}
