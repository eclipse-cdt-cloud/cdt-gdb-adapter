/*********************************************************************
 * Copyright (c) 2025 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as sinon from 'sinon';
import { expect } from 'chai';
import * as sendResponseWithTimeoutModule from '../util/sendResponseWithTimeout';
import { GDBDebugSessionBase } from '../gdb/GDBDebugSessionBase';
import { DebugProtocol } from '@vscode/debugprotocol';
import { IGDBBackendFactory } from '../types/gdb';
import { OutputEvent } from '@vscode/debugadapter';
import * as mi from '../mi/exec';
import {
    AttachRequestArguments,
    LaunchRequestArguments,
} from '../types/session';

// Test class that extends GDBDebugSessionBase to access protected methods
class TestGDBSession extends GDBDebugSessionBase {
    public gdb: any;
    public sendErrorResponseStub: sinon.SinonStub;
    public sendResponseStub: sinon.SinonStub;
    public sendEventStub: sinon.SinonStub;

    constructor(sandbox: sinon.SinonSandbox) {
        const mockFactory: IGDBBackendFactory = {} as any;
        super(mockFactory);
        this.gdb = {};

        this.sendResponseStub = sandbox.stub();
        this.sendResponse = this.sendResponseStub;

        this.sendErrorResponseStub = sandbox.stub();
        this.sendErrorResponse = this.sendErrorResponseStub;

        this.sendEventStub = sandbox.stub();
        this.sendEvent = this.sendEventStub;
    }

    // Make protected methods public for testing
    public async testStepInRequest(
        response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments
    ) {
        return this.stepInRequest(response, args);
    }

    public async testStepOutRequest(
        response: DebugProtocol.StepOutResponse,
        args: DebugProtocol.StepOutArguments
    ) {
        return this.stepOutRequest(response, args);
    }

    public async testNextRequest(
        response: DebugProtocol.NextResponse,
        args: DebugProtocol.NextArguments
    ) {
        return this.nextRequest(response, args);
    }

    public setSteppingResponseTimeout(timeout?: number) {
        this.initializeSessionArguments({
            steppingResponseTimeout: timeout,
        } as LaunchRequestArguments | AttachRequestArguments);
    }
}

describe('Step Functions Unit Tests', function () {
    let sandbox: sinon.SinonSandbox;
    let session: TestGDBSession;
    let sendExecStepStub: sinon.SinonStub;
    let sendExecStepInstructionStub: sinon.SinonStub;
    let sendExecFinishStub: sinon.SinonStub;
    let sendExecNextStub: sinon.SinonStub;
    let sendExecNextInstructionStub: sinon.SinonStub;
    let sendResponseWithTimeoutSpy: sinon.SinonSpy;

    const testError = new Error('Test error');

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        session = new TestGDBSession(sandbox);

        sendResponseWithTimeoutSpy = sandbox.spy(
            sendResponseWithTimeoutModule,
            'sendResponseWithTimeout'
        );
        sendExecStepStub = sandbox.stub(mi, 'sendExecStep').resolves();
        sendExecStepInstructionStub = sandbox
            .stub(mi, 'sendExecStepInstruction')
            .resolves();
        sendExecFinishStub = sandbox.stub(mi, 'sendExecFinish').resolves();
        sendExecNextStub = sandbox.stub(mi, 'sendExecNext').resolves();
        sendExecNextInstructionStub = sandbox
            .stub(mi, 'sendExecNextInstruction')
            .resolves();
    });

    afterEach(function () {
        sandbox.restore();
    });

    const verifySendResponseWithTimeoutSpyCall = (expectedTimeout = 100) => {
        expect(sendResponseWithTimeoutSpy.calledOnce).to.be.true;
        const callArgs = sendResponseWithTimeoutSpy.getCall(0).args[0];
        expect(callArgs).to.have.property('execute');
        expect(callArgs).to.have.property('onResponse');
        expect(callArgs).to.have.property('onError');
        expect(callArgs).to.have.property('timeout', expectedTimeout);
    };

    const verifyErrorHandling = (
        response: DebugProtocol.Response,
        request: string
    ) => {
        expect(
            session.sendErrorResponseStub.calledOnceWith(
                response,
                1,
                testError.message
            )
        ).to.be.true;

        expect(session.sendEventStub.calledOnce).to.be.true;
        const event = session.sendEventStub.firstCall.args[0];
        expect(event).to.be.instanceOf(OutputEvent);
        expect(event.body.output).to.contain(
            `Error occurred during the ${request}`
        );
        expect(event.body.output).to.contain(testError.message);
        expect(event.body.category).to.equal('console');
    };

    it('stepInRequest should call sendResponseWithTimeout with correct parameters', async function () {
        const response = {} as DebugProtocol.StepInResponse;
        const args = {
            threadId: 1,
            granularity: 'statement',
        } as DebugProtocol.StepInArguments;

        await session.testStepInRequest(response, args);

        verifySendResponseWithTimeoutSpyCall();

        expect(sendExecStepStub.calledOnceWith(session.gdb, 1)).to.be.true;
        expect(session.sendResponseStub.calledOnceWith(response)).to.be.true;
    });

    it('stepInRequest with instruction granularity should call sendExecStepInstruction', async function () {
        const response = {} as DebugProtocol.StepInResponse;
        const args = {
            threadId: 1,
            granularity: 'instruction',
        } as DebugProtocol.StepInArguments;

        await session.testStepInRequest(response, args);

        verifySendResponseWithTimeoutSpyCall();
        expect(sendExecStepInstructionStub.calledOnceWith(session.gdb, 1)).to.be
            .true;
        expect(session.sendResponseStub.calledOnceWith(response)).to.be.true;
    });

    it('stepInRequest should handle errors through sendResponseWithTimeout', async function () {
        const response = {} as DebugProtocol.StepInResponse;
        const args = {
            threadId: 1,
            granularity: 'statement',
        } as DebugProtocol.StepInArguments;

        sendExecStepStub.rejects(testError);

        await session.testStepInRequest(response, args);

        verifySendResponseWithTimeoutSpyCall();

        verifyErrorHandling(response, 'stepInRequest');
    });

    it('stepOutRequest should call sendResponseWithTimeout with correct parameters', async function () {
        const response = {} as DebugProtocol.StepOutResponse;
        const args = { threadId: 1 } as DebugProtocol.StepOutArguments;

        await session.testStepOutRequest(response, args);

        verifySendResponseWithTimeoutSpyCall();
        expect(
            sendExecFinishStub.calledOnceWith(session.gdb, {
                threadId: 1,
                frameId: 0,
            })
        ).to.be.true;
        expect(session.sendResponseStub.calledOnceWith(response)).to.be.true;
    });

    it('stepOutRequest should handle errors through sendResponseWithTimeout', async function () {
        const response = {} as DebugProtocol.StepOutResponse;
        const args = { threadId: 1 } as DebugProtocol.StepOutArguments;
        const testError = new Error('Test error');
        sendExecFinishStub.rejects(testError);

        await session.testStepOutRequest(response, args);

        verifySendResponseWithTimeoutSpyCall();

        verifyErrorHandling(response, 'stepOutRequest');
    });

    it('nextRequest should call sendResponseWithTimeout with correct parameters', async function () {
        const response = {} as DebugProtocol.NextResponse;
        const args = {
            threadId: 1,
            granularity: 'statement',
        } as DebugProtocol.NextArguments;

        await session.testNextRequest(response, args);

        verifySendResponseWithTimeoutSpyCall();
        expect(sendExecNextStub.calledOnceWith(session.gdb, 1)).to.be.true;
        expect(session.sendResponseStub.calledOnceWith(response)).to.be.true;
    });

    it('nextRequest with instruction granularity should call sendExecNextInstruction', async function () {
        const response = {} as DebugProtocol.NextResponse;
        const args = {
            threadId: 1,
            granularity: 'instruction',
        } as DebugProtocol.NextArguments;

        await session.testNextRequest(response, args);

        verifySendResponseWithTimeoutSpyCall();
        expect(sendExecNextInstructionStub.calledOnceWith(session.gdb, 1)).to.be
            .true;
        expect(session.sendResponseStub.calledOnceWith(response)).to.be.true;
    });

    it('nextRequest should handle errors through sendResponseWithTimeout', async function () {
        const response = {} as DebugProtocol.NextResponse;
        const args = {
            threadId: 1,
            granularity: 'statement',
        } as DebugProtocol.NextArguments;
        const testError = new Error('Test error');
        sendExecNextStub.rejects(testError);

        await session.testNextRequest(response, args);

        verifySendResponseWithTimeoutSpyCall();

        verifyErrorHandling(response, 'nextRequest');
    });

    it('should use custom steppingResponseTimeout for stepInRequest', async function () {
        const customTimeout = 5000;
        session.setSteppingResponseTimeout(customTimeout);

        const response = {} as DebugProtocol.StepInResponse;
        const args = {
            threadId: 1,
            granularity: 'statement',
        } as DebugProtocol.StepInArguments;

        await session.testStepInRequest(response, args);

        verifySendResponseWithTimeoutSpyCall(customTimeout);
    });

    it('should use custom steppingResponseTimeout for stepOutRequest', async function () {
        const customTimeout = 3000;
        session.setSteppingResponseTimeout(customTimeout);

        const response = {} as DebugProtocol.StepOutResponse;
        const args = { threadId: 1 } as DebugProtocol.StepOutArguments;

        await session.testStepOutRequest(response, args);

        verifySendResponseWithTimeoutSpyCall(customTimeout);
    });

    it('should use custom steppingResponseTimeout for nextRequest', async function () {
        const customTimeout = 8000;
        session.setSteppingResponseTimeout(customTimeout);

        const response = {} as DebugProtocol.NextResponse;
        const args = {
            threadId: 1,
            granularity: 'statement',
        } as DebugProtocol.NextArguments;

        await session.testNextRequest(response, args);

        verifySendResponseWithTimeoutSpyCall(customTimeout);
    });

    it('should default to 100ms timeout when steppingResponseTimeout is undefined', async function () {
        session.setSteppingResponseTimeout(undefined);

        const response = {} as DebugProtocol.StepInResponse;
        const args = {
            threadId: 1,
            granularity: 'statement',
        } as DebugProtocol.StepInArguments;

        await session.testStepInRequest(response, args);

        verifySendResponseWithTimeoutSpyCall(100);
    });

    it('should handle zero timeout value', async function () {
        session.setSteppingResponseTimeout(0);

        const response = {} as DebugProtocol.NextResponse;
        const args = {
            threadId: 1,
            granularity: 'instruction',
        } as DebugProtocol.NextArguments;

        await session.testNextRequest(response, args);

        verifySendResponseWithTimeoutSpyCall(0);
    });
});
