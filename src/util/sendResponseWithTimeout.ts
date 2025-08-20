/*********************************************************************
 * Copyright (c) 2025 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

export interface SendResponseWithTimeoutParameters {
    /** The main function to be called during the execution */
    execute: () => Promise<void> | void;
    /** The independent response which should be sent after the operation or the timeout */
    onResponse: () => Promise<void> | void;
    /** Error handling block. It is optional, if it is not implemented the error will not be catch be thrown */
    onError?: (
        error: unknown,
        args: { hasResponseSent: boolean }
    ) => Promise<void> | void;
    /** Timeout to send the response in milliseconds, timer disabled if timeout is negative (e.g. `-1`) */
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
    let responseSent = false;
    const timer =
        timeout >= 0
            ? setTimeout(async () => {
                  responseSent = true;
                  await onResponse();
              }, timeout)
            : undefined;
    try {
        await execute();
        clearTimeout(timer);
        if (!responseSent) {
            await onResponse();
        }
    } catch (err) {
        // Important to clear timeout if error catched from the `execute` logic.
        // But it is also safe to call clearTimeout twice if error thrown in the `onResponse` logic.
        clearTimeout(timer);

        if (!onError) {
            throw err;
        }
        await onError(err, {
            hasResponseSent: responseSent,
        });
    }
};
