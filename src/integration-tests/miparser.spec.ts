/*********************************************************************
 * Copyright (c) 2023 Kichwa Coders Canada Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { GDBBackend } from '../gdb/GDBBackend';
import { MIParser } from '../MIParser';
import * as sinon from 'sinon';
import { logger } from '@vscode/debugadapter/lib/logger';

describe('MI Parser Test Suite', function () {
    let gdbBackendMock: sinon.SinonStubbedInstance<GDBBackend>;
    let loggerErrorSpy: sinon.SinonSpy;
    let parser: MIParser;

    beforeEach(async function () {
        gdbBackendMock = sinon.createStubInstance(GDBBackend);
        loggerErrorSpy = sinon.spy(logger, 'error');

        parser = new MIParser(gdbBackendMock);
    });

    afterEach(function () {
        try {
            sinon.assert.notCalled(loggerErrorSpy);
        } finally {
            sinon.restore();
        }
    });

    it('simple result-record', async function () {
        const callback = sinon.spy();
        parser.queueCommand(5, 'command string', callback);
        parser.parseLine('5^done');
        sinon.assert.calledOnceWithExactly(callback, 'done', {
            'cdt-token': '5',
            'cdt-command': 'command string',
        });
    });

    it('simple result-record with multi-digit token', async function () {
        const callback = sinon.spy();
        parser.queueCommand(1234, 'command string', callback);
        parser.parseLine('1234^done');
        sinon.assert.calledOnceWithExactly(callback, 'done', {
            'cdt-token': '1234',
            'cdt-command': 'command string',
        });
    });

    it('simple result-record for unknown token number', async function () {
        parser.parseLine('5^done');
        sinon.assert.calledOnceWithExactly(
            loggerErrorSpy,
            'GDB response with no command: 5'
        );
        loggerErrorSpy.resetHistory();
    });

    it('simple result-record for no token number', async function () {
        parser.parseLine('^done');
        sinon.assert.calledOnceWithExactly(
            loggerErrorSpy,
            'GDB response with no command: '
        );
        loggerErrorSpy.resetHistory();
    });

    it('simple console-stream-output', async function () {
        parser.parseLine('~"message"');
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'consoleStreamOutput',
            'message',
            'stdout'
        );
    });

    it('simple target-stream-output', async function () {
        parser.parseLine('@"message"');
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'consoleStreamOutput',
            'message',
            'stdout'
        );
    });

    it('simple log-stream-output', async function () {
        parser.parseLine('&"message"');
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'consoleStreamOutput',
            'message',
            'log'
        );
    });

    it('simple notify-async-output', async function () {
        parser.parseLine('=message,object={value="1234"}');
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'notifyAsync',
            'message',
            {
                object: {
                    value: '1234',
                },
            }
        );
    });

    it('simple exec-async-output', async function () {
        parser.parseLine('*message,object={value="1234"}');
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'execAsync',
            'message',
            {
                object: {
                    value: '1234',
                },
            }
        );
    });

    it('simple status-async-output', async function () {
        parser.parseLine('+message,object={value="1234"}');
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'statusAsync',
            'message',
            {
                object: {
                    value: '1234',
                },
            }
        );
    });

    it('simple non-MI output', async function () {
        // this is when the output line doesn't match any of
        // expected output syntax so we just log it back to the
        // user. This can happen when the inferior's stdout
        // is the same as gdb's stdout.
        parser.parseLine('other');
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'consoleStreamOutput',
            // XXX: This tests for how this code has always been implemented,
            // but it isn't particularly useful to do this. Fixing it is low
            // priority because users should avoid having inferior stdout
            // being on the MI stdout as it leads to parsing errors
            'other\n',
            'stdout'
        );
    });

    it('structure that starts with a curly bracket and contains values but not keys', async function () {
        parser.parseLine(
            '+message,bkpt={number="1",type="breakpoint",thread-groups=["i1"],script={"p }123","p 321","p 789"}}'
        );
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'statusAsync',
            'message',
            {
                bkpt: {
                    number: '1',
                    type: 'breakpoint',
                    'thread-groups': ['i1'],
                    script: { '0': 'p }123', '1': 'p 321', '2': 'p 789' },
                },
            }
        );
    });
});
