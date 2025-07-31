/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import EventEmitter from 'events';
import {
    MIBreakpointInsertOptions,
    MIBreakpointLocation,
    MIShowResponse,
} from '../mi';
import { VarManager } from '../varManager';
import { Readable, Writable } from 'stream';
import {
    AttachRequestArguments,
    LaunchRequestArguments,
    TargetAttachRequestArguments,
    TargetLaunchRequestArguments,
} from './session';
import { GDBDebugSessionBase } from '../gdb/GDBDebugSessionBase';

export type GetPIDType = { getPID: () => number | undefined };

export interface IStdioProcess {
    get stdin(): Writable | null;
    get stdout(): Readable | null;
    get stderr(): Readable | null;
    getPID: () => number | undefined;
    get exitCode(): number | null;
    get signalCode(): NodeJS.Signals | null;
    kill: (signal?: NodeJS.Signals) => boolean;
    on(
        event: 'exit',
        listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): this;
    on(event: 'error', listener: (err: Error) => void): this;
}

export interface IGDBProcessManager {
    getVersion(
        requestArgs?: LaunchRequestArguments | AttachRequestArguments
    ): Promise<string>;
    start: (
        requestArgs: LaunchRequestArguments | AttachRequestArguments
    ) => Promise<IStdioProcess>;
    stop: () => Promise<void>;
}

export interface IGDBServerProcessManager {
    start: (
        requestArgs: TargetLaunchRequestArguments
    ) => Promise<IStdioProcess>;
    stop: () => Promise<void>;
}

export interface IGDBBackendFactory {
    createGDBManager: (
        session: GDBDebugSessionBase,
        args: LaunchRequestArguments | AttachRequestArguments
    ) => Promise<IGDBProcessManager>;
    createBackend: (
        session: GDBDebugSessionBase,
        manager: IGDBProcessManager,
        args: LaunchRequestArguments | AttachRequestArguments
    ) => Promise<IGDBBackend>;
}

export interface IGDBServerFactory {
    createGDBServerManager: (
        args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ) => Promise<IGDBServerProcessManager>;
}

export interface IGDBBackend extends EventEmitter {
    get varManager(): VarManager;

    spawn(
        requestArgs: LaunchRequestArguments | AttachRequestArguments
    ): Promise<void>;

    setAsyncMode: (isSet?: boolean) => Promise<void>;

    getAsyncMode: () => boolean;

    setNonStopMode: (isSet?: boolean) => Promise<void>;

    isNonStopMode: () => boolean;

    isUseHWBreakpoint: () => boolean;

    // getBreakpointOptions called before inserting the breakpoint and this
    // method could overridden in derived classes to dynamically control the
    // breakpoint insert options. If an error thrown from this method, then
    // the breakpoint will not be inserted.
    getBreakpointOptions: (
        _: MIBreakpointLocation,
        initialOptions: MIBreakpointInsertOptions
    ) => Promise<MIBreakpointInsertOptions>;

    pause: (threadId?: number) => Promise<void> | void;

    sendEnablePrettyPrint: () => Promise<unknown>;

    sendFileExecAndSymbols: (program: string) => Promise<unknown>;

    sendFileSymbolFile: (symbols: string) => Promise<unknown>;

    sendAddSymbolFile: (symbols: string, offset: string) => Promise<unknown>;

    sendLoad: (
        imageFileName: string,
        imageOffset: string | undefined
    ) => Promise<unknown>;

    sendGDBSet: (params: string) => Promise<unknown>;

    sendGDBShow: (params: string) => Promise<MIShowResponse>;

    sendGDBExit: () => Promise<unknown>;

    isActive: () => boolean;

    sendCommand<T>(command: string): Promise<T>;
    sendCommands(commands?: string[]): Promise<void>;
    gdbVersionAtLeast(targetVersion: string): boolean;

    on(
        event: 'consoleStreamOutput',
        listener: (output: string, category: string) => void
    ): this;
    on(
        event: 'execAsync' | 'notifyAsync' | 'statusAsync' | 'resultAsync',
        listener: (asyncClass: string, data: any) => void
    ): this;
    on(
        event: 'exit',
        listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): this;

    emit(
        event: 'consoleStreamOutput',
        output: string,
        category: string
    ): boolean;
    emit(
        event: 'execAsync' | 'notifyAsync' | 'statusAsync' | 'resultAsync',
        asyncClass: string,
        data: any
    ): boolean;
    emit(
        event: 'exit',
        code: number | null,
        signal: NodeJS.Signals | null
    ): boolean;
}
