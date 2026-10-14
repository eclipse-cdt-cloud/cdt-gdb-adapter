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
import { logger } from '@vscode/debugadapter/lib/logger';

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

describe('VarManager.prepareFrame - PC-specific variable cache', function () {
    let sandbox: sinon.SinonSandbox;
    let varManager: VarManager;
    let gdb: any;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        gdb = {};
        varManager = new VarManager(gdb);
        sandbox.stub(miVar, 'sendVarDelete').resolves(undefined);
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('deletes stale root varobjs on a PC change and drops their cached children', async function () {
        const frameRef = { threadId: 1, frameId: 0, pc: '0x100' };
        const nextFrameRef = { ...frameRef, pc: '0x104' };

        await varManager.prepareFrame(frameRef, 2);
        const root = varManager.addVar(frameRef, 2, 'local', true, false, {
            name: 'root',
            numchild: '1',
            value: '{...}',
            type: 'Thing',
            _class: 'done',
        });
        const child = varManager.addVar(
            frameRef,
            2,
            'local.member',
            true,
            true,
            {
                name: 'child',
                numchild: '0',
                value: '1',
                type: 'int',
                _class: 'done',
            }
        );
        root.children.push(child);

        await varManager.prepareFrame(frameRef, 2);
        sinon.assert.notCalled(miVar.sendVarDelete as sinon.SinonStub);
        await varManager.prepareFrame(nextFrameRef, 2);

        sinon.assert.calledOnceWithExactly(
            miVar.sendVarDelete as sinon.SinonStub,
            gdb,
            { varname: 'root' }
        );
        expect(varManager.getVars(frameRef, 2)).to.be.undefined;
        expect(varManager.getVars(nextFrameRef, 2)).to.be.undefined;
    });

    it('keeps recursive frame contexts separate when their PCs are identical', async function () {
        const outer = { threadId: 1, frameId: 0, pc: '0x200' };
        const inner = { threadId: 1, frameId: 1, pc: '0x200' };

        await varManager.prepareFrame(outer, 4);
        await varManager.prepareFrame(inner, 4);
        varManager.addVar(outer, 4, 'outer', true, false, {
            name: 'outer-var',
            numchild: '0',
            value: '1',
            type: 'int',
            _class: 'done',
        });
        varManager.addVar(inner, 4, 'inner', true, false, {
            name: 'inner-var',
            numchild: '0',
            value: '2',
            type: 'int',
            _class: 'done',
        });

        await varManager.prepareFrame({ ...outer, pc: '0x204' }, 4);

        sinon.assert.calledOnceWithExactly(
            miVar.sendVarDelete as sinon.SinonStub,
            gdb,
            { varname: 'outer-var' }
        );
        expect(varManager.getVars(inner, 4)).to.have.length(1);
        expect(varManager.getVars(inner, 4)?.[0].varname).to.equal('inner-var');
    });

    it('logs stale varobj deletion failures without failing frame preparation', async function () {
        const frameRef = { threadId: 1, frameId: 0, pc: '0x300' };
        const nextFrameRef = { ...frameRef, pc: '0x304' };
        const deleteStub = miVar.sendVarDelete as sinon.SinonStub;
        const verboseStub = sandbox.stub(logger, 'verbose');

        await varManager.prepareFrame(frameRef, 2);
        varManager.addVar(frameRef, 2, 'local', true, false, {
            name: 'stale1',
            numchild: '0',
            value: '1',
            type: 'int',
            _class: 'done',
        });
        varManager.addVar(frameRef, 2, 'local2', true, false, {
            name: 'stale2',
            numchild: '0',
            value: '1',
            type: 'int',
            _class: 'done',
        });
        deleteStub.onCall(0).rejects(new Error('Variable object not found'));
        deleteStub
            .onCall(1)
            .rejects(new Error('Another variable object not found'));

        await varManager.prepareFrame(nextFrameRef, 2);

        sinon.assert.calledTwice(deleteStub);
        expect(deleteStub.getCalls().map((call) => call.args[1])).to.deep.equal(
            [{ varname: 'stale1' }, { varname: 'stale2' }]
        );
        expect(
            verboseStub.getCalls().map((call) => call.args[0])
        ).to.deep.equal([
            'Failed to delete stale varobj stale1: Error: Variable object not found',
            'Failed to delete stale varobj stale2: Error: Another variable object not found',
        ]);
        expect(varManager.getVars(frameRef, 2)).to.be.undefined;
        expect(varManager.getVars(nextFrameRef, 2)).to.be.undefined;
    });
});
