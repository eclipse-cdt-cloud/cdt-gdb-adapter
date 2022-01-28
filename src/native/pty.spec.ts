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
import { Readable, Writable } from 'stream';
import { Pty } from '../native/pty';
import { ForkedFile } from '../native/forked-file';

if (process.platform !== 'win32') {
    describe('pty creation', function () {
        let master: Pty;
        let slave: ForkedFile;

        afterEach(function () {
            if (slave) {
                slave.destroy();
            }
            if (master) {
                master.destroy();
            }
        });

        it(
            'should be able to open a ptmx/pts pair',
            failFast(async function (fail) {
                master = new Pty();
                slave = new ForkedFile(master.slave_name);

                let masterBuffer = '';
                let slaveBuffer = '';

                master.reader.on('error', fail);
                slave.reader.on('error', fail);

                master.reader.on(
                    'data',
                    (data) => (masterBuffer += data.toString('utf8'))
                );
                slave.reader.on(
                    'data',
                    (data) => (slaveBuffer += data.toString('utf8'))
                );

                await sendAndAwait('master2slave', master.writer, slave.reader);

                expect(masterBuffer).eq('');
                expect(slaveBuffer).eq('master2slave');

                await sendAndAwait('slave2master', slave.writer, master.reader);

                expect(masterBuffer).eq('slave2master');
                expect(slaveBuffer).eq('master2slave');
            })
        );
    });
}

/**
 * What goes in should come out. Useful to test PTYs since what we write on `master` should come out of `slave` and vice-versa.
 *
 * @param str payload
 * @param writeTo where to write into
 * @param readFrom where to wait for it to come out
 */
function sendAndAwait(
    str: string,
    writeTo: Writable,
    readFrom: Readable
): Promise<void> {
    return new Promise<void>((resolve) => {
        readFrom.once('data', () => resolve());
        writeTo.write(str);
    });
}

/**
 * Allows an async function to reject early.
 */
function failFast<T>(
    callback: (this: T, fail: (error: Error) => void) => Promise<void>
): (this: T) => Promise<void> {
    let fail!: (error: Error) => void;
    const abortPromise = new Promise<never>((_, reject) => {
        fail = reject;
    });
    return function (this: T) {
        return Promise.race([abortPromise, callback.call(this, fail)]);
    };
}
