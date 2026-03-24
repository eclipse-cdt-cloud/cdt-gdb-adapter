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
import { DebugProtocol } from '@vscode/debugprotocol';

import { GDBDebugSessionBase } from '../gdb/GDBDebugSessionBase';
import * as miVar from '../mi/var';

class TestableSession extends GDBDebugSessionBase {
    constructor(backendFactory: any) {
        super(backendFactory);
    }

    public async callDoEvaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments,
        alwaysAllowCliCommand: boolean
    ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this as any).doEvaluateRequest(
            response,
            args,
            alwaysAllowCliCommand
        );
    }
}

function makeEvaluateResponse(): DebugProtocol.EvaluateResponse {
    return {
        type: 'response',
        seq: 0,
        request_seq: 1,
        success: true,
        command: 'evaluate',
        body: {} as any,
    } as DebugProtocol.EvaluateResponse;
}

describe('doEvaluateRequest - MI var deletion single-owner invariant', function () {
    let session: TestableSession;
    let sandbox: sinon.SinonSandbox;

    let gdb: any;
    let varManager: {
        getVar: sinon.SinonStub;
        addVar: sinon.SinonStub;
        removeVar: sinon.SinonStub;
    };
    let backendFactory: any;

    beforeEach(function () {
        sandbox = sinon.createSandbox();

        varManager = {
            getVar: sandbox.stub(),
            addVar: sandbox.stub(),
            removeVar: sandbox.stub(),
        };

        gdb = { varManager };

        backendFactory = {
            create: sandbox.stub().returns(gdb),
            dispose: sandbox.stub(),
        };

        session = new TestableSession(backendFactory);
        (session as any).gdb = gdb;

        // Make frameId resolvable
        (session as any).frameHandles = new Map<number, any>([
            [111, { id: 'f1' }],
            [222, { id: 'f1' }],
            [333, { id: 'f1' }],
            [444, { id: 'f1' }],
        ]);

        sandbox.stub(session as any, 'canRequestProceed').returns(true);
        sandbox
            .stub(session as any, 'getFrameContext')
            .resolves([gdb, { id: 'f1' }, 0]);
        sandbox.stub(session as any, 'sendResponse').callsFake(() => {});
        sandbox.stub(session as any, 'sendErrorResponse').callsFake(() => {});

        // MI stubs
        sandbox.stub(miVar, 'sendVarCreate');
        sandbox.stub(miVar, 'sendVarUpdate');
        sandbox.stub(miVar, 'sendVarDelete');

        /*
         * Simulate the REAL contract:
         * removeVar() is the SINGLE OWNER of MI var deletion.
         *
         * This is what allows the tests to:
         *  - FAIL if doEvaluateRequest also deletes (duplicate delete)
         *  - FAIL if removeVar stops deleting
         *  - PASS only when exactly ONE delete occurs
         */
        varManager.removeVar = sandbox
            .stub()
            .callsFake(async (_frameRef, _depth, varname: string) => {
                await miVar.sendVarDelete(gdb, { varname });
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('out-of-scope: MI var must be deleted exactly once and recreated', async function () {
        varManager.getVar.returns({
            varname: 'v1',
            numchild: '0',
            type: 'int',
            value: '1',
        });

        (miVar.sendVarUpdate as sinon.SinonStub).resolves({
            changelist: [{ in_scope: 'false', name: 'v1', value: '?' }],
        });

        (miVar.sendVarCreate as sinon.SinonStub).resolves({});
        varManager.addVar.returns({
            varname: 'v2',
            numchild: '0',
            type: 'int',
            value: '2',
        });

        const response = makeEvaluateResponse();
        const args: DebugProtocol.EvaluateArguments = {
            expression: 'x',
            frameId: 111,
            context: 'watch',
        };

        await session.callDoEvaluateRequest(response, args, false);

        expect(
            (miVar.sendVarDelete as sinon.SinonStub).callCount,
            'MI var delete must occur exactly once'
        ).to.equal(1);
    });

    it('out-of-scope (another frame): MI var must be deleted exactly once and recreated', async function () {
        varManager.getVar.returns({
            varname: 'v1',
            numchild: '0',
            type: 'int',
            value: '1',
        });

        (miVar.sendVarUpdate as sinon.SinonStub).resolves({
            changelist: [{ in_scope: 'false', name: 'v1', value: '?' }],
        });

        (miVar.sendVarCreate as sinon.SinonStub).resolves({});
        varManager.addVar.returns({
            varname: 'v3',
            numchild: '0',
            type: 'int',
            value: '3',
        });

        const response = makeEvaluateResponse();
        const args: DebugProtocol.EvaluateArguments = {
            expression: 'x',
            frameId: 222,
            context: 'watch',
        };

        await session.callDoEvaluateRequest(response, args, false);

        expect(
            (miVar.sendVarDelete as sinon.SinonStub).callCount,
            'MI var delete must occur exactly once'
        ).to.equal(1);
    });

    it('in-scope: value updated without MI var deletion', async function () {
        varManager.getVar.returns({
            varname: 'v1',
            numchild: '0',
            type: 'int',
            value: '10',
        });

        (miVar.sendVarUpdate as sinon.SinonStub).resolves({
            changelist: [{ in_scope: 'true', name: 'v1', value: '99' }],
        });

        const response = makeEvaluateResponse();
        const args: DebugProtocol.EvaluateArguments = {
            expression: 'x',
            frameId: 333,
            context: 'watch',
        };

        await session.callDoEvaluateRequest(response, args, false);

        expect(
            (miVar.sendVarDelete as sinon.SinonStub).callCount,
            'MI var delete must not occur for in-scope updates'
        ).to.equal(0);
    });

    it('no varobj: create new variable without MI var deletion', async function () {
        varManager.getVar.returns(undefined);

        (miVar.sendVarCreate as sinon.SinonStub).resolves({});
        varManager.addVar.returns({
            varname: 'v-new',
            numchild: '0',
            type: 'int',
            value: '111',
        });

        const response = makeEvaluateResponse();
        const args: DebugProtocol.EvaluateArguments = {
            expression: 'y',
            frameId: 444,
            context: 'watch',
        };

        await session.callDoEvaluateRequest(response, args, false);

        expect(
            (miVar.sendVarDelete as sinon.SinonStub).callCount,
            'MI var delete must not occur when creating new variables'
        ).to.equal(0);
    });
});
