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
import * as fs from 'fs';
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

// Run make once per mocha execution by having root-level before
before(function(done) {
    this.timeout(20000);
    cp.execSync('make', { cwd: testProgramsDir });
    done();
});

function getAdapterAndArgs(adapter?: string): string {
    const chosenAdapter = adapter !== undefined ? adapter : defaultAdapter;
    let args: string = path.join(__dirname, '../../dist', chosenAdapter);
    if (process.env.INSPECT_DEBUG_ADAPTER) {
        args = '--inspect-brk ' + args;
    }
    return args;
}

export async function standardBeforeEach(adapter?: string): Promise<CdtDebugClient> {
    const dc: CdtDebugClient = new CdtDebugClient('node', getAdapterAndArgs(adapter), 'cppdbg', {
        shell: true,
    });
    await dc.start(debugServerPort);
    await dc.initializeRequest();

    return dc;
}

export const openGdbConsole: boolean = process.argv.indexOf('--run-in-terminal') !== -1;
export const gdbPath: string | undefined = getGdbPathCli();
export const gdbServerPath: string = getGdbServerPathCli();
export const debugServerPort: number | undefined = getDebugServerPortCli();
export const defaultAdapter: string = getDefaultAdapterCli();

function getGdbPathCli(): string | undefined {
    const keyIndex = process.argv.indexOf('--gdb-path');
    if (keyIndex === -1) {
        return undefined;
    }
    return process.argv[keyIndex + 1];
}

function getGdbServerPathCli(): string {
    const keyIndex = process.argv.indexOf('--gdbserver-path');
    if (keyIndex === -1) {
        return 'gdbserver';
    }
    return process.argv[keyIndex + 1];
}

function getDebugServerPortCli(): number | undefined {
    const keyIndex = process.argv.indexOf('--debugserverport');
    if (keyIndex === -1) {
        return undefined;
    }
    return parseInt(process.argv[keyIndex + 1], 10);
}

function getDefaultAdapterCli(): string {
    const keyIndex = process.argv.indexOf('--test-remote');
    if (keyIndex === -1) {
        return 'debugAdapter.js';
    }
    return 'debugTargetAdapter.js';
}

export interface LineTags { [key: string]: number; }

/**
 * Find locations of tags in `sourceFile`.
 *
 * Instead of referring to source line numbers of test programs directly,
 * tests should place tags (usually some comments) in the source files.  This
 * function finds the line number correspnding to each tag in `tags`.
 *
 * This function throws if a tag is found more than once or is not found.
 *
 * @param tags An object where keys are the tags to find, and values are 0.
 *             This function will modify the object in place to full the values
 *             with line number.
 */
export function resolveLineTagLocations(sourceFile: string, tags: LineTags): void {
    const lines = fs.readFileSync(sourceFile, { encoding: 'utf-8' }).split('\n');

    for (let i = 0; i < lines.length; i++) {
        for (const tag of Object.keys(tags)) {
            if (lines[i].includes(tag)) {
                if (tags[tag] !== 0) {
                    throw new Error(`Tag ${tag} has been found twice.`);
                }

                tags[tag] = i + 1;
            }
        }
    }

    for (const tag of Object.keys(tags)) {
        const line = tags[tag];

        if (line === 0) {
            throw new Error(`Tag ${tag} was not found.`);
        }
    }
}
