/*********************************************************************
 * Copyright (c) 2026 S. Comins and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as sinon from 'sinon';
import { expect } from 'chai';
import { GDBTargetDebugSession } from '../desktop/GDBTargetDebugSession';
import { IGDBBackend } from '../types/gdb';

class TestGDBTargetDebugSession extends GDBTargetDebugSession {
    public sendEventStub: sinon.SinonStub;

    constructor(sandbox: sinon.SinonSandbox) {
        super();
        this.sendEventStub = sandbox.stub();
        this.sendEvent = this.sendEventStub;
        this.killGdbServer = false;
        this.targetType = 'remote';
    }

    public setBackends(gdb: IGDBBackend, auxGdb: IGDBBackend) {
        this.gdb = gdb;
        this.auxGdb = auxGdb;
    }

    public async disconnect() {
        await this.doDisconnectRequest(0, false);
    }

    protected override async setSessionState(): Promise<void> {
        // Keep these tests focused on GDB process cleanup.
    }
}

interface BackendOptions {
    active?: boolean;
    detachError?: Error;
    exitError?: Error;
}

const createBackend = (
    name: string,
    calls: string[],
    options: BackendOptions = {}
): IGDBBackend =>
    ({
        isActive: () => options.active ?? true,
        isNonStopMode: () => true,
        sendCommand: async (command: string) => {
            calls.push(`${name}:${command}`);
            if (command === 'detach' && options.detachError) {
                throw options.detachError;
            }
        },
        sendGDBExit: async () => {
            calls.push(`${name}:exit`);
            if (options.exitError) {
                throw options.exitError;
            }
        },
    }) as unknown as IGDBBackend;

describe('GDB process cleanup on disconnect', function () {
    let sandbox: sinon.SinonSandbox;
    let session: TestGDBTargetDebugSession;
    let calls: string[];

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        session = new TestGDBTargetDebugSession(sandbox);
        calls = [];
    });

    afterEach(function () {
        sandbox.restore();
    });

    const outputEvents = () =>
        session.sendEventStub
            .getCalls()
            .map((call) => call.args[0])
            .filter((event) => event.event === 'output');

    it('detaches and exits the auxiliary and primary GDB backends', async function () {
        session.setBackends(
            createBackend('primary', calls),
            createBackend('auxiliary', calls)
        );

        await session.disconnect();

        expect(calls).to.deep.equal([
            'auxiliary:detach',
            'primary:detach',
            'auxiliary:exit',
            'primary:exit',
        ]);
        expect(
            outputEvents().map((event) => [
                event.body.category,
                event.body.output,
            ])
        ).to.deep.equal([
            ['server', 'gdb exited\n'],
            ['server', 'gdb exited\n'],
        ]);
    });

    it('exits both backends when detaching fails', async function () {
        session.setBackends(
            createBackend('primary', calls, {
                detachError: new Error('primary detach failed'),
            }),
            createBackend('auxiliary', calls)
        );

        await session.disconnect();

        expect(calls).to.deep.equal([
            'auxiliary:detach',
            'primary:detach',
            'auxiliary:exit',
            'primary:exit',
        ]);
        expect(
            outputEvents().some(
                (event) =>
                    event.body.category === 'server' &&
                    event.body.output === 'gdb connection lost\n'
            )
        ).to.be.true;
    });

    it('reports cleanup errors and still exits the other backend', async function () {
        session.setBackends(
            createBackend('primary', calls),
            createBackend('auxiliary', calls, {
                exitError: new Error('auxiliary exit failed'),
            })
        );

        await session.disconnect();

        expect(calls).to.deep.equal([
            'auxiliary:detach',
            'primary:detach',
            'auxiliary:exit',
            'primary:exit',
        ]);
        expect(
            outputEvents().some(
                (event) =>
                    event.body.category === 'stderr' &&
                    event.body.output.includes(
                        'GDB process cleanup failed: auxiliary exit failed'
                    )
            )
        ).to.be.true;
    });

    it('still exits the auxiliary backend if the primary process is inactive', async function () {
        session.setBackends(
            createBackend('primary', calls, { active: false }),
            createBackend('auxiliary', calls)
        );

        await session.disconnect();

        expect(calls).to.deep.equal(['auxiliary:exit']);
    });
});
