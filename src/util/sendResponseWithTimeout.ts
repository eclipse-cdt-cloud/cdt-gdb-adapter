/*********************************************************************
 * Copyright (c) 2025 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

interface SendResponseWithTimeoutParameters {
    /** The main function to be called during the execution */
    execute: () => Promise<void> | void;
    /** The independent response which should be sent after the operation or the timeout */
    onResponse: () => Promise<void> | void;
    /** Error handling block. It is optional, if it is not implemented the error will not be catch be thrown */
    onError?: (error: unknown) => Promise<void> | void;
    /** Timeout to send the response in milliseconds */
    timeout: number;
}

/**
 * `sendResponseWithTimeout` method is handling an early response invocation for independent response and execution
 *  logics after the defined timeout duration, in order to provide the response to the IDE user interface.
 *  Designed to be used in the debug session operations such as step-in, step-out, step-over.
 *
 *  @param parameters Should be specified in `SendResponseWithTimeoutParameters` structure. Provide the
 * `execute`, `onResponse`, `onError` and `timeout` values.
 */
export const sendResponseWithTimeout = async (
    parameters: SendResponseWithTimeoutParameters
) => {
    const { execute, onResponse, onError, timeout } = parameters;
    try {
        let responseSent = false;
        const timer = setTimeout(async () => {
            responseSent = true;
            await onResponse();
        }, timeout);
        await execute();
        clearTimeout(timer);
        if (!responseSent) {
            await onResponse();
        }
    } catch (err) {
        if (!onError) {
            throw err;
        }
        await onError(err);
    }
};
