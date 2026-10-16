/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { IGDBBackend } from '../types/gdb';
import { FrameReference } from '../types/session';
import { appendThreadAndFrame } from './base';
export function sendInterpreterExecConsole(
    gdb: IGDBBackend,
    params: {
        frameRef: FrameReference | undefined;
        command: any;
    }
) {
    // In GDB MI, -1 is not a valid value for --thread or --frame.
    // These options expect positive integer IDs. Omitting the option means "all threads"/"current frame".
    // So, only include --thread/--frame if threadId/frameId >= 0.
    let cmd = appendThreadAndFrame('-interpreter-exec', params.frameRef);
    const stringifiedCommand = `${params.command}`;
    cmd += ` console "${stringifiedCommand.replace(/(["\\])/g, '\\$1')}"`;
    return gdb.sendCommand(cmd);
}
