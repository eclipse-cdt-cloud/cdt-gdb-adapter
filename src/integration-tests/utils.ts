/*********************************************************************
 * Copyright (c) 2018, 2023 Ericsson and others
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
import * as os from 'os';
import { DebugProtocol } from '@vscode/debugprotocol';
import { CdtDebugClient } from './debugClient';
import { compareVersions, getGdbVersion } from '../util';
import { Runnable } from 'mocha';
import { RequestArguments } from '../GDBDebugSession';

export interface Scope {
    thread: DebugProtocol.Thread;
    frame: DebugProtocol.StackFrame;
    scopes: DebugProtocol.ScopesResponse;
}

export async function getScopes(
    dc: CdtDebugClient,
    threadIndex = 0,
    stackIndex = 0
): Promise<Scope> {
    // threads
    const threads = await dc.threadsRequest();
    expect(
        threads.body.threads.length,
        'There are fewer threads than expected.'
    ).to.be.at.least(threadIndex + 1);
    const thread = threads.body.threads[threadIndex];
    const threadId = thread.id;
    // stack trace
    const stack = await dc.stackTraceRequest({ threadId });
    expect(
        stack.body.stackFrames.length,
        'There are fewer stack frames than expected.'
    ).to.be.at.least(stackIndex + 1);
    const frame = stack.body.stackFrames[stackIndex];
    const frameId = frame.id;
    const scopes = await dc.scopesRequest({ frameId });
    return Promise.resolve({ thread, frame, scopes });
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
    flags?: {
        hasChildren?: boolean; // default false
        hasMemoryReference?: boolean; // default true
    }
) {
    expect(variable.name, `The name of ${expectedName} is wrong`).to.equal(
        expectedName
    );
    if (expectedType) {
        expect(variable.type, `The type of ${expectedName} is wrong`).to.equal(
            expectedType
        );
    }
    if (expectedValue) {
        expect(
            variable.value,
            `The value of ${expectedName} is wrong`
        ).to.equal(expectedValue);
    }
    if (flags?.hasChildren) {
        expect(
            variable.variablesReference,
            `${expectedName} has no children`
        ).to.not.equal(0);
    } else {
        expect(
            variable.variablesReference,
            `${expectedName} has children`
        ).to.equal(0);
    }
    if (flags?.hasMemoryReference || flags?.hasMemoryReference === undefined) {
        // Rather than actual read the memory, just verify that the memory
        // reference is to what is expected
        expect(variable.memoryReference).eq(`&(${expectedName})`);
    } else {
        // For now we only support memory references for top-level
        // variables (e.g. no struct members). A possible
        // TODO is to support memoryReferences in these cases
        expect(variable.memoryReference).is.undefined;
    }
}

/**
 * Test a given register variable returned from a variablesRequest against an expected name and/or value.
 */
export function verifyRegister(
    variable: DebugProtocol.Variable,
    expectedName: string,
    expectedValue?: string
) {
    expect(variable.name, `The name of ${expectedName} is wrong`).to.equal(
        expectedName
    );
    if (expectedValue) {
        expect(
            variable.value,
            `The value of ${expectedName} is wrong`
        ).to.equal(expectedValue);
    }
}

export function compareVariable(
    varA: DebugProtocol.Variable,
    varB: DebugProtocol.Variable,
    namesMatch: boolean,
    typesMatch: boolean,
    valuesMatch: boolean
) {
    if (namesMatch) {
        expect(
            varA.name,
            `The name of ${varA.name} and ${varB.name} does not match`
        ).to.equal(varB.name);
    } else {
        expect(
            varA.name,
            `The name of ${varA.name} and ${varB.name} matches`
        ).to.not.equal(varB.name);
    }
    if (typesMatch) {
        expect(
            varA.type,
            `The type of ${varA.name} and ${varB.name} does not match`
        ).to.equal(varB.type);
    } else {
        expect(
            varA.type,
            `The type of ${varA.name} and ${varB.name} match`
        ).to.equal(varB.type);
    }
    if (valuesMatch) {
        expect(
            varA.value,
            `The value of ${varA.name} and ${varB.name} do not match`
        ).to.equal(varB.value);
    } else {
        expect(
            varA.value,
            `The value of ${varA.name} and ${varB.name} matches`
        ).to.not.equal(varB.value);
    }
}

export const testProgramsDir = path.join(
    __dirname,
    '..',
    '..',
    'src',
    'integration-tests',
    'test-programs'
);

export async function standardBeforeEach(
    adapter?: string,
    extraArgs?: string[]
): Promise<CdtDebugClient> {
    const dc: CdtDebugClient = new CdtDebugClient(adapter, extraArgs);
    await dc.start(debugServerPort);
    await dc.initializeRequest();

    return dc;
}

export function fillDefaults(
    test?: Runnable,
    argsIn?: RequestArguments
): RequestArguments {
    if (!test) {
        throw new Error(
            'A Test object is required (this.test in test body or this.currentTest in beforeEach'
        );
    }
    const args = argsIn !== undefined ? argsIn : ({} as RequestArguments);
    args.verbose = true;
    args.logFile = logFileName(test);
    args.gdb = gdbPath;
    args.openGdbConsole = openGdbConsole;
    args.gdbAsync = gdbAsync;
    args.gdbNonStop = gdbNonStop;
    args.hardwareBreakpoint = hardwareBreakpoint;
    return args;
}

export const openGdbConsole: boolean =
    process.argv.indexOf('--run-in-terminal') !== -1;
export const isRemoteTest: boolean =
    process.argv.indexOf('--test-remote') !== -1;
export const gdbAsync: boolean =
    process.argv.indexOf('--test-gdb-async-off') === -1;
export const gdbNonStop: boolean =
    process.argv.indexOf('--test-gdb-non-stop') !== -1;
export const skipMake: boolean = process.argv.indexOf('--skip-make') !== -1;
export const gdbPath: string | undefined = getGdbPathCli();
export const gdbServerPath: string = getGdbServerPathCli();
export const debugServerPort: number | undefined = getDebugServerPortCli();
export const defaultAdapter: string = getDefaultAdapterCli();
export const hardwareBreakpoint: boolean =
    process.argv.indexOf('--test-hw-breakpoint-on') !== -1;

before(function () {
    // Run make once per mocha execution, unless --skip-make
    // is specified. On the CI we run with --skip-make and the
    // make is its own explicit build step for two reasons:
    // 1. It makes it easier to see build errors in the make
    // 2. On CI we get errors running make on Windows like
    // ld.exe: cannot open output file empty.exe: Permission denied
    // The second reason may be because sometimes empty.exe is left
    // running after a remote test finishes.
    if (!skipMake) {
        cp.execSync('make', { cwd: testProgramsDir });
    }

    if ((gdbNonStop || hardwareBreakpoint) && os.platform() === 'win32') {
        // skip tests that are unsupported on Windows
        this.skip();
    }
});

beforeEach(function () {
    if (this.currentTest) {
        let prefix = '';
        if (openGdbConsole) {
            prefix += 'run-in-terminal ';
        }
        if (isRemoteTest) {
            prefix += 'remote ';
        }
        if (!gdbAsync) {
            prefix += 'gdb-async-off ';
        }
        if (gdbNonStop) {
            prefix += 'gdb-non-stop ';
        }
        if (hardwareBreakpoint) {
            prefix += 'hw-breakpoint-on ';
        }
        if (prefix) {
            prefix = '/' + prefix.trim() + '/';
        } else {
            prefix = '/defaults/';
        }
        this.currentTest.title = prefix + this.currentTest.title;
    }
});

export function logFileName(test: Runnable): string {
    // Clean up characters that GitHub actions doesn't like in filenames
    const cleaned = test
        .fullTitle()
        .replace('>', '&gt;')
        .replace('<', '&lt;')
        .split('/')
        .map((segment) => segment.trim())
        .join('/');
    return `${process.cwd()}/test-logs/${cleaned}.log`;
}

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
    if (!isRemoteTest) {
        return 'debugAdapter.js';
    }
    return 'debugTargetAdapter.js';
}

export async function gdbVersionAtLeast(
    targetVersion: string
): Promise<boolean> {
    return (
        compareVersions(await getGdbVersion(gdbPath || 'gdb'), targetVersion) >=
        0
    );
}

export interface LineTags {
    [key: string]: number;
}

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
export function resolveLineTagLocations(
    sourceFile: string,
    tags: LineTags
): void {
    const lines = fs
        .readFileSync(sourceFile, { encoding: 'utf-8' })
        .split('\n');

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
