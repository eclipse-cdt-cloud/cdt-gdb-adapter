/*********************************************************************
 * Copyright (c) 2020 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { openSync } from 'fs';
import { Readable, Writable } from 'stream';
import { File } from './file';

/**
 * Open and read a file from a subprocess (mode `r+` only).
 *
 * This is useful when opening a ptmx/pts pair at the same time.
 * When both files are opened by the same process, closing does not correctly release
 * the read callbacks, leaving node hanging at exit.
 *
 * Instead, we open one of the two files in a subprocess in order to kill it once done,
 * which will properly release read callbacks for some reason.
 */
export class ForkedFile {
    protected _fork: ChildProcess;

    get reader(): Readable {
        if (!this._fork.stdout) {
            throw new Error('Forked process missing stdout');
        }
        return this._fork.stdout;
    }

    get writer(): Writable {
        if (!this._fork.stdin) {
            throw new Error('Forked process missing stdin');
        }
        return this._fork.stdin;
    }

    constructor(readonly path: string) {
        // To write to the file, we'll write to stdin.
        // To read from the file, we'll read from stdout.
        this._fork = spawn(
            process.execPath,
            [...process.execArgv, __filename, path],
            {
                stdio: ['pipe', 'pipe', 'inherit'],
            }
        );
    }

    destroy(): void {
        if (this._fork.exitCode === null && this._fork.signalCode === null) {
            this._fork.kill();
        }
    }
}

const [, script, path] = process.argv;
// Check if we are forked:
if (script === __filename) {
    assert(typeof path === 'string', 'argv[2] must be a string');
    const file = new File(openSync(path, 'r+'));
    process.stdin.pipe(file.writer);
    file.reader.pipe(process.stdout);
}
