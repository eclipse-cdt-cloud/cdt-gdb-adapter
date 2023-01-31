/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { spawn, ChildProcess } from 'child_process';
import * as events from 'events';
import { Writable } from 'stream';
import { logger } from '@vscode/debugadapter/lib/logger';
import {
    AttachRequestArguments,
    LaunchRequestArguments,
} from './GDBDebugSession';
import * as mi from './mi';
import { MIResponse } from './mi';
import { MIParser } from './MIParser';
import { VarManager } from './varManager';
import { compareVersions, getGdbVersion } from './util';

export interface MIExecNextRequest {
    reverse?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MIExecNextResponse extends MIResponse {}

export interface MIGDBShowResponse extends MIResponse {
    value?: string;
}

export declare interface GDBBackend {
    on(
        event: 'consoleStreamOutput',
        listener: (output: string, category: string) => void
    ): this;
    on(
        event: 'execAsync' | 'notifyAsync' | 'statusAsync',
        listener: (asyncClass: string, data: any) => void
    ): this;

    emit(
        event: 'consoleStreamOutput',
        output: string,
        category: string
    ): boolean;
    emit(
        event: 'execAsync' | 'notifyAsync' | 'statusAsync',
        asyncClass: string,
        data: any
    ): boolean;
}

export class GDBBackend extends events.EventEmitter {
    protected parser = new MIParser(this);
    protected varMgr = new VarManager(this);
    protected out?: Writable;
    protected token = 0;
    protected proc?: ChildProcess;
    private gdbVersion?: string;
    protected gdbAsync = false;
    protected gdbNonStop = false;
    protected hardwareBreakpoint = false;

    get varManager(): VarManager {
        return this.varMgr;
    }

    public async spawn(
        requestArgs: LaunchRequestArguments | AttachRequestArguments
    ) {
        const gdbPath = requestArgs.gdb || 'gdb';
        this.gdbVersion = await getGdbVersion(gdbPath);
        let args = ['--interpreter=mi2'];
        if (requestArgs.gdbArguments) {
            args = args.concat(requestArgs.gdbArguments);
        }
        this.proc = spawn(gdbPath, args);
        if (this.proc.stdin == null || this.proc.stdout == null) {
            throw new Error('Spawned GDB does not have stdout or stdin');
        }
        this.out = this.proc.stdin;
        this.hardwareBreakpoint = requestArgs.hardwareBreakpoint ? true : false;
        await this.parser.parse(this.proc.stdout);
        if (this.proc.stderr) {
            this.proc.stderr.on('data', (chunk) => {
                const newChunk = chunk.toString();
                this.emit('consoleStreamOutput', newChunk, 'stderr');
            });
        }
        await this.setNonStopMode(requestArgs.gdbNonStop);
        await this.setAsyncMode(requestArgs.gdbAsync);
    }

    public async spawnInClientTerminal(
        requestArgs: LaunchRequestArguments | AttachRequestArguments,
        cb: (args: string[]) => Promise<void>
    ) {
        const gdbPath = requestArgs.gdb || 'gdb';
        this.gdbVersion = await getGdbVersion(gdbPath);
        // Use dynamic import to remove need for natively building this adapter
        // Useful when 'spawnInClientTerminal' isn't needed, but adapter is distributed on multiple OS's
        const { Pty } = await import('./native/pty');
        const pty = new Pty();
        let args = [gdbPath, '-ex', `new-ui mi2 ${pty.slave_name}`];
        if (requestArgs.gdbArguments) {
            args = args.concat(requestArgs.gdbArguments);
        }
        await cb(args);
        this.out = pty.writer;
        await this.parser.parse(pty.reader);
        await this.setNonStopMode(requestArgs.gdbNonStop);
        await this.setAsyncMode(requestArgs.gdbAsync);
    }

    public async setAsyncMode(isSet?: boolean) {
        const command = this.gdbVersionAtLeast('7.8')
            ? 'mi-async'
            : 'target-async';
        if (isSet === undefined) {
            isSet = true;
        }
        if (this.gdbNonStop) {
            isSet = true;
        }
        const onoff = isSet ? 'on' : 'off';
        try {
            await this.sendCommand(`-gdb-set ${command} ${onoff}`);
            this.gdbAsync = isSet;
        } catch {
            // no async support - normally this only happens on Windows
            // when doing host debugging. We explicitly set this
            // to off here so that we get the error propogate if the -gdb-set
            // failed and to make it easier to read the log
            await this.sendCommand(`-gdb-set ${command} off`);
            this.gdbAsync = false;
        }
    }

    public async setNonStopMode(isSet?: boolean) {
        if (isSet === undefined) {
            isSet = false;
        }
        if (isSet) {
            await this.sendCommand('-gdb-set pagination off');
        }
        const onoff = isSet ? 'on' : 'off';
        try {
            await this.sendCommand(`-gdb-set non-stop ${onoff}`);
            this.gdbNonStop = isSet;
        } catch {
            // no non-stop support - normally this only happens on Windows.
            // We explicitly set this to off here so that we get the error
            // propogate if the -gdb-set failed and to make it easier to
            // read the log
            await this.sendCommand(`-gdb-set non-stop off`);
            this.gdbNonStop = false;
        }
    }

    public isNonStopMode() {
        return this.gdbNonStop;
    }

    public isUseHWBreakpoint() {
        return this.hardwareBreakpoint;
    }

    public pause(threadId?: number) {
        if (this.gdbAsync) {
            mi.sendExecInterrupt(this, threadId);
        } else {
            if (!this.proc) {
                throw new Error('GDB is not running, nothing to interrupt');
            }
            logger.verbose(`GDB signal: SIGINT to pid ${this.proc.pid}`);
            this.proc.kill('SIGINT');
        }
    }

    public async supportsNewUi(gdbPath?: string): Promise<boolean> {
        this.gdbVersion = await getGdbVersion(gdbPath || 'gdb');
        return this.gdbVersionAtLeast('7.12');
    }

    public gdbVersionAtLeast(targetVersion: string): boolean {
        if (!this.gdbVersion) {
            throw new Error('gdbVersion needs to be set first');
        }
        return compareVersions(this.gdbVersion, targetVersion) >= 0;
    }

    public async sendCommands(commands?: string[]) {
        if (commands) {
            for (const command of commands) {
                await this.sendCommand(command);
            }
        }
    }

    public sendCommand<T>(command: string): Promise<T> {
        const token = this.nextToken();
        logger.verbose(`GDB command: ${token} ${command}`);
        return new Promise<T>((resolve, reject) => {
            if (this.out) {
                this.parser.queueCommand(token, (resultClass, resultData) => {
                    switch (resultClass) {
                        case 'done':
                        case 'running':
                        case 'connected':
                        case 'exit':
                            resolve(resultData);
                            break;
                        case 'error':
                            reject(new Error(resultData.msg));
                            break;
                        default:
                            reject(
                                new Error(
                                    `Unknown response ${resultClass}: ${JSON.stringify(
                                        resultData
                                    )}`
                                )
                            );
                    }
                });
                this.out.write(`${token}${command}\n`);
            } else {
                reject(new Error('gdb is not running.'));
            }
        });
    }

    public sendEnablePrettyPrint() {
        return this.sendCommand('-enable-pretty-printing');
    }

    // Rewrite the argument escaping whitespace, quotes and backslash
    public standardEscape(arg: string, needQuotes = true): string {
        let result = '';
        for (const char of arg) {
            if (char === '\\' || char === '"') {
                result += '\\';
            }
            if (char == ' ') {
                needQuotes = true;
            }
            result += char;
        }
        if (needQuotes) {
            result = `"${result}"`;
        }
        return result;
    }

    public sendFileExecAndSymbols(program: string) {
        return this.sendCommand(
            `-file-exec-and-symbols ${this.standardEscape(program)}`
        );
    }

    public sendFileSymbolFile(symbols: string) {
        return this.sendCommand(
            `-file-symbol-file ${this.standardEscape(symbols)}`
        );
    }

    public sendAddSymbolFile(symbols: string, offset: string) {
        return this.sendCommand(
            `add-symbol-file ${this.standardEscape(symbols)} ${offset}`
        );
    }

    public sendLoad(imageFileName: string, imageOffset: string | undefined) {
        return this.sendCommand(
            `load ${this.standardEscape(imageFileName)} ${imageOffset || ''}`
        );
    }

    public sendGDBSet(params: string) {
        return this.sendCommand(`-gdb-set ${params}`);
    }

    public sendGDBShow(params: string): Promise<MIGDBShowResponse> {
        return this.sendCommand(`-gdb-show ${params}`);
    }

    public sendGDBExit() {
        return this.sendCommand('-gdb-exit');
    }

    protected nextToken() {
        return this.token++;
    }
}
