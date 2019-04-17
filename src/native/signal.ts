/*********************************************************************
 * Copyright (c) 2019 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

// tslint:disable-next-line:no-var-requires
const signal = require('../../build/Release/signal.node');

export function raise(pid: number, sig: number, cb: (msg: string) => void) {
    signal.raise(pid, sig, cb);
}
