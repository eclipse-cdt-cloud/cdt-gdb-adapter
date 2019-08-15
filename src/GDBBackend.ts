/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { execFile, spawn, ChildProcess } from 'child_process';
import * as events from 'events';
import { Writable } from 'stream';
import { logger } from 'vscode-debugadapter/lib/logger';
import { AttachRequestArguments, LaunchRequestArguments } from './GDBDebugSession';
import { MIResponse } from './mi';
import { MIParser } from './MIParser';

export interface MIExecNextRequest {
    reverse?: boolean;
}

export interface MIExecNextResponse extends MIResponse {
}

export interface MIGDBShowResponse extends MIResponse {
    value?: string;
}

export declare interface GDBBackend {
    on(event: 'consoleStreamOutput', listener: (output: string, category: string) => void): this;
    on(event: 'execAsync' | 'notifyAsync' | 'statusAsync', listener: (asyncClass: string, data: any) => void): this;

    emit(event: 'consoleStreamOutput', output: string, category: string): boolean;
    emit(event: 'execAsync' | 'notifyAsync' | 'statusAsync', asyncClass: string, data: any): boolean;
}

export class GDBBackend extends events.EventEmitter {
    protected parser = new MIParser(this);
    protected out?: Writable;
    protected token = 0;
    protected proc?: ChildProcess;

    public spawn(requestArgs: LaunchRequestArguments | AttachRequestArguments) {
        const gdb = requestArgs.gdb ? requestArgs.gdb : 'gdb';
        let args = ['--interpreter=mi2'];
        if (requestArgs.gdbArguments) {
            args = args.concat(requestArgs.gdbArguments);
        }
        this.proc = spawn(gdb, args);
        this.out = this.proc.stdin;
        return this.parser.parse(this.proc.stdout);
    }

    public async spawnInClientTerminal(requestArgs: LaunchRequestArguments | AttachRequestArguments,
        cb: (args: string[]) => Promise<void>) {
        const gdb = requestArgs.gdb ? requestArgs.gdb : 'gdb';
        // Use dynamic import to remove need for natively building this adapter
        // Useful when 'spawnInClientTerminal' isn't needed, but adapter is distributed on multiple OS's
        const { Pty } = await import('./native/pty');
        const pty = new Pty();
        let args = [gdb, '-ex', `new-ui mi2 ${pty.name}`];
        if (requestArgs.gdbArguments) {
            args = args.concat(requestArgs.gdbArguments);
        }
        await cb(args);
        this.out = pty.master;
        return this.parser.parse(pty.master);
    }

    public pause() {
        if (this.proc) {
            this.proc.kill('SIGINT');
            return true;
        } else {
            return false;
        }
    }

    public async supportsNewUi(gdbPath?: string): Promise<boolean> {
        const gdb = gdbPath || 'gdb';
        return new Promise<boolean>((resolve, reject) => {
            execFile(gdb, ['-nx', '-batch', '-ex', 'new-ui'], (error, stdout, stderr) => {
                // - gdb > 8.2 outputs 'Usage: new-ui INTERPRETER TTY'
                // - gdb 7.12 to 8.2 outputs 'usage: new-ui <interpreter> <tty>'
                // - gdb < 7.12 doesn't support the new-ui command, and outputs
                //   'Undefined command: "new-ui".  Try "help".'
                resolve(/^usage: new-ui/im.test(stderr));
            });
        });
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
                            reject(new Error(`Unknown response ${resultClass}: ${JSON.stringify(resultData)}`));
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
    public standardEscape(arg: string): string {
        let result = '';
        for (const char of arg) {
            if (char === '\\' || char === '"') {
                result += '\\';
            }
            result += char;
        }
        if (/\s/.test(arg)) {
            result = `"${result}"`;
        }
        return result;
    }

    public sendFileExecAndSymbols(program: string) {
        return this.sendCommand(`-file-exec-and-symbols ${this.standardEscape(program)}`);
    }

    public sendFileSymbolFile(symbols: string) {
        return this.sendCommand(`-file-symbol-file ${this.standardEscape(symbols)}`);
    }

    public sendAddSymbolFile(symbols: string, offset: string) {
        return this.sendCommand(`add-symbol-file ${this.standardEscape(symbols)} ${offset}`);
    }

    public sendLoad(imageFileName: string, imageOffset: string | undefined) {
        return this.sendCommand(`load ${this.standardEscape(imageFileName)} ${imageOffset || ''}`);
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
