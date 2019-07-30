/*********************************************************************
 * Copyright (c) 2019 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { expect } from 'chai';
import * as fs from 'fs';
import { Socket } from 'net';
import * as os from 'os';
import { Duplex, Readable, Writable } from 'stream';
import { Pty } from '../native/pty';

// Allow non-arrow functions: https://mochajs.org/#arrow-functions
// tslint:disable:only-arrow-functions no-console no-bitwise

if (os.platform() !== 'win32') {
    describe('pty creation', function() {

        let master: Socket;
        let slave: File;

        afterEach(function() {
            if (slave) {
                slave.destroy();
            }
            if (master) {
                master.destroy();
            }
        });


        it('should be able to open a ptmx/pts pair', async function() {
            const pty = new Pty();

            master = pty.master;
            slave = new File(fs.openSync(pty.name, 'r+'));

            function onError(error: Error) {
                console.error(error);
                throw error;
            }
            master.on('error', onError);
            slave.on('error', onError);

            let masterStream = '';
            let slaveStream = '';

            master.on('data', (data) => masterStream += data.toString('utf8'));
            slave.on('data', (data) => slaveStream += data.toString('utf8'));

            expect(masterStream).eq('');
            expect(slaveStream).eq('');

            await sendAndAwait('master2slave', master, slave);

            expect(masterStream).eq('');
            expect(slaveStream).eq('master2slave');

            await sendAndAwait('slave2master', slave, master);

            expect(masterStream).eq('slave2master');
            expect(slaveStream).eq('master2slave');
        });

    });

    /**
     * Assumes that we are the only one writing to
     * @param str
     * @param writeTo
     * @param readFrom
     */
    function sendAndAwait(str: string, writeTo: Writable, readFrom: Readable): Promise<void> {
        return new Promise<void | never>((resolve) => {
            readFrom.once('data', () => resolve());
            writeTo.write(str);
        });
    }

    class File extends Duplex {

        public static MIN_BUFFER_SIZE = 1 << 10;
        public static DEFAULT_BUFFER_SIZE = 1 << 16;

        protected destroyed = false;
        protected buffer: Buffer;

        constructor(
            public fd: number,
            bufferSize: number = File.DEFAULT_BUFFER_SIZE,
        ) {
            super();
            this.buffer = Buffer.alloc(Math.max(bufferSize, File.MIN_BUFFER_SIZE));
        }

        public _write(str: string, encoding: string, callback: (error?: Error | null) => void): void {
            fs.write(this.fd, Buffer.from(str, encoding), callback);
        }

        public _read(size: number): void {
            fs.read(this.fd, this.buffer, 0, Math.min(this.buffer.length, size), null,
                (error, bytesRead, readBuffer) => {
                    if (error) {
                        if (this.destroyed) { return; }
                        throw error;
                    }
                    this.push(readBuffer.slice(0, bytesRead));
                },
            );
        }

        public _destroy(error: Error | null, callback?: (error: Error | null) => void): void {
            this.destroyed = true;
            if (error) {
                throw error;
            }
            if (callback) {
                fs.close(this.fd, callback);
            }
        }
    }

}
