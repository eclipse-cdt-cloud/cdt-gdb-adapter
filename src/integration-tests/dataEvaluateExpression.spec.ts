/*********************************************************************
 * Copyright (c) 2026 contributors and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as sinon from 'sinon';
import { IGDBBackend } from '../types/gdb';
import { sendDataEvaluateExpression } from '../mi/data';

describe('sendDataEvaluateExpression', function () {
    let sandbox: sinon.SinonSandbox;
    let gdb: IGDBBackend;
    let sendCommand: sinon.SinonStub;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        sendCommand = sandbox.stub().resolves({ value: '0x1234' });
        gdb = { sendCommand } as unknown as IGDBBackend;
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('evaluates in the explicitly selected thread and frame', async function () {
        await sendDataEvaluateExpression(gdb, '&items', {
            threadId: 8,
            frameId: 3,
        });

        sinon.assert.calledOnceWithExactly(
            sendCommand,
            '-data-evaluate-expression --thread 8 --frame 3 "&items"'
        );
    });

    it('preserves current-context evaluation when no frame is supplied', async function () {
        await sendDataEvaluateExpression(gdb, '$_thread');

        sinon.assert.calledOnceWithExactly(
            sendCommand,
            '-data-evaluate-expression "$_thread"'
        );
    });
});
