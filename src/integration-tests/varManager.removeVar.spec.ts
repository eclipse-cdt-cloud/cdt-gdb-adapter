/*********************************************************************
 * Copyright (c) 2026 Arm Limited and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';

import * as miVar from '../mi/var';
import { VarManager } from '../varManager';

describe('VarManager.removeVar - MI deletion contract', function () {
    let sandbox: sinon.SinonSandbox;
    let varManager: VarManager;
    let gdb: any;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        gdb = {};

        // Create real VarManager instance
        varManager = new VarManager(gdb);

        // Stub MI delete
        sandbox.stub(miVar, 'sendVarDelete').resolves(undefined);
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('deletes MI var exactly once when removing a variable', async function () {
        const frameRef = {
            threadId: 1,
            frameId: 0,
        };
        const depth = 0;

        // Minimal VarObjType
        const varObj = {
            varname: 'v1',
            children: [],
        } as any;

        // Simulate internal state
        const key = (varManager as any).getKey(frameRef, depth);
        (varManager as any).variableMap.set(key, [varObj]);

        await varManager.removeVar(frameRef, depth, 'v1');

        // Core invariant
        expect(
            (miVar.sendVarDelete as sinon.SinonStub).callCount,
            'MI var must be deleted exactly once'
        ).to.equal(1);

        expect(
            (miVar.sendVarDelete as sinon.SinonStub).firstCall.args[1]
        ).to.deep.equal({ varname: 'v1' });
    });

    it('recursively deletes children MI vars when removing a parent', async function () {
        const frameRef = {
            threadId: 1,
            frameId: 0,
        };
        const depth = 0;

        const child1 = { varname: 'c1', children: [] } as any;
        const child2 = { varname: 'c2', children: [] } as any;

        const parent = {
            varname: 'p',
            children: [child1, child2],
        } as any;

        const key = (varManager as any).getKey(frameRef, depth);
        (varManager as any).variableMap.set(key, [parent, child1, child2]);

        await varManager.removeVar(frameRef, depth, 'p');

        // Parent + 2 children
        expect(
            (miVar.sendVarDelete as sinon.SinonStub).callCount,
            'MI var delete must occur for parent and all children'
        ).to.equal(3);

        sinon.assert.calledWith(miVar.sendVarDelete as sinon.SinonStub, gdb, {
            varname: 'p',
        });
        sinon.assert.calledWith(miVar.sendVarDelete as sinon.SinonStub, gdb, {
            varname: 'c1',
        });
        sinon.assert.calledWith(miVar.sendVarDelete as sinon.SinonStub, gdb, {
            varname: 'c2',
        });
    });

    it('does nothing if var name does not exist', async function () {
        const frameRef = {
            threadId: 1,
            frameId: 0,
        };
        const depth = 0;

        const key = (varManager as any).getKey(frameRef, depth);
        (varManager as any).variableMap.set(key, []);

        await varManager.removeVar(frameRef, depth, 'ghost');

        expect(
            (miVar.sendVarDelete as sinon.SinonStub).callCount,
            'MI var delete must not occur for non-existing var'
        ).to.equal(0);
    });
});
