/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { Event } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';

export class ContinuedEvent
    extends Event
    implements DebugProtocol.ContinuedEvent
{
    public body: {
        threadId: number;
        allThreadsContinued?: boolean;
    };

    constructor(threadId: number, allThreadsContinued = false) {
        super('continued');

        this.body = {
            threadId,
            allThreadsContinued,
        };
    }
}
