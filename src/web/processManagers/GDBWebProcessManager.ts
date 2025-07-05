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
    AttachRequestArguments,
    LaunchRequestArguments,
    TargetLaunchRequestArguments,
} from '../../types/session';
import { IGDBProcessManager, IStdioProcess } from '../../types/gdb';

export class GDBWebProcessManager implements IGDBProcessManager {
    public async getVersion(
        _requestArgs?:
            | LaunchRequestArguments
            | AttachRequestArguments
            | undefined
    ): Promise<string> {
        throw new Error('Method not implemented yet!');
    }
    public async start(
        _requestArgs: TargetLaunchRequestArguments
    ): Promise<IStdioProcess> {
        throw new Error('Method not implemented yet!');
    }
    public async stop(): Promise<void> {
        throw new Error('Method not implemented yet!');
    }
}
