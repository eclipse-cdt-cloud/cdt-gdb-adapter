/*********************************************************************
 * Copyright (c) 2025 Arm Ltd. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { ChildProcess } from 'child_process';
import { IStdioProcess } from '../../types/gdb';
import { Writable, Readable } from 'stream';

// Adapter class from ChildProcess to IStdioProcess for desktop
// implementation.
// Newer node versions changed some function interface types. In
// particular pid return type to "number | undefined". This is
// incompatible with getter interface function in IStdioProcess.
// And hard to overcome by simple type changes. Hence this adapter.
export class StdioProcessAdapter implements IStdioProcess {
    constructor(private proc: ChildProcess) {}

    get stdin(): Writable | null {
        return this.proc.stdin;
    }

    get stdout(): Readable | null {
        return this.proc.stdout;
    }

    get stderr(): Readable | null {
        return this.proc.stderr;
    }

    get pid(): number | null {
        return this.proc.pid ?? null;
    }

    get exitCode(): number | null {
        return this.proc.exitCode;
    }

    public kill(signal?: NodeJS.Signals): void {
        this.proc.kill(signal);
    }

    public on(
        event: 'exit',
        listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): this;
    public on(event: 'error', listener: (err: Error) => void): this;
    public on(event: string, listener: (...args: any[]) => void): this {
        this.proc.on(event, listener);
        return this;
    }
}
