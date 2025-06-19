/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import {
    TargetAttachRequestArguments,
    TargetLaunchRequestArguments,
} from '../../types/session';
import { IGDBServerFactory, IGDBServerProcessManager } from '../../types/gdb';
import { GDBServerWebProcessManager } from '../processManagers/GDBServerWebProcessManager';

export class GDBServerFactory implements IGDBServerFactory {
    async createGDBServerManager(
        _args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ): Promise<IGDBServerProcessManager> {
        return new GDBServerWebProcessManager();
    }
}
