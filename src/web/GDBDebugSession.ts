/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { DebugSession, logger } from '@vscode/debugadapter';
import { GDBDebugSessionBase } from '../gdb/GDBDebugSessionBase';
import { GDBBackendFactory } from './factories/GDBBackendFactory';
import { IGDBBackendFactory } from '../types/gdb';

export class GDBDebugSession extends GDBDebugSessionBase {
    constructor(backendFactory?: IGDBBackendFactory) {
        super(backendFactory || new GDBBackendFactory());
        this.logger = logger;
    }

    /**
     * Main entry point
     */
    public static run(debugSession: typeof DebugSession) {
        DebugSession.run(debugSession);
    }
}
