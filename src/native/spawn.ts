/*********************************************************************
 * Copyright (c) 2019 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { logger } from 'vscode-debugadapter/lib/logger';
// tslint:disable-next-line:no-var-requires
const spawn = require('../../build/Release/spawn.node');

export interface SpawnedProc {
    pid: number;
    stdin?: number;
    stdout?: number;
    sterr?: number;
    errmsg?: string;
}

export function exec(args: string[], env: string[], dirpath?: string): SpawnedProc {
    if (!dirpath) {
        dirpath = '.';
    }
    let sp: SpawnedProc;
    try {
        sp = spawn.native_exec(args, env, dirpath, (msg: string) => logger.error(msg));
    } catch (error) {
        sp = { pid: -1, errmsg: error.msg };
    }
    return sp;
}
