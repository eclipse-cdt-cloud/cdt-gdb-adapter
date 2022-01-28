/*********************************************************************
 * Copyright (c) 2020 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as fs from 'fs';
import { Duplex, Readable, Writable } from 'stream';

export class File {
    protected _duplex: Duplex;

    get reader(): Readable {
        return this._duplex;
    }

    get writer(): Writable {
        return this._duplex;
    }

    constructor(public fd: number) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const _this = this;
        this._duplex = new Duplex({
            read(size) {
                fs.read(
                    fd,
                    Buffer.alloc(size),
                    0,
                    size,
                    null,
                    (err, bytesRead, buffer) => {
                        if (err) {
                            console.error(fd, err.message);
                            this.push(null);
                        } else {
                            this.push(buffer.slice(0, bytesRead));
                        }
                    }
                );
            },
            write(chunk, encoding, callback) {
                const buffer = Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk, encoding);
                fs.write(fd, buffer, (err, _written, _buffer) => {
                    callback(err);
                });
            },
            destroy(err, callback) {
                fs.close(fd, callback);
                _this.fd = -1;
            },
        });
    }

    destroy() {
        this._duplex.destroy();
    }
}
