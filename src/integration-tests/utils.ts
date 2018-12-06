/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
/**
 * Wrap `promise` in a new Promise that resolves if `promise` is rejected, and is rejected if `promise` is resolved.
 *
 * This is useful when we expect `promise` to be reject and want to test that it is indeed the case.
 */
export function expectRejection<T>(promise: Promise<T>): Promise<Error> {
    return new Promise<Error>((resolve, reject) => {
        promise.then(reject).catch(resolve);
    });
}
