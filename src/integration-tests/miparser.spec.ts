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
import { expect } from 'chai';

describe('MI Parser Test Suite', function () {
    let gdbBackendMock: sinon.SinonStubbedInstance<GDBBackend>;
    let loggerErrorSpy: sinon.SinonSpy;
    let loggerVerboseSpy: sinon.SinonSpy;
    let callback: sinon.SinonSpy;
    let parser: MIParser;

    beforeEach(async function () {
        gdbBackendMock = sinon.createStubInstance(GDBBackend);
        loggerErrorSpy = sinon.spy(logger, 'error');
        loggerVerboseSpy = sinon.spy(logger, 'verbose');
        callback = sinon.spy();

        parser = new MIParser(gdbBackendMock);
    });

    afterEach(function () {
        try {
            sinon.assert.notCalled(loggerErrorSpy);
        } finally {
            sinon.restore();
            sinon.resetHistory();
        }
    });

    const resetSpyHistories = () => {
        callback.resetHistory();
        loggerVerboseSpy.resetHistory();
        loggerErrorSpy.resetHistory();
        gdbBackendMock.emit.resetHistory();
    };

    const assertCallbackAndEmitResultAsync = (
        resultClass: string,
        resultData: any
    ) => {
        sinon.assert.calledOnceWithExactly(callback, resultClass, resultData);
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'resultAsync',
            resultClass,
            resultData
        );
    };

    const assertNoCallbackButEmitResultAsync = (
        resultClass: string,
        resultData: any
    ) => {
        sinon.assert.notCalled(callback);
        sinon.assert.calledOnceWithExactly(
            gdbBackendMock.emit as sinon.SinonStub,
            'resultAsync',
            resultClass,
            resultData
        );
    };

    type LogBehavior = 'verbose' | 'error' | 'both' | 'none';
    const assertNoCommandTokenLog = (
        token: string,
        logBehavior: LogBehavior
    ) => {
        switch (logBehavior) {
            case 'verbose':
                expect(
                    loggerVerboseSpy.calledWithExactly(
                        `GDB response with no command: ${token}`
                    )
                ).to.be.true;
                expect(
                    loggerErrorSpy.calledWithExactly(
                        `GDB response with no command: ${token}`
                    )
                ).to.be.false;
                break;
            case 'error':
                expect(
                    loggerVerboseSpy.calledWithExactly(
                        `GDB response with no command: ${token}`
                    )
                ).to.be.false;
                expect(
                    loggerErrorSpy.calledWithExactly(
                        `GDB response with no command: ${token}`
                    )
                ).to.be.true;
                break;
            case 'both':
                expect(
                    loggerVerboseSpy.calledWithExactly(
                        `GDB response with no command: ${token}`
                    )
                ).to.be.true;
                expect(
                    loggerErrorSpy.calledWithExactly(
                        `GDB response with no command: ${token}`
                    )
                ).to.be.true;
                break;
            case 'none':
                expect(
                    loggerVerboseSpy.calledWithExactly(
                        `GDB response with no command: ${token}`
                    )
                ).to.be.false;
                expect(
                    loggerErrorSpy.calledWithExactly(
                        `GDB response with no command: ${token}`
                    )
                ).to.be.false;
                break;
        }
    };

    it('simple result-record', async function () {
        parser.queueCommand(5, 'command string', callback);
        parser.parseLine('5^done');
        assertCallbackAndEmitResultAsync('done', {
            'cdt-token': '5',
            'cdt-command': 'command string',
        });
    });

    it('simple result-record with multi-digit token', async function () {
        parser.queueCommand(1234, 'command string', callback);
        parser.parseLine('1234^done');
        assertCallbackAndEmitResultAsync('done', {
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
        expect(
            gdbBackendMock.emit.calledOnceWithExactly('resultAsync', 'done', {
                'cdt-token': '5',
            })
        ).to.be.true;
        loggerErrorSpy.resetHistory();
    });

    it('simple result-record for no token number', async function () {
        parser.parseLine('^done');
        sinon.assert.calledOnceWithExactly(
            loggerErrorSpy,
            'GDB response with no command: '
        );
        expect(
            gdbBackendMock.emit.calledOnceWithExactly('resultAsync', 'done', {
                'cdt-token': '',
            })
        ).to.be.true;
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

    it('correctly handles error result for a command', async function () {
        // Command
        parser.queueCommand(5, '-exec-continue --thread 8', callback);
        // Error result
        parser.parseLine('5^error,msg="Command aborted"');
        assertCallbackAndEmitResultAsync('error', {
            'cdt-token': '5',
            'cdt-command': '-exec-continue --thread 8',
            msg: 'Command aborted',
        });
        assertNoCommandTokenLog('5', 'none');
    });

    it('correctly handles late arrival error after done result for command', async function () {
        // Command
        parser.queueCommand(5, '-exec-continue --thread 8', callback);
        // Done result
        parser.parseLine('5^done');
        assertCallbackAndEmitResultAsync('done', {
            'cdt-token': '5',
            'cdt-command': '-exec-continue --thread 8',
        });
        assertNoCommandTokenLog('5', 'none');
        resetSpyHistories();
        // Late arrival error response for same command
        parser.parseLine('5^error,msg="any error"');
        assertNoCallbackButEmitResultAsync('error', {
            'cdt-token': '5',
            msg: 'any error',
        });
        assertNoCommandTokenLog('5', 'verbose');
    });

    it('correctly handles unrelated done result between command and its done result', async function () {
        // Command
        parser.queueCommand(5, '-exec-continue --thread 8', callback);
        // Unrelated result without command in queue
        parser.parseLine('6^done');
        assertNoCallbackButEmitResultAsync('done', {
            'cdt-token': '6',
        });
        assertNoCommandTokenLog('6', 'error');
        resetSpyHistories();
        // Done result for command
        parser.parseLine('5^done');
        assertCallbackAndEmitResultAsync('done', {
            'cdt-token': '5',
            'cdt-command': '-exec-continue --thread 8',
        });
        assertNoCommandTokenLog('5', 'none');
    });

    it('correctly handles unrelated done result between command and its error result', async function () {
        // Command
        parser.queueCommand(5, '-exec-continue --thread 8', callback);
        // Unrelated result without command in queue
        parser.parseLine('6^done');
        assertNoCallbackButEmitResultAsync('done', {
            'cdt-token': '6',
        });
        assertNoCommandTokenLog('6', 'error');
        resetSpyHistories();
        // Done result for command
        parser.parseLine('5^error,msg="failed"');
        assertCallbackAndEmitResultAsync('error', {
            'cdt-token': '5',
            'cdt-command': '-exec-continue --thread 8',
            msg: 'failed',
        });
        assertNoCommandTokenLog('5', 'none');
    });

    it('correctly handles unrelated error result between command and its error result', async function () {
        // Command
        parser.queueCommand(5, '-exec-continue --thread 8', callback);
        // Unrelated error result without command in queue
        parser.parseLine('6^error,msg="one error"');
        assertNoCallbackButEmitResultAsync('error', {
            'cdt-token': '6',
            msg: 'one error',
        });
        assertNoCommandTokenLog('6', 'verbose');
        resetSpyHistories();
        // Error result for command
        parser.parseLine('5^error,msg="another error"');
        assertCallbackAndEmitResultAsync('error', {
            'cdt-token': '5',
            'cdt-command': '-exec-continue --thread 8',
            msg: 'another error',
        });
        assertNoCommandTokenLog('5', 'none');
    });
});
