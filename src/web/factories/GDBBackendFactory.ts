/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { Logger, logger } from '@vscode/debugadapter/lib/logger';
import {
    IGDBBackend,
    IGDBBackendFactory,
    IGDBProcessManager,
} from '../../types/gdb';
import {
    AttachRequestArguments,
    LaunchRequestArguments,
} from '../../types/session';
import { GDBBackend } from '../../gdb/GDBBackend';
import { GDBDebugSessionBase } from '../../gdb/GDBDebugSessionBase';
import { GDBWebProcessManager } from '../processManagers/GDBWebProcessManager';

export class GDBBackendFactory implements IGDBBackendFactory {
    logger: Logger;
    constructor() {
        this.logger = logger;
    }

    async createGDBManager(
        _session: GDBDebugSessionBase,
        _args: LaunchRequestArguments | AttachRequestArguments
    ): Promise<IGDBProcessManager> {
        return new GDBWebProcessManager();
    }

    async createBackend(
        _session: GDBDebugSessionBase,
        manager: IGDBProcessManager,
        _args: LaunchRequestArguments | AttachRequestArguments
    ): Promise<IGDBBackend> {
        return new GDBBackend(manager);
    }
}
