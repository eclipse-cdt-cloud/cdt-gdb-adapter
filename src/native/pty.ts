/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { Socket } from 'net';

// tslint:disable-next-line:variable-name
const tty_wrap = (process as any).binding('tty_wrap');
// tslint:disable-next-line:no-var-requires
const pty = require('../../build/Release/pty.node');
interface PtyHandles {
    master_fd: number;
    slave_name: string;
}

export class Pty {

    public master: Socket;
    public readonly name: string;

    constructor() {
        const handles: PtyHandles = pty.create_pty();
        const backup = tty_wrap.guessHandleType;
        tty_wrap.guessHandleType = () => 'PIPE';
        this.master = new Socket({ fd: handles.master_fd });
        tty_wrap.guessHandleType = backup;
        this.name = handles.slave_name;
    }
}
