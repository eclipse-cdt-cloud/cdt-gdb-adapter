/*********************************************************************
 * Copyright (c) 2026 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as sinon from 'sinon';
import { DebugProtocol } from '@vscode/debugprotocol';
import { GDBDebugSessionBase } from '../gdb/GDBDebugSessionBase';
import { IGDBBackendFactory } from '../types/gdb';

/**
 * Minimal subclass that only exists to make the protected breakpoint wrapper
 * handlers callable from test code. The `do*` implementations are replaced
 * per-test via sinon stubs so we can observe how the wrapper-level mutex
 * serializes them without coupling the test to a fixed class hierarchy.
 */
class TestSession extends GDBDebugSessionBase {
    constructor() {
        super({} as IGDBBackendFactory);
    }

    public callSetBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ) {
        return this.setBreakPointsRequest(response, args);
    }

    public callSetInstructionBreakpointsRequest(
        response: DebugProtocol.SetInstructionBreakpointsResponse,
        args: DebugProtocol.SetInstructionBreakpointsArguments
    ) {
        return this.setInstructionBreakpointsRequest(response, args);
    }
}

const emptyResponse = <T>() => ({ body: {} as never }) as T;

describe('breakpoint handler serialization', function () {
    let sandbox: sinon.SinonSandbox;
    let session: TestSession;
    let inFlight: number;
    let maxConcurrent: number;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        session = new TestSession();
        inFlight = 0;
        maxConcurrent = 0;

        const simulateWork = async () => {
            inFlight++;
            maxConcurrent = Math.max(maxConcurrent, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 20));
            inFlight--;
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = session as any;
        sandbox.stub(s, 'doSetBreakPointsRequest').callsFake(simulateWork);
        sandbox
            .stub(s, 'doSetFunctionBreakPointsRequest')
            .callsFake(simulateWork);
        sandbox.stub(s, 'doSetDataBreakpointsRequest').callsFake(simulateWork);
        sandbox
            .stub(s, 'doSetInstructionBreakpointsRequest')
            .callsFake(simulateWork);
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('serializes two concurrent setBreakPointsRequest calls', async function () {
        await Promise.all([
            session.callSetBreakPointsRequest(
                emptyResponse<DebugProtocol.SetBreakpointsResponse>(),
                {
                    source: { path: 'a.c' },
                    breakpoints: [{ line: 1 }],
                }
            ),
            session.callSetBreakPointsRequest(
                emptyResponse<DebugProtocol.SetBreakpointsResponse>(),
                {
                    source: { path: 'a.c' },
                    breakpoints: [{ line: 2 }],
                }
            ),
        ]);

        expect(maxConcurrent).to.equal(1);
    });

    it('serializes setBreakPointsRequest with setInstructionBreakpointsRequest', async function () {
        await Promise.all([
            session.callSetBreakPointsRequest(
                emptyResponse<DebugProtocol.SetBreakpointsResponse>(),
                {
                    source: { path: 'a.c' },
                    breakpoints: [{ line: 1 }],
                }
            ),
            session.callSetInstructionBreakpointsRequest(
                emptyResponse<DebugProtocol.SetInstructionBreakpointsResponse>(),
                {
                    breakpoints: [{ instructionReference: '0x1000' }],
                }
            ),
        ]);

        expect(maxConcurrent).to.equal(1);
    });
});
