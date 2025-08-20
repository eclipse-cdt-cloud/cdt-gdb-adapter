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
import { sendResponseWithTimeout } from '../util/sendResponseWithTimeout';

describe('sendResponseWithTimeout', function () {
    const defaultTimeout = 100;
    const testError = new Error('Test execution error');

    let sandbox: sinon.SinonSandbox;
    let clock: sinon.SinonFakeTimers;
    let executeStub: sinon.SinonStub;
    let onResponseStub: sinon.SinonStub;
    let onErrorStub: sinon.SinonStub;
    type VoidResolve = () => void;
    let executeResolve: VoidResolve;
    let executeRejects: (reason: any) => void;
    let executePromise: Promise<void>;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        clock = sandbox.useFakeTimers();
        executeStub = sandbox.stub();
        onResponseStub = sandbox.stub();
        onErrorStub = sandbox.stub();

        executePromise = new Promise<void>((resolve, rejects) => {
            executeResolve = resolve;
            executeRejects = rejects;
        });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('Normal execution scenarios', function () {
        it('should execute and call onResponse immediately when execute completes before timeout', async function () {
            executeStub.resolves();

            const promise = sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: defaultTimeout,
            });

            clock.tick(50);
            await promise;

            expect(executeStub.calledOnce).to.be.true;
            expect(onResponseStub.calledOnce).to.be.true;
            expect(onErrorStub.notCalled).to.be.true;
        });

        it('should call onResponse via timeout when execute takes longer than timeout', async function () {
            executeStub.returns(executePromise);

            const promise = sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: defaultTimeout,
            });

            clock.tick(25);
            expect(executeStub.calledOnce).to.be.true;
            expect(onResponseStub.notCalled).to.be.true;

            // Just 1ms after the timeout.
            clock.tick(defaultTimeout - 25 + 1);

            expect(executeStub.calledOnce).to.be.true;
            expect(onResponseStub.calledOnce).to.be.true;

            executeResolve();
            await promise;

            expect(onResponseStub.calledOnce).to.be.true;
        });

        it('should not call onResponse twice when execute completes just after timeout', async function () {
            executeStub.returns(executePromise);

            const promise = sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: defaultTimeout,
            });

            clock.tick(defaultTimeout);

            expect(onResponseStub.calledOnce).to.be.true;

            executeResolve();
            await promise;

            expect(onResponseStub.calledOnce).to.be.true;
        });

        it('should work with synchronous execute function', async function () {
            executeStub.returns(undefined);

            await sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: defaultTimeout,
            });

            expect(executeStub.calledOnce).to.be.true;
            expect(onResponseStub.calledOnce).to.be.true;
        });

        it('should work with synchronous onResponse function', async function () {
            executeStub.resolves();
            onResponseStub.returns(undefined);

            await sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: defaultTimeout,
            });

            expect(executeStub.calledOnce).to.be.true;
            expect(onResponseStub.calledOnce).to.be.true;
        });

        it('should handle concurrent calls independently', async function () {
            const executeStub1 = sandbox.stub().resolves();
            const onResponseStub1 = sandbox.stub().resolves();
            const executeStub2 = sandbox.stub();
            const onResponseStub2 = sandbox.stub().resolves();

            executeStub2.returns(executePromise);

            const promise1 = sendResponseWithTimeout({
                execute: executeStub1,
                onResponse: onResponseStub1,
                timeout: 50,
            });

            const promise2 = sendResponseWithTimeout({
                execute: executeStub2,
                onResponse: onResponseStub2,
                timeout: defaultTimeout,
            });

            await promise1;
            expect(onResponseStub1.calledOnce).to.be.true;

            clock.tick(defaultTimeout);
            expect(onResponseStub2.calledOnce).to.be.true;

            executeResolve();
            await promise2;

            expect(onResponseStub1.calledOnce).to.be.true;
            expect(onResponseStub2.calledOnce).to.be.true;
        });
    });

    describe('Error handling scenarios', function () {
        it('should call onError when execute throws an error and onError is provided', async function () {
            executeStub.rejects(testError);

            await sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                onError: onErrorStub,
                timeout: defaultTimeout,
            });

            expect(executeStub.calledOnce).to.be.true;
            expect(onErrorStub.calledOnceWith(testError)).to.be.true;
            expect(onResponseStub.notCalled).to.be.true;
        });

        it('should rethrow error when execute throws and onError is not provided', async function () {
            executeStub.rejects(testError);

            try {
                await sendResponseWithTimeout({
                    execute: executeStub,
                    onResponse: onResponseStub,
                    timeout: defaultTimeout,
                });
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.equal(testError);
            }

            expect(executeStub.calledOnce).to.be.true;
            expect(onResponseStub.notCalled).to.be.true;
        });

        it('should handle synchronous errors from execute', async function () {
            executeStub.throws(testError);

            await sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                onError: onErrorStub,
                timeout: defaultTimeout,
            });

            expect(executeStub.calledOnce).to.be.true;
            expect(onErrorStub.calledOnceWith(testError)).to.be.true;
            expect(onResponseStub.notCalled).to.be.true;
        });

        it('should handle errors in onError function gracefully', async function () {
            const executeError = new Error('Execute error');
            const onErrorError = new Error('OnError error');
            executeStub.rejects(executeError);
            onErrorStub.rejects(onErrorError);

            try {
                await sendResponseWithTimeout({
                    execute: executeStub,
                    onResponse: onResponseStub,
                    onError: onErrorStub,
                    timeout: defaultTimeout,
                });
                expect.fail('Should have thrown the onError error');
            } catch (error) {
                expect(error).to.equal(onErrorError);
            }
        });

        it('should call onError when onResponse throws an error and onError is provided', async function () {
            executeStub.resolves();
            onResponseStub.rejects(testError);

            await sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                onError: onErrorStub,
                timeout: defaultTimeout,
            });

            expect(executeStub.calledOnce).to.be.true;
            expect(onErrorStub.calledOnceWith(testError)).to.be.true;
            expect(onResponseStub.calledOnce).to.be.true;
        });

        it('should call onError when onResponse throws an error and onError is not provided', async function () {
            executeStub.resolves();
            onResponseStub.rejects(testError);

            try {
                await sendResponseWithTimeout({
                    execute: executeStub,
                    onResponse: onResponseStub,
                    timeout: defaultTimeout,
                });
                expect.fail('Should have thrown the onResponse error');
            } catch (error) {
                expect(error).to.equal(testError);
            }
        });
    });

    describe('Timeout behavior', function () {
        it('should handle different timeout values', async function () {
            executeStub.returns(executePromise);

            const promise = sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: 50,
            });

            clock.tick(25);
            expect(onResponseStub.notCalled).to.be.true;

            clock.tick(25);
            expect(onResponseStub.calledOnce).to.be.true;

            executeResolve();
            await promise;
        });

        it('should handle zero timeout', async function () {
            executeStub.returns(executePromise);

            const promise = sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: 0,
            });

            clock.tick(1);

            expect(onResponseStub.calledOnce).to.be.true;

            executeResolve();
            await promise;
        });

        it('should clear timeout when execute completes before timeout', async function () {
            executeStub.resolves();
            const clearTimeoutSpy = sandbox.spy(global, 'clearTimeout');

            await sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: 1000,
            });

            expect(clearTimeoutSpy.called).to.be.true;
        });

        it('should disable timeout when negative timeout is provided', async function () {
            executeStub.returns(executePromise);
            const setTimeoutSpy = sandbox.spy(global, 'setTimeout');

            const promise = sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: -1,
            });

            // Advance time significantly
            clock.tick(10000);

            expect(onResponseStub.notCalled).to.be.true;
            expect(setTimeoutSpy.notCalled).to.be.true;

            executeResolve();
            await promise;

            expect(onResponseStub.calledOnce).to.be.true;
        });

        it('should handle negative timeout with immediate execution', async function () {
            executeStub.resolves();

            await sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                timeout: -100,
            });

            expect(executeStub.calledOnce).to.be.true;
            expect(onResponseStub.calledOnce).to.be.true;
        });
    });

    describe('hasResponseSent parameter in onError', function () {
        it('should pass hasResponseSent=false when error occurs before timeout', async function () {
            executeStub.rejects(testError);

            await sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                onError: onErrorStub,
                timeout: defaultTimeout,
            });

            expect(onErrorStub.calledOnce).to.be.true;
            expect(onErrorStub.firstCall.args).to.deep.equal([
                testError,
                {
                    hasResponseSent: false,
                },
            ]);
        });

        it('should pass hasResponseSent=true when error occurs after timeout response', async function () {
            executeStub.returns(executePromise);

            const promise = sendResponseWithTimeout({
                execute: executeStub,
                onResponse: onResponseStub,
                onError: onErrorStub,
                timeout: defaultTimeout,
            });

            clock.tick(defaultTimeout);
            expect(onResponseStub.calledOnce).to.be.true;

            executeRejects(testError);
            await promise;

            expect(onErrorStub.calledOnce).to.be.true;
            expect(onErrorStub.firstCall.args).to.deep.equal([
                testError,
                {
                    hasResponseSent: true,
                },
            ]);
        });
    });
});
