#!/usr/bin/env node
/*********************************************************************
 * Copyright (c) 2025 Arm Ltd and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { logger } from '@vscode/debugadapter/lib/logger';
import { GDBBackend } from '../../../gdb/GDBBackend';
import { GDBTargetDebugSession } from '../../../desktop/GDBTargetDebugSession';
import { GDBFileSystemProcessManager } from '../../../desktop/processManagers/GDBFileSystemProcessManager';
import {
    AttachRequestArguments,
    LaunchRequestArguments,
} from '../../../types/session';
import {
    IGDBBackend,
    IGDBBackendFactory,
    IGDBProcessManager,
    IStdioProcess,
} from '../../../types/gdb';
import { GDBDebugSessionBase } from '../../../gdb/GDBDebugSessionBase';
import { GDBFileSystemProcessManagerBase } from '../../../desktop/processManagers/GDBFileSystemProcessManagerBase';
import {
    MIStackInfoDepthResponse,
    MIVarCreateResponse,
    MIVarListChildrenResponse,
    MIVarPathInfoResponse,
    MIVarUpdateResponse,
    MIDataReadMemoryBytesResponse,
} from '../../../mi';

process.on('uncaughtException', (err: any) => {
    logger.error(JSON.stringify(err));
});

class AuxiliaryGDBBackend extends GDBBackend {
    public spawned = false;

    public override async spawn(
        _requestArgs: LaunchRequestArguments | AttachRequestArguments
    ): Promise<void> {
        this.logger.log(`spawn`);
        this.spawned = true;
    }

    public override async sendCommand<T>(command: string): Promise<T> {
        // Generic mock for commands not mocked specifically, batched commands, or commands going through
        // MI functionality in src/mi/*
        this.logger.log(`sendCommand: ${command}`);
        const trimmed = command.trim();
        if (trimmed.startsWith('-var-create')) {
            return {
                name: 'MockVariable',
                numchild: '1',
                value: 'MockValue',
                type: 'MockParentType',
                _class: '',
            } as MIVarCreateResponse as unknown as T;
        } else if (trimmed.startsWith('-var-update')) {
            return {
                changelist: [
                    {
                        name: 'MockVariable',
                        value: 'UpdatedMockValue',
                        in_scope: '1',
                        type_changed: '0',
                        has_more: '0',
                        new_type: 'MockParentType',
                        new_num_children: '1',
                    },
                ],
            } as MIVarUpdateResponse as unknown as T;
        } else if (trimmed.startsWith('-var-list-children')) {
            return {
                numchild: '1',
                children: [
                    {
                        name: 'MockChildVariable',
                        value: 'MockChildValue',
                        exp: 'MockChildExp',
                        numchild: '0',
                        type: 'MockChildType',
                    },
                ],
            } as MIVarListChildrenResponse as unknown as T;
        } else if (trimmed.startsWith('-var-info-path-expression')) {
            return {
                path_expr: 'Mock/Path/To/Variable',
            } as MIVarPathInfoResponse as unknown as T;
        } else if (trimmed.startsWith('-stack-info-depth')) {
            return {
                depth: '0',
            } as MIStackInfoDepthResponse as unknown as T;
        } else if (trimmed.startsWith('-data-read-memory-bytes')) {
            return {
                memory: [
                    {
                        begin: '0x00000000',
                        end: '0x00000004',
                        offset: '0',
                        contents: 'ABCD0123',
                    },
                ],
            } as MIDataReadMemoryBytesResponse as unknown as T;
        } else {
            // Knowingly using this response
            // * -var-delete
            // * -data-write-memory-bytes
            this.logger.log(`sendCommand: ${command} - empty mock response`);
            return undefined as unknown as T;
        }
    }
}

class AuxiliaryGdbProcessManager
    extends GDBFileSystemProcessManagerBase
    implements IGDBProcessManager
{
    public started = false;

    public async getVersion(
        _requestArgs?: LaunchRequestArguments | AttachRequestArguments
    ): Promise<string> {
        return '1.2.3';
    }

    public async start(
        _requestArgs: LaunchRequestArguments | AttachRequestArguments
    ): Promise<IStdioProcess> {
        this.started = true;
        const proc = {
            stdout: null,
            stdin: null,
            stderr: null,
            getPID: () => undefined,
            exitCode: null,
            signalCode: null,
            kill: () => true,
            on: (_event: 'error' | 'exit', _fn: any) => {
                return proc;
            },
        };
        return proc;
    }

    public async stop(): Promise<void> {
        this.started = false;
    }
}

class AuxiliaryGDBBackendFactory implements IGDBBackendFactory {
    // Expectation is that factory creates managers and backends alternatingly
    private createdManagers = 0;

    async createGDBManager(
        _session: GDBDebugSessionBase,
        _args: LaunchRequestArguments | AttachRequestArguments
    ): Promise<IGDBProcessManager> {
        const manager =
            this.createdManagers % 2 === 0
                ? new GDBFileSystemProcessManager()
                : new AuxiliaryGdbProcessManager();
        this.createdManagers++;
        return manager;
    }

    async createBackend(
        _session: GDBDebugSessionBase,
        manager: IGDBProcessManager,
        _args: LaunchRequestArguments | AttachRequestArguments,
        _name?: string
    ): Promise<IGDBBackend> {
        return manager instanceof AuxiliaryGdbProcessManager
            ? new AuxiliaryGDBBackend(manager, 'AUX-MOCK')
            : new GDBBackend(manager);
    }
}

class AuxiliaryGDBDebugSession extends GDBTargetDebugSession {
    constructor() {
        super(new AuxiliaryGDBBackendFactory());
    }
}

AuxiliaryGDBDebugSession.run(AuxiliaryGDBDebugSession);
