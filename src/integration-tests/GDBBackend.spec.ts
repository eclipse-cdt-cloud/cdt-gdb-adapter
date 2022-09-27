/*********************************************************************
 * Copyright (c) 2019 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import { LaunchRequestArguments } from '..';
import { GDBBackend } from '..';

describe('GDB Backend Test Suite', function () {
    let gdb: GDBBackend;

    beforeEach(async function () {
        gdb = new GDBBackend();
        const args: LaunchRequestArguments = {
            program: 'foo',
        };
        await gdb.spawn(args);
    });

    afterEach(function () {
        gdb.sendGDBExit();
    });

    it('can read a value from -gdb-show', async function () {
        const response = await gdb.sendGDBShow('width');
        expect(response.value).to.be.a('string');
        expect(Number(response.value)).to.be.not.equal(NaN);
        expect(Number(response.value)).to.be.greaterThan(0);
    });

    it('can set a value using -gdb-set', async function () {
        await gdb.sendGDBSet('width 88');
        const response = await gdb.sendGDBShow('width');
        expect(response.value).to.equal('88');
    });
});
