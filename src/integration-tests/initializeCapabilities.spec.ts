/*********************************************************************
 * Copyright (c) 2026 Arm Limited and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as path from 'path';
import { DebugClient } from '@vscode/debugadapter-testsupport';

describe('initialize capabilities', function () {
    this.timeout(30000);

    describe('local gdb adapter (type=gdb)', function () {
        const adapterPath = path.join(
            __dirname,
            '../../dist',
            'debugAdapter.js'
        );
        let dc: DebugClient;

        beforeEach(async function () {
            dc = new DebugClient('node', adapterPath, 'gdb');
            await dc.start();
        });

        afterEach(async function () {
            await dc.stop().catch(() => {});
        });

        it('supportsTerminateRequest should be false', async function () {
            const response = await dc.initializeRequest({
                adapterID: 'gdb',
                linesStartAt1: true,
                columnsStartAt1: true,
                pathFormat: 'path',
            });
            expect(response.body?.supportsTerminateRequest).to.equal(false);
        });
    });

    describe('remote gdbtarget adapter (type=gdbtarget)', function () {
        const adapterPath = path.join(
            __dirname,
            '../../dist',
            'debugTargetAdapter.js'
        );
        let dc: DebugClient;

        beforeEach(async function () {
            dc = new DebugClient('node', adapterPath, 'gdbtarget');
            await dc.start();
        });

        afterEach(async function () {
            await dc.stop().catch(() => {});
        });

        it('supportsTerminateRequest should be true', async function () {
            const response = await dc.initializeRequest({
                adapterID: 'gdbtarget',
                linesStartAt1: true,
                columnsStartAt1: true,
                pathFormat: 'path',
            });
            expect(response.body?.supportsTerminateRequest).to.equal(true);
        });
    });
});
