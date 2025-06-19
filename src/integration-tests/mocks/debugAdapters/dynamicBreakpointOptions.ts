#!/usr/bin/env node
/*********************************************************************
 * Copyright (c) 2023 Renesas Electronics Corporation and others
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
import {
    MIBreakpointLocation,
    MIBreakpointInsertOptions,
    MIBreakpointMode,
} from '../../../mi';
import { GDBFileSystemProcessManager } from '../../../desktop/processManagers/GDBFileSystemProcessManager';
import {
    AttachRequestArguments,
    LaunchRequestArguments,
} from '../../../types/session';
import {
    IGDBBackend,
    IGDBBackendFactory,
    IGDBProcessManager,
} from '../../../types/gdb';
import { GDBDebugSessionBase } from '../../../gdb/GDBDebugSessionBase';

process.on('uncaughtException', (err: any) => {
    logger.error(JSON.stringify(err));
});

// Breakpoint options to override
const hardwareBreakpointTrue = process.argv.includes(
    '--hardware-breakpoint-true'
);
const hardwareBreakpointFalse = process.argv.includes(
    '--hardware-breakpoint-false'
);

// Breakpoint mode to override
const breakpointModeIndex = process.argv.indexOf('--breakpoint-mode');
const breakpointMode =
    breakpointModeIndex < 0
        ? undefined
        : (process.argv[breakpointModeIndex + 1] as
              | MIBreakpointMode
              | undefined);

const throwError = process.argv.includes('--throw-error');

class DynamicBreakpointOptionsGDBBackend extends GDBBackend {
    public async getBreakpointOptions(
        _: MIBreakpointLocation,
        initialOptions: MIBreakpointInsertOptions
    ): Promise<MIBreakpointInsertOptions> {
        if (throwError) {
            throw new Error(
                'Some error message providing information that the breakpoint is not valid!'
            );
        }
        const hardware = hardwareBreakpointTrue
            ? true
            : hardwareBreakpointFalse
              ? false
              : initialOptions.hardware;
        const mode = breakpointMode ?? initialOptions.mode;
        return { ...initialOptions, mode, hardware };
    }
}

class DynamicBreakpointBackendFactory implements IGDBBackendFactory {
    async createGDBManager(
        _session: GDBDebugSessionBase,
        _args: LaunchRequestArguments | AttachRequestArguments
    ): Promise<IGDBProcessManager> {
        return new GDBFileSystemProcessManager();
    }

    async createBackend(
        _session: GDBDebugSessionBase,
        manager: IGDBProcessManager,
        _args: LaunchRequestArguments | AttachRequestArguments
    ): Promise<IGDBBackend> {
        return new DynamicBreakpointOptionsGDBBackend(manager);
    }
}

class DynamicBreakpointOptionsGDBDebugSession extends GDBTargetDebugSession {
    constructor() {
        super(new DynamicBreakpointBackendFactory());
    }
}

DynamicBreakpointOptionsGDBDebugSession.run(
    DynamicBreakpointOptionsGDBDebugSession
);
