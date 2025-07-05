/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { TargetLaunchRequestArguments } from '../../types/session';
import { IGDBServerProcessManager, IStdioProcess } from '../../types/gdb';

export class GDBServerWebProcessManager implements IGDBServerProcessManager {
    public async start(
        _requestArgs: TargetLaunchRequestArguments
    ): Promise<IStdioProcess> {
        throw new Error('Method not implemented yet!');
    }
    public async stop(): Promise<void> {
        throw new Error('Method not implemented yet!');
    }
}
