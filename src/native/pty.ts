/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { File } from './file';
export { File };

interface PtyHandles {
    master_fd: number;
    slave_name: string;
}

/**
 * Represents the master-side of a pseudo-terminal master/slave pair.
 */
export class Pty extends File {
    public readonly slave_name: string;

    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('../../build/Release/pty.node');
        const handles = pty.create_pty() as PtyHandles;
        super(handles.master_fd);
        this.slave_name = handles.slave_name;
    }
}
