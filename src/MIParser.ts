/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { GDBBackend } from "./GDBBackend";
import { Readable } from "stream";
import { logger } from "vscode-debugadapter/lib/logger";

export class MIParser {
    private lastBuff = '';
    private buff = '';
    private pos = 0;
    private end = 0;
    private commandQueue: any = {};
    private waitReady?: (value?: void | PromiseLike<void>) => void;

    constructor(private gdb: GDBBackend) {
    }

    parse(stream: Readable): Promise<void> {
        return new Promise(resolve => {
            this.waitReady = resolve;
            stream.on('data', (chunk) => {
                this.buff = this.lastBuff + chunk.toString();
                this.pos = 0;
                this.end = this.buff.indexOf('\n');
                while (this.end >= 0) {
                    this.handleLine();
                    this.pos = this.end + 1;
                    if (this.pos < this.buff.length && this.buff[this.pos] === '\n') {
                        this.pos++;
                    }
                    if (this.pos < this.buff.length) {
                        this.end = this.buff.indexOf('\n', this.pos);
                    } else {
                        this.lastBuff = this.buff.substr(this.pos);
                        break;
                    }
                }
            });
        });
    }

    queueCommand(token: number, command: (result: any) => void) {
        this.commandQueue[token] = command;
    }

    private next() {
        if (this.pos < this.end) {
            return this.buff[this.pos++];
        } else {
            return null;
        }
    }

    private back() {
        this.pos--;
    }

    private restOfLine() {
        return this.buff.substr(this.pos, this.end - this.pos);
    }

    private handleToken(firstChar: string) {
        let token = firstChar;
        let c = this.next();
        while (c && c >= '0' && c <= '9') {
            token += c;
            c = this.next();
        }
        this.back();
        return token;
    }

    private handleCString() {
        let c = this.next();
        if (!c || c !== '"') {
            return null;
        }

        let cstring = '';
        for (c = this.next(); c; c = this.next()) {
            switch (c) {
                case '"':
                    return cstring;
                case '\\':
                    c = this.next();
                    if (c) {
                        switch (c) {
                            case 'n':
                                cstring += '\n';
                                break;
                            case 't':
                                cstring += '\t';
                                break;
                            case 'r':
                                break;
                            default:
                                cstring += c;
                        }
                    } else {
                        this.back();
                    }
                    break;
                default:
                    cstring += c;
            }
        }

        return cstring;
    }

    private handleString() {
        let str = '';
        for (let c = this.next(); c; c = this.next()) {
            if (c === '=' || c === ',') {
                this.back();
                return str;
            } else {
                str += c;
            }
        }
        return str;
    }

    private handleObject() {
        let c = this.next();
        const result: any = {};
        if (c === '{') {
            c = this.next();
            while (c !== '}') {
                if (c !== ',') {
                    this.back();
                }
                const name = this.handleString();
                if (this.next() === '=') {
                    result[name] = this.handleValue();
                }
                c = this.next();
            }
        }

        if (c === '}') {
            return result;
        } else {
            return null;
        }
    }

    private handleArray() {
        let c = this.next();
        const result:any[] = [];
        if (c === '[') {
            c = this.next();
            while (c !== ']') {
                if (c !== ',') {
                    this.back();
                }
                result.push(this.handleValue());
                c = this.next();
            }
        }
        
        if (c === ']') {
            return result;
        } else {
            return null;
        }
    }

    private handleValue(): any {
        const c = this.next();
        this.back();
        switch (c) {
            case '"':
                return this.handleCString();
            case '{':
                return this.handleObject();
            case '[':
                return this.handleArray();
            default:
                // A weird array element with a name, ignore the name and return the value
                this.handleString();
                if (this.next() === '=') {
                    return this.handleValue();
                }
        }
        return null;
    }

    private handleAsyncOutput() {
        const result: any = {
            _class: this.handleString()
        };

        let c = this.next();
        while (c === ',') {
            const name = this.handleString();
            if (this.next() === '=') {
                result[name] = this.handleValue();
            }
            c = this.next();
        }

        return result;
    }

    private handleConsoleStream() {
        const msg = this.handleCString();
        if (msg) {
            this.gdb.emit('consoleStreamOutput', msg, 'stdout');
        }
    }

    private handleLogStream() {
        const msg = this.handleCString();
        if (msg) {
            logger.log(msg);
        }
    }

    private handleLine() {
        let c = this.next();
        if (!c) {
            return;
        }

        let token = '';

        if (c >= '0' && c <= '9') {
            token = this.handleToken(c);
            c = this.next();
        }

        switch (c) {
            case '^':
                logger.verbose("GDB result: " + this.restOfLine());
                const command = this.commandQueue[token];
                if (command) {
                    const result = this.handleAsyncOutput();
                    command(result);
                    delete this.commandQueue[token];
                } else {
                    logger.error("GDB response with no command: " + token);
                }
                break;
            case '~':
            case '@':
                this.handleConsoleStream();
                break;
            case '&':
                this.handleLogStream();
                break;
            case '=':
                // TODO: notify
                logger.verbose("GDB notify: " + this.restOfLine());
                break;
            case '*':
                logger.verbose("GDB async: " + this.restOfLine());
                const result = this.handleAsyncOutput();
                this.gdb.emit('async', result);
                break;
            case '(':
                if (this.waitReady) {
                    this.waitReady();
                    this.waitReady = undefined;
                }
                break;
            default:
                logger.warn("GDB: unhandled record " + c);
        }
    }
}
