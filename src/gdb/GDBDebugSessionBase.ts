/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import * as os from 'os';
import * as path from 'path';
import * as mi from '../mi';
import {
    BreakpointEvent,
    Handles,
    InitializedEvent,
    Logger,
    logger,
    LoggingDebugSession,
    OutputEvent,
    Scope,
    Source,
    StackFrame,
    TerminatedEvent,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ContinuedEvent } from '../events/continuedEvent';
import { StoppedEvent } from '../events/stoppedEvent';
import { VarObjType } from '../varManager';
import {
    FrameReference,
    VariableReference,
    LaunchRequestArguments,
    AttachRequestArguments,
    MemoryResponse,
    FrameVariableReference,
    RegisterVariableReference,
    GlobalVariableReference,
    StaticVariableReference,
    ObjectVariableReference,
    MemoryRequestArguments,
    CDTDisassembleArguments,
} from '../types/session';
import { IGDBBackend, IGDBBackendFactory } from '../types/gdb';
import { getInstructions } from '../util/disassembly';
import { calculateMemoryOffset } from '../util/calculateMemoryOffset';
import { isWindowsPath } from '../util/isWindowsPath';
import { sendResponseWithTimeout } from '../util/sendResponseWithTimeout';
import { DEFAULT_STEPPING_RESPONSE_TIMEOUT } from '../constants/session';

class ThreadWithStatus implements DebugProtocol.Thread {
    id: number;
    name: string;
    running: boolean;
    constructor(id: number, name: string, running: boolean) {
        this.id = id;
        this.name = name;
        this.running = running;
    }
}

/**
 * Keeps track of where in the configuration phase (between initialized event
 * and configurationDone response) we are.
 */
const enum ConfiguringState {
    /** Configuration phase has not started yet. */
    INITIAL,
    /** Configuration phase has started, target is running, no requests that
     * require pausing it have arrived yet. */
    CONFIGURING,
    /** Configuration phase has started, at least one request that requires
     * pausing the target has arrived or it has been paused to begin with. */
    CONFIGURING_PAUSED,
    /** Configuration phase is completed, the next unpausing is the one
     * associated with the end of the phase. */
    FINISHING,
    /** Configuration phase is completed, any following unpausing corresponds
     * to a pausing outside of the configuration phase. */
    DONE,
}

// Allow a single number for ignore count or the form '> [number]'
const ignoreCountRegex = /\s|>/g;
const arrayRegex = /.*\[[\d]+\].*/;
const arrayChildRegex = /[\d]+/;
const numberRegex = /^-?\d+(?:\.\d*)?$/; // match only numbers (integers and floats)
const cNumberTypeRegex = /\b(?:char|short|int|long|float|double)$/; // match C number types
const cBoolRegex = /\bbool$/; // match boolean

// Interface for output category pair
interface StreamOutput {
    output: string;
    category: string;
}

export function hexToBase64(hex: string): string {
    // The buffer will ignore incomplete bytes (unpaired digits), so we need to catch that early
    if (hex.length % 2 !== 0) {
        throw new Error('Received memory with incomplete bytes.');
    }
    const base64 = Buffer.from(hex, 'hex').toString('base64');
    // If the hex input includes characters that are not hex digits, Buffer.from() will return an empty buffer, and the base64 string will be empty.
    if (base64.length === 0 && hex.length !== 0) {
        throw new Error('Received ill-formed hex input: ' + hex);
    }
    return base64;
}

export function base64ToHex(base64: string): string {
    const buffer = Buffer.from(base64, 'base64');
    // The caller likely passed in a value that left dangling bits that couldn't be assigned to a full byte and so
    // were ignored by Buffer. We can't be sure what the client thought they wanted to do with those extra bits, so fail here.
    if (buffer.length === 0 || !buffer.toString('base64').startsWith(base64)) {
        throw new Error('Received ill-formed base64 input: ' + base64);
    }
    return buffer.toString('hex');
}

export abstract class GDBDebugSessionBase extends LoggingDebugSession {
    /**
     * Initial (aka default) configuration for launch/attach request
     * typically supplied with the --config command line argument.
     */
    protected static defaultRequestArguments?: any;

    /**
     * Frozen configuration for launch/attach request
     * typically supplied with the --config-frozen command line argument.
     */
    protected static frozenRequestArguments?: { request?: string };

    // A variable to store current source file the debugger stopped in. For global variables
    protected currentSourceFile: string = '';

    protected gdb!: IGDBBackend;
    protected isAttach = false;
    // isRunning === true means there are no threads stopped.
    protected isRunning = false;

    protected supportsRunInTerminalRequest = false;
    public supportsGdbConsole = false;

    /* A reference to the logger to be used by subclasses */
    protected logger: Logger.Logger;

    protected frameHandles = new Handles<FrameReference>();
    protected variableHandles = new Handles<VariableReference>();
    protected functionBreakpoints: string[] = [];
    protected logPointMessages: { [key: string]: string } = {};

    protected threads: ThreadWithStatus[] = [];

    // promise that resolves once the target stops so breakpoints can be inserted
    protected waitPausedPromise?: Promise<void>;
    // resolve function of waitPausedPromise while waiting, undefined otherwise
    protected waitPaused?: (value?: void | PromiseLike<void>) => void;
    // the thread id that we were waiting for
    protected waitPausedThreadId = 0;
    // set to true if the target was interrupted where inteneded, and should
    // therefore be resumed after breakpoints are inserted.
    protected waitPausedNeeded = false;
    // reference count of operations requiring pausing, to make sure only the
    // first of them pauses, and the last to complete resumes
    protected pauseCount = 0;
    // keeps track of where in the configuration phase (between initialize event
    // and configurationDone response) we are
    protected configuringState: ConfiguringState = ConfiguringState.INITIAL;
    protected isInitialized = false;

    /**
     *  customResetCommands from launch.json
     */
    protected customResetCommands?: string[];

    /**
     *  steppingResponseTimeout from launch.json
     */
    protected steppingResponseTimeout: number =
        DEFAULT_STEPPING_RESPONSE_TIMEOUT;

    constructor(protected readonly backendFactory: IGDBBackendFactory) {
        super();
        this.logger = logger;
    }

    /**
     * Apply the initial and frozen launch/attach request arguments.
     * @param request the default request type to return if request type is not frozen
     * @param args the arguments from the user to apply initial and frozen arguments to.
     * @returns resolved request type and the resolved arguments
     */
    protected applyRequestArguments(
        request: 'launch' | 'attach',
        args: LaunchRequestArguments | AttachRequestArguments
    ): ['launch' | 'attach', LaunchRequestArguments | AttachRequestArguments] {
        return [
            request,
            {
                ...args,
            },
        ];
    }

    /**
     * Handle requests not defined in the debug adapter protocol.
     */
    protected customRequest(
        command: string,
        response: DebugProtocol.Response,
        args: any
    ): void {
        if (command === 'cdt-gdb-adapter/Memory') {
            this.memoryRequest(response as MemoryResponse, args);
            // This custom request exists to allow tests in this repository to run arbitrary commands
            // Use at your own risk!
        } else if (command === 'cdt-gdb-tests/executeCommand') {
            const consoleOutput: string[] = [];
            const consoleOutputListener = (line: string) =>
                consoleOutput.push(line);
            // Listens the console output for test and controls purpose during the
            // test command execution. Boundry of the console output not guaranteed.
            this.gdb?.addListener('consoleStreamOutput', consoleOutputListener);
            this.gdb
                ?.sendCommand(args.command)
                .then((result) => {
                    response.body = {
                        status: 'Ok',
                        result,
                        console: consoleOutput,
                    };
                    this.sendResponse(response);
                })
                .catch((e) => {
                    const message =
                        e instanceof Error
                            ? e.message
                            : `Encountered a problem executing ${args.command}`;
                    this.sendErrorResponse(response, 1, message);
                })
                .finally(() => {
                    this.gdb?.removeListener(
                        'consoleStreamOutput',
                        consoleOutputListener
                    );
                });
        } else if (command === 'cdt-gdb-adapter/customReset') {
            this.customResetRequest(response);
        } else {
            return super.customRequest(command, response, args);
        }
    }

    /**
     * Apply the initial custom reset arguments.
     * @param args the arguments from the user to apply custom reset arguments to.
     */
    protected initializeSessionArguments(
        args: LaunchRequestArguments | AttachRequestArguments
    ) {
        this.customResetCommands = args.customResetCommands;
        this.steppingResponseTimeout =
            args.steppingResponseTimeout ?? DEFAULT_STEPPING_RESPONSE_TIMEOUT;
    }

    /**
     * Implement the custom reset request.
     */
    protected customResetRequest(response: DebugProtocol.Response) {
        if (this.customResetCommands) {
            this.gdb
                .sendCommands(this.customResetCommands)
                .then(() => this.sendResponse(response))
                .catch(() =>
                    this.sendErrorResponse(
                        response,
                        1,
                        'The custom reset command failed'
                    )
                );
        }
    }

    protected getBreakpointModes(): DebugProtocol.BreakpointMode[] | undefined {
        return [
            {
                label: 'Hardware Breakpoint',
                mode: 'hardware',
                appliesTo: ['source'],
            },
            {
                label: 'Software Breakpoint',
                mode: 'software',
                appliesTo: ['source'],
            },
        ];
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        this.supportsRunInTerminalRequest =
            args.supportsRunInTerminalRequest === true;
        this.supportsGdbConsole =
            os.platform() === 'linux' && this.supportsRunInTerminalRequest;
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = true;
        response.body.supportsSetVariable = true;
        response.body.supportsConditionalBreakpoints = true;
        response.body.supportsHitConditionalBreakpoints = true;
        response.body.supportsLogPoints = true;
        response.body.supportsFunctionBreakpoints = true;
        // response.body.supportsSetExpression = true;
        response.body.supportsDisassembleRequest = true;
        response.body.supportsReadMemoryRequest = true;
        response.body.supportsWriteMemoryRequest = true;
        response.body.supportsSteppingGranularity = true;
        response.body.supportsInstructionBreakpoints = true;
        response.body.supportsTerminateRequest = true;
        response.body.breakpointModes = this.getBreakpointModes();
        this.sendResponse(response);
    }

    private switchOutputToError(input: string, category: string): StreamOutput {
        const outputToError =
            'HW breakpoint limit reached, reduce set breakpoints';
        const returnPair: StreamOutput = input.startsWith(
            'Cannot insert hardware breakpoint'
        )
            ? { output: outputToError, category: 'stderr' }
            : { output: input, category: category };
        return returnPair;
    }

    protected async setupCommonLoggerAndBackends(
        args: LaunchRequestArguments | AttachRequestArguments
    ) {
        logger.setup(
            args.verbose ? Logger.LogLevel.Verbose : Logger.LogLevel.Warn,
            args.logFile || false
        );

        const manager = await this.backendFactory.createGDBManager(this, args);
        this.gdb = await this.backendFactory.createBackend(this, manager, args);

        this.gdb.on('consoleStreamOutput', (output, category) => {
            const messageToPrint = this.switchOutputToError(output, category);
            this.sendEvent(
                new OutputEvent(messageToPrint.output, messageToPrint.category)
            );
        });

        this.gdb.on('execAsync', (resultClass, resultData) =>
            this.handleGDBAsync(resultClass, resultData)
        );
        this.gdb.on('notifyAsync', (resultClass, resultData) =>
            this.handleGDBNotify(resultClass, resultData)
        );
    }

    protected async attachOrLaunchRequest(
        response: DebugProtocol.Response,
        request: 'launch' | 'attach',
        args: LaunchRequestArguments | AttachRequestArguments
    ) {
        await this.setupCommonLoggerAndBackends(args);

        await this.spawn(args);
        if (request == 'launch') {
            if (!args.program) {
                this.sendErrorResponse(
                    response,
                    1,
                    'The program must be specified in the request arguments'
                );
                return;
            }
        }
        if (args.program) {
            await this.gdb.sendFileExecAndSymbols(args.program);
        }
        await this.gdb.sendEnablePrettyPrint();

        if (request === 'attach') {
            this.isAttach = true;
            const attachArgs = args as AttachRequestArguments;
            await mi.sendTargetAttachRequest(this.gdb, {
                pid: attachArgs.processId,
            });
            this.sendEvent(
                new OutputEvent(`attached to process ${attachArgs.processId}`)
            );
        }

        await this.gdb.sendCommands(args.initCommands);

        if (request === 'launch') {
            const launchArgs = args as LaunchRequestArguments;
            if (launchArgs.arguments) {
                await mi.sendExecArguments(this.gdb, {
                    arguments: launchArgs.arguments,
                });
            }
        }
        this.sendInitializedEvent();
        this.sendResponse(response);
    }

    protected sendInitializedEvent() {
        if (this.isRunning) {
            this.configuringState = ConfiguringState.CONFIGURING;
        } else {
            this.configuringState = ConfiguringState.CONFIGURING_PAUSED;
            this.pauseCount++;
        }
        this.sendEvent(new InitializedEvent());
        this.isInitialized = true;
    }

    protected async attachRequest(
        response: DebugProtocol.AttachResponse,
        args: AttachRequestArguments
    ): Promise<void> {
        try {
            const [request, resolvedArgs] = this.applyRequestArguments(
                'attach',
                args
            );
            await this.attachOrLaunchRequest(response, request, resolvedArgs);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: LaunchRequestArguments
    ): Promise<void> {
        try {
            const [request, resolvedArgs] = this.applyRequestArguments(
                'launch',
                args
            );
            await this.attachOrLaunchRequest(response, request, resolvedArgs);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async spawn(
        args: LaunchRequestArguments | AttachRequestArguments
    ) {
        return this.gdb?.spawn(args);
    }

    /**
     * Sends a pause command to GDBBackend, and resolves when the debugger is
     * actually paused. The paused thread ID is saved to `this.waitPausedThreadId`.
     * @param requireAsync - require gdb to be in async mode to pause
     */
    protected async pauseIfNeeded(requireAsync?: false): Promise<void>;

    /**
     * Sends a pause command to GDBBackend, and resolves when the debugger is
     * actually paused. The paused thread ID is saved to `this.waitPausedThreadId`.
     *
     * @param requireAsync - require gdb to be in async mode to pause
     * @deprecated the `requireAsync` parameter should not be used and will be
     * removed in the future.
     * See {@link https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/339#discussion_r1840549671}
     */
    protected async pauseIfNeeded(requireAsync: true): Promise<void>;

    protected async pauseIfNeeded(requireAsync = false): Promise<void> {
        // If we are in the configuration phase and this is the first request
        // that requires pausing, add another pauseIfNeeded/continueIfNeeded
        // bracket around the whole phase so we don't unnecessarily pause/
        // continue more than once. Matching continueIfNeeded is in
        // configurationDoneRequest.
        if (this.configuringState === ConfiguringState.CONFIGURING) {
            this.configuringState = ConfiguringState.CONFIGURING_PAUSED;
            this.pauseIfNeeded(); // no need to await
        }

        this.pauseCount++;
        if (this.pauseCount === 1) {
            this.waitPausedNeeded =
                this.isRunning && (!requireAsync || this.gdb.getAsyncMode());
            if (this.waitPausedNeeded) {
                let prevResolve = this.waitPaused;
                this.waitPausedPromise = new Promise<void>((resolve) => {
                    this.waitPaused = resolve;
                });
                if (prevResolve) {
                    // We must have done pause, continue, pause before the stop
                    // notification from the first pause arrived, so the first
                    // pause is still waiting on its promise (or hasn't even gotten
                    // there yet because it's still awaiting the thread id) and we
                    // mustn't lose its resolve function, rather the next stop
                    // notification to arrive must resolve both promises, so
                    // daisy-chain it.
                    this.waitPausedPromise.then(prevResolve);
                    // Also, we should keep the same waitPausedthreadId.
                } else {
                    this.waitPausedThreadId = 0;
                }
                if (this.gdb.isNonStopMode()) {
                    if (this.waitPausedThreadId === 0) {
                        this.waitPausedThreadId =
                            await this.gdb.queryCurrentThreadId();
                    }
                    this.gdb.pause(this.waitPausedThreadId);
                } else {
                    this.gdb.pause();
                }
            }
        }

        // This promise resolves when handling GDBAsync for the "stopped"
        // result class, which indicates that the call to `GDBBackend::pause`
        // is actually finished.
        await this.waitPausedPromise;
    }

    protected async continueIfNeeded(): Promise<void> {
        if (this.pauseCount > 0) {
            this.pauseCount--;
            if (this.pauseCount === 0) {
                if (this.configuringState === ConfiguringState.FINISHING) {
                    this.configuringState = ConfiguringState.DONE;
                    if (this.isAttach) {
                        await mi.sendExecContinue(this.gdb);
                    } else {
                        await mi.sendExecRun(this.gdb);
                    }
                } else if (this.waitPausedNeeded) {
                    if (this.gdb.isNonStopMode()) {
                        await mi.sendExecContinue(
                            this.gdb,
                            this.waitPausedThreadId
                        );
                    } else {
                        await mi.sendExecContinue(this.gdb);
                    }
                }
            }
        }
    }

    private async getInstructionBreakpointList(): Promise<
        mi.MIBreakpointInfo[]
    > {
        // Get a list of existing bps, using gdb-mi command -break-list
        const existingBps = await mi.sendBreakList(this.gdb);
        // Filter out all instruction breakpoints
        const existingInstBreakpointsList =
            existingBps.BreakpointTable.body.filter(
                (bp) => bp['original-location']?.[0] === '*'
            );
        return existingInstBreakpointsList;
    }

    protected async setInstructionBreakpointsRequest(
        response: DebugProtocol.SetInstructionBreakpointsResponse,
        args: DebugProtocol.SetInstructionBreakpointsArguments
    ): Promise<void> {
        await this.pauseIfNeeded();
        // Get a list of existing instruction breakpoints
        const existingInstBreakpointsList =
            await this.getInstructionBreakpointList();

        // List of Instruction breakpoints from vscode
        const vscodeBreakpointsListBase = args.breakpoints;
        // adjust vscode breakpoint list to contain final locations, not base + offset
        const vscodeBreakpointsListFinal = vscodeBreakpointsListBase.map(
            (bp) => {
                const location = bp.offset
                    ? BigInt(bp.instructionReference) + BigInt(bp.offset)
                    : BigInt(bp.instructionReference);
                return '0x' + location.toString(16);
            }
        );

        // Create a list of breakpoints to be deleted
        const breaksToDelete = existingInstBreakpointsList.filter(
            (thisGDBBp) =>
                !vscodeBreakpointsListFinal.some((bp) => {
                    const breakpointAddress =
                        thisGDBBp['original-location']?.slice(1);
                    return (
                        breakpointAddress &&
                        BigInt(breakpointAddress) === BigInt(bp)
                    );
                })
        );
        const deletesInstBreakpoints = breaksToDelete.map(
            (thisGDBBp) => thisGDBBp.number
        );

        // Delete erased breakpoints from gdb
        if (deletesInstBreakpoints.length > 0) {
            await mi.sendBreakDelete(this.gdb, {
                breakpoints: deletesInstBreakpoints,
            });
            deletesInstBreakpoints.forEach(
                (breakpoint) => delete this.logPointMessages[breakpoint]
            );
        }

        // Create a set of existing breakpoints based on address for a more efficient lookup on existing breakpoints
        const existingInstBreakpointsSet = new Set(
            existingInstBreakpointsList
                .map((obj) =>
                    obj['original-location']?.slice(1) !== undefined
                        ? BigInt(obj['original-location']?.slice(1))
                        : undefined
                )
                .filter((num) => num !== undefined)
        );

        // Filter out breakpoints that needs to be created from existing breakpoints
        const instBreakpointsToBeCreated = vscodeBreakpointsListFinal.filter(
            (bp) => !existingInstBreakpointsSet.has(BigInt(bp))
        );

        // For every breakpoint in the instruction breakpoints, adjust the location (address) to be dereferenced
        for (const bp of instBreakpointsToBeCreated) {
            await mi.sendBreakpointInsert(this.gdb, '*' + bp);
        }

        /* Prepare response */

        // Get Instruction Breakpoints
        const gdbInstBps = await this.getInstructionBreakpointList();
        // Fill in breakpoints list to be sent as a response
        const actual: DebugProtocol.Breakpoint[] = gdbInstBps.map((bp) => {
            const responseBp: DebugProtocol.Breakpoint = {
                verified: bp.enabled === 'y',
                id: parseInt(bp.number, 10),
                line: bp['line'] ? parseInt(bp['line'], 10) : undefined,
                source: {
                    name: bp.fullname,
                    path: bp.file,
                },
                instructionReference: bp['original-location']?.slice(1),
            };
            return responseBp;
        });

        response.body = {
            breakpoints: actual,
        };
        // Send response
        this.sendResponse(response);
        await this.continueIfNeeded();
    }

    protected async setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): Promise<void> {
        await this.pauseIfNeeded();

        try {
            // Need to get the list of current breakpoints in the file and then make sure
            // that we end up with the requested set of breakpoints for that file
            // deleting ones not requested and inserting new ones.

            const result = await mi.sendBreakList(this.gdb);
            const file = args.source.path as string;
            const gdbOriginalLocationPrefix = await mi.sourceBreakpointLocation(
                this.gdb,
                file
            );
            const gdbbps = result.BreakpointTable.body.filter((gdbbp) => {
                // Ignore "children" breakpoint of <MULTIPLE> entries
                if (gdbbp.number.includes('.')) {
                    return false;
                }

                // Ignore other files
                if (!gdbbp['original-location']) {
                    return false;
                }
                // On Windows, perform case-insensitive comparison due to potential casing inconsistencies
                const isWinPath = isWindowsPath(file);
                const fileCmp = isWinPath ? file.toLowerCase() : file;
                const prefixCmp = isWinPath
                    ? gdbOriginalLocationPrefix.toLowerCase()
                    : gdbOriginalLocationPrefix;
                const origLocCmp = isWinPath
                    ? gdbbp['original-location'].toLowerCase()
                    : gdbbp['original-location'];

                if (
                    !(
                        origLocCmp.includes(prefixCmp) ||
                        origLocCmp.includes(fileCmp)
                    )
                ) {
                    return false;
                }

                // Ignore function breakpoints
                return this.functionBreakpoints.indexOf(gdbbp.number) === -1;
            });

            const { resolved, deletes } = this.resolveBreakpoints(
                args.breakpoints || [],
                gdbbps,
                (vsbp, gdbbp) => {
                    // Always invalidate hit conditions as they have a one-way mapping to gdb ignore and temporary
                    if (vsbp.hitCondition) {
                        return false;
                    }

                    // Ensure we can compare undefined and empty strings
                    const vsbpCond = vsbp.condition || undefined;
                    const gdbbpCond = gdbbp.cond || undefined;

                    const vsbpIsBreakpointTypeHardware = vsbp.mode
                        ? vsbp.mode === 'hardware'
                        : this.gdb.isUseHWBreakpoint();
                    const gdbbpIsBreakpointTypeHardware =
                        gdbbp.type === 'hw breakpoint';

                    // Check with original-location so that relocated breakpoints are properly matched
                    // Create a boolean variable to check if the breakpoint is in the right location
                    let isBreakpointInRightLocation = false;
                    // Check if the gdb breakpoint is in the same file being checked now
                    const isSameFileName = gdbbp['original-location']?.includes(
                        file
                    )
                        ? true
                        : false;
                    // Create a regex for gdb-mi original-location format (-source <file-name> -line <line-number>)
                    const regexMi = new RegExp('^-source.+-line\\s+([0-9]+)$');
                    // Create a regex for gdb-mi original-location format (<file-name>:<line-number>)
                    const regexWithoutMi = new RegExp('^.*:([0-9]+)$');
                    // Check if gdbbp original-location matches regexMI
                    const regexMatch =
                        gdbbp['original-location']?.match(regexMi) ??
                        gdbbp['original-location']?.match(regexWithoutMi);
                    if (regexMatch && isSameFileName) {
                        isBreakpointInRightLocation =
                            isSameFileName &&
                            regexMatch[1] === String(vsbp.line);
                    }

                    return !!(
                        isBreakpointInRightLocation &&
                        vsbpCond === gdbbpCond &&
                        vsbpIsBreakpointTypeHardware ===
                            gdbbpIsBreakpointTypeHardware
                    );
                }
            );

            // Delete before insert to avoid breakpoint clashes in gdb
            if (deletes.length > 0) {
                await mi.sendBreakDelete(this.gdb, { breakpoints: deletes });
                deletes.forEach(
                    (breakpoint) => delete this.logPointMessages[breakpoint]
                );
            }

            // Reset logPoints
            this.logPointMessages = {};

            // Set up logpoint messages and return a formatted breakpoint for the response body
            const createState = (
                vsbp: DebugProtocol.SourceBreakpoint,
                gdbbp: mi.MIBreakpointInfo
            ): DebugProtocol.Breakpoint => {
                if (vsbp.logMessage) {
                    this.logPointMessages[gdbbp.number] = vsbp.logMessage;
                }

                let line = 0;
                if (gdbbp.line) {
                    line = parseInt(gdbbp.line, 10);
                } else if (vsbp.line) {
                    line = vsbp.line;
                }

                return {
                    id: parseInt(gdbbp.number, 10),
                    line,
                    verified: true,
                };
            };

            const actual: DebugProtocol.Breakpoint[] = [];

            for (const bp of resolved) {
                if (bp.gdbbp) {
                    actual.push(createState(bp.vsbp, bp.gdbbp));
                    continue;
                }

                let temporary = false;
                let ignoreCount: number | undefined;
                const vsbp = bp.vsbp;
                if (vsbp.hitCondition !== undefined) {
                    ignoreCount = parseInt(
                        vsbp.hitCondition.replace(ignoreCountRegex, ''),
                        10
                    );
                    if (isNaN(ignoreCount)) {
                        this.sendEvent(
                            new OutputEvent(
                                `Unable to decode expression: ${vsbp.hitCondition}`
                            )
                        );
                        continue;
                    }

                    // Allow hit condition continuously above the count
                    temporary = !vsbp.hitCondition.startsWith('>');
                    if (temporary) {
                        // The expression is not 'greater than', decrease ignoreCount to match
                        ignoreCount--;
                    }
                }

                try {
                    const line = vsbp.line.toString();
                    const breakpointMode = vsbp.mode as
                        | mi.MIBreakpointMode
                        | undefined;
                    const options = await this.gdb.getBreakpointOptions(
                        {
                            locationType: 'source',
                            source: file,
                            line,
                        },
                        {
                            condition: vsbp.condition,
                            temporary,
                            ignoreCount,
                            mode: breakpointMode,
                            hardware: breakpointMode
                                ? breakpointMode === 'hardware'
                                : this.gdb.isUseHWBreakpoint(),
                        }
                    );
                    const gdbbp = await mi.sendSourceBreakpointInsert(
                        this.gdb,
                        file,
                        line,
                        options
                    );
                    actual.push(createState(vsbp, gdbbp.bkpt));
                } catch (err) {
                    actual.push({
                        verified: false,
                        message:
                            err instanceof Error ? err.message : String(err),
                    } as DebugProtocol.Breakpoint);
                }
            }

            response.body = {
                breakpoints: actual,
            };

            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }

        await this.continueIfNeeded();
    }

    protected async setFunctionBreakPointsRequest(
        response: DebugProtocol.SetFunctionBreakpointsResponse,
        args: DebugProtocol.SetFunctionBreakpointsArguments
    ) {
        await this.pauseIfNeeded();

        try {
            const result = await mi.sendBreakList(this.gdb);
            const gdbbps = result.BreakpointTable.body.filter((gdbbp) => {
                // Only function breakpoints
                return this.functionBreakpoints.indexOf(gdbbp.number) > -1;
            });

            const { resolved, deletes } = this.resolveBreakpoints(
                args.breakpoints,
                gdbbps,
                (vsbp, gdbbp) => {
                    // Always invalidate hit conditions as they have a one-way mapping to gdb ignore and temporary
                    if (vsbp.hitCondition) {
                        return false;
                    }

                    // Ensure we can compare undefined and empty strings
                    const vsbpCond = vsbp.condition || undefined;
                    const gdbbpCond = gdbbp.cond || undefined;

                    const originalLocation = mi.functionBreakpointLocation(
                        this.gdb,
                        vsbp.name
                    );
                    return !!(
                        gdbbp['original-location'] === originalLocation &&
                        vsbpCond === gdbbpCond
                    );
                }
            );

            // Delete before insert to avoid breakpoint clashes in gdb
            if (deletes.length > 0) {
                await mi.sendBreakDelete(this.gdb, { breakpoints: deletes });
                this.functionBreakpoints = this.functionBreakpoints.filter(
                    (fnbp) => deletes.indexOf(fnbp) === -1
                );
            }

            const createActual = (
                breakpoint: mi.MIBreakpointInfo
            ): DebugProtocol.Breakpoint => ({
                id: parseInt(breakpoint.number, 10),
                verified: true,
            });

            const actual: DebugProtocol.Breakpoint[] = [];
            // const actual = existing.map((bp) => createActual(bp.gdbbp));

            for (const bp of resolved) {
                if (bp.gdbbp) {
                    actual.push(createActual(bp.gdbbp));
                    continue;
                }

                try {
                    const options = await this.gdb.getBreakpointOptions(
                        {
                            locationType: 'function',
                            fn: bp.vsbp.name,
                        },
                        {
                            hardware: this.gdb.isUseHWBreakpoint(),
                        }
                    );
                    const gdbbp = await mi.sendFunctionBreakpointInsert(
                        this.gdb,
                        bp.vsbp.name,
                        options
                    );
                    this.functionBreakpoints.push(gdbbp.bkpt.number);
                    actual.push(createActual(gdbbp.bkpt));
                } catch (err) {
                    actual.push({
                        verified: false,
                        message:
                            err instanceof Error ? err.message : String(err),
                    } as DebugProtocol.Breakpoint);
                }
            }

            response.body = {
                breakpoints: actual,
            };

            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }

        await this.continueIfNeeded();
    }

    /**
     * Resolved which VS breakpoints needs to be installed, which
     * GDB breakpoints need to be deleted and which VS breakpoints
     * are already installed with which matching GDB breakpoint.
     * @param vsbps VS DAP breakpoints
     * @param gdbbps GDB breakpoints
     * @param matchFn matcher to compare VS and GDB breakpoints
     * @returns resolved -> array maintaining order of vsbps that identifies whether
     * VS breakpoint has a cooresponding GDB breakpoint (gdbbp field set) or needs to be
     * inserted (gdbbp field empty)
     * deletes -> GDB bps ids that should be deleted because they don't match vsbps
     */
    protected resolveBreakpoints<T>(
        vsbps: T[],
        gdbbps: mi.MIBreakpointInfo[],
        matchFn: (vsbp: T, gdbbp: mi.MIBreakpointInfo) => boolean
    ): {
        resolved: Array<{ vsbp: T; gdbbp?: mi.MIBreakpointInfo }>;
        deletes: string[];
    } {
        const resolved: Array<{ vsbp: T; gdbbp?: mi.MIBreakpointInfo }> =
            vsbps.map((vsbp) => {
                return {
                    vsbp,
                    gdbbp: gdbbps.find((gdbbp) => matchFn(vsbp, gdbbp)),
                };
            });

        const deletes = gdbbps
            .filter((gdbbp) => {
                return !vsbps.find((vsbp) => matchFn(vsbp, gdbbp));
            })
            .map((gdbbp) => gdbbp.number);

        return { resolved, deletes };
    }

    protected async configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        _args: DebugProtocol.ConfigurationDoneArguments
    ): Promise<void> {
        try {
            this.sendEvent(
                new OutputEvent(
                    '\n' +
                        'In the Debug Console view you can interact directly with GDB.\n' +
                        'To display the value of an expression, type that expression which can reference\n' +
                        "variables that are in scope. For example type '2 + 3' or the name of a variable.\n" +
                        "Arbitrary commands can be sent to GDB by prefixing the input with a '>',\n" +
                        "for example type '>show version' or '>help'.\n" +
                        '\n',
                    'console'
                )
            );
            if (this.configuringState === ConfiguringState.CONFIGURING_PAUSED) {
                this.configuringState = ConfiguringState.FINISHING;
                await this.continueIfNeeded();
            } else {
                this.configuringState = ConfiguringState.DONE;
            }
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                100,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected convertThread(thread: mi.MIThreadInfo) {
        let name = thread.name || thread.id;

        if (thread.details) {
            name += ` (${thread.details})`;
        }

        const running = thread.state === 'running';

        return new ThreadWithStatus(parseInt(thread.id, 10), name, running);
    }

    protected async threadsRequest(
        response: DebugProtocol.ThreadsResponse
    ): Promise<void> {
        try {
            if (!this.isRunning) {
                const result = await mi.sendThreadInfoRequest(this.gdb, {});
                this.threads = result.threads
                    .map((thread) => this.convertThread(thread))
                    .sort((a, b) => a.id - b.id);
            }

            response.body = {
                threads: this.threads,
            };

            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): Promise<void> {
        try {
            const threadId = args.threadId;
            const depthResult = await mi.sendStackInfoDepth(this.gdb, {
                maxDepth: 100,
                threadId,
            });
            const depth = parseInt(depthResult.depth, 10);
            const levels = args.levels
                ? args.levels > depth
                    ? depth
                    : args.levels
                : depth;
            const lowFrame = args.startFrame || 0;
            const highFrame = lowFrame + levels - 1;
            const listResult = await mi.sendStackListFramesRequest(this.gdb, {
                lowFrame,
                highFrame,
                threadId,
            });

            const stack = listResult.stack.map((frame) => {
                let source;
                if (frame.fullname) {
                    source = new Source(
                        path.basename(frame.file || frame.fullname),
                        frame.fullname
                    );
                }
                let line;
                if (frame.line) {
                    line = parseInt(frame.line, 10);
                }
                const frameHandle = this.frameHandles.create({
                    threadId: args.threadId,
                    frameId: parseInt(frame.level, 10),
                });
                const name = frame.func || frame.fullname || '';
                const sf = new StackFrame(
                    frameHandle,
                    name,
                    source,
                    line
                ) as DebugProtocol.StackFrame;
                sf.instructionPointerReference = frame.addr;
                return sf;
            });

            response.body = {
                stackFrames: stack,
                totalFrames: depth,
            };

            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async nextRequest(
        response: DebugProtocol.NextResponse,
        args: DebugProtocol.NextArguments
    ): Promise<void> {
        return sendResponseWithTimeout({
            execute: async () => {
                await (args.granularity === 'instruction'
                    ? mi.sendExecNextInstruction(this.gdb, args.threadId)
                    : mi.sendExecNext(this.gdb, args.threadId));
            },
            onResponse: () => {
                this.sendResponse(response);
            },
            onError: (err) => {
                const errorMessage =
                    err instanceof Error ? err.message : String(err);

                this.sendEvent(
                    new OutputEvent(
                        `Error occurred during the nextRequest: ${errorMessage}\n`,
                        'console'
                    )
                );
                this.sendErrorResponse(response, 1, errorMessage);
            },
            timeout: this.steppingResponseTimeout,
        });
    }

    protected async stepInRequest(
        response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments
    ): Promise<void> {
        return sendResponseWithTimeout({
            execute: async () => {
                await (args.granularity === 'instruction'
                    ? mi.sendExecStepInstruction(this.gdb, args.threadId)
                    : mi.sendExecStep(this.gdb, args.threadId));
            },
            onResponse: () => {
                this.sendResponse(response);
            },
            onError: (err) => {
                const errorMessage =
                    err instanceof Error ? err.message : String(err);

                this.sendEvent(
                    new OutputEvent(
                        `Error occurred during the stepInRequest: ${errorMessage}\n`,
                        'console'
                    )
                );
                this.sendErrorResponse(response, 1, errorMessage);
            },
            timeout: this.steppingResponseTimeout,
        });
    }

    protected async stepOutRequest(
        response: DebugProtocol.StepOutResponse,
        args: DebugProtocol.StepOutArguments
    ): Promise<void> {
        return sendResponseWithTimeout({
            execute: async () => {
                await mi.sendExecFinish(this.gdb, {
                    threadId: args.threadId,
                    frameId: 0,
                });
            },
            onResponse: () => {
                this.sendResponse(response);
            },
            onError: (err) => {
                const errorMessage =
                    err instanceof Error ? err.message : String(err);

                this.sendEvent(
                    new OutputEvent(
                        `Error occurred during the stepOutRequest: ${errorMessage}\n`,
                        'console'
                    )
                );
                this.sendErrorResponse(response, 1, errorMessage);
            },
            timeout: this.steppingResponseTimeout,
        });
    }

    protected async continueRequest(
        response: DebugProtocol.ContinueResponse,
        args: DebugProtocol.ContinueArguments
    ): Promise<void> {
        try {
            await mi.sendExecContinue(this.gdb, args.threadId);
            let isAllThreadsContinued;
            if (this.gdb.isNonStopMode()) {
                isAllThreadsContinued = args.threadId ? false : true;
            } else {
                isAllThreadsContinued = true;
            }
            response.body = {
                allThreadsContinued: isAllThreadsContinued,
            };
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async pauseRequest(
        response: DebugProtocol.PauseResponse,
        args: DebugProtocol.PauseArguments
    ): Promise<void> {
        try {
            this.gdb.pause(args.threadId);
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments
    ): void {
        const frameVarRef: FrameVariableReference = {
            type: 'frame',
            frameHandle: args.frameId,
        };

        const registers: RegisterVariableReference = {
            type: 'registers',
            frameHandle: args.frameId,
        };

        const globals: GlobalVariableReference = {
            type: 'globals',
            frameHandle: args.frameId,
        };

        const statics: StaticVariableReference = {
            type: 'statics',
            frameHandle: args.frameId,
        };

        response.body = {
            scopes: [
                new Scope(
                    'Local',
                    this.variableHandles.create(frameVarRef),
                    false
                ),
                new Scope('Global', this.variableHandles.create(globals), true),
                new Scope('Static', this.variableHandles.create(statics), true),
                new Scope(
                    'Registers',
                    this.variableHandles.create(registers),
                    true
                ),
            ],
        };

        this.sendResponse(response);
    }

    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments
    ): Promise<void> {
        const variables = new Array<DebugProtocol.Variable>();
        response.body = {
            variables,
        };
        try {
            const ref = this.variableHandles.get(args.variablesReference);
            if (!ref) {
                this.sendResponse(response);
                return;
            }
            if (ref.type === 'registers') {
                response.body.variables =
                    await this.handleVariableRequestRegister(ref);
            } else if (ref.type === 'frame') {
                response.body.variables =
                    await this.handleVariableRequestFrame(ref);
            } else if (ref.type === 'object') {
                response.body.variables =
                    await this.handleVariableRequestObject(ref);
            } else if (ref.type === 'globals') {
                response.body.variables =
                    await this.handleVariableRequestGlobal();
            } else if (ref.type === 'statics') {
                response.body.variables =
                    await this.handleVariableRequestStatic();
            }
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async setVariableRequest(
        response: DebugProtocol.SetVariableResponse,
        args: DebugProtocol.SetVariableArguments
    ): Promise<void> {
        try {
            const ref = this.variableHandles.get(args.variablesReference);
            if (!ref) {
                this.sendResponse(response);
                return;
            }
            const frameRef = this.frameHandles.get(ref.frameHandle);
            if (!frameRef) {
                this.sendResponse(response);
                return;
            }
            const parentVarname = ref.type === 'object' ? ref.varobjName : '';
            const varname =
                parentVarname +
                (parentVarname === '' ? '' : '.') +
                args.name.replace(/^\[(\d+)\]/, '$1');
            const stackDepth = await mi.sendStackInfoDepth(this.gdb, {
                maxDepth: 100,
            });
            const depth = parseInt(stackDepth.depth, 10);
            let varobj = this.gdb.varManager.getVar(
                frameRef,
                depth,
                varname,
                ref.type
            );
            if (!varobj && ref.type === 'registers') {
                const varCreateResponse = await mi.sendVarCreate(this.gdb, {
                    expression: '$' + args.name,
                    frameRef,
                });
                varobj = this.gdb.varManager.addVar(
                    frameRef,
                    depth,
                    args.name,
                    false,
                    false,
                    varCreateResponse,
                    ref.type
                );
                await mi.sendVarSetFormatToHex(this.gdb, varobj.varname);
            }
            let assign;
            if (varobj) {
                assign = await mi.sendVarAssign(this.gdb, {
                    varname: varobj.varname,
                    expression: args.value,
                });
            } else {
                try {
                    assign = await mi.sendVarAssign(this.gdb, {
                        varname,
                        expression: args.value,
                    });
                } catch (err) {
                    if (parentVarname === '') {
                        throw err; // no recovery possible
                    }
                    const children = await mi.sendVarListChildren(this.gdb, {
                        name: parentVarname,
                        printValues: mi.MIVarPrintValues.all,
                    });
                    for (const child of children.children) {
                        if (this.isChildOfClass(child)) {
                            const grandchildVarname =
                                child.name +
                                '.' +
                                args.name.replace(/^\[(\d+)\]/, '$1');
                            varobj = this.gdb.varManager.getVar(
                                frameRef,
                                depth,
                                grandchildVarname
                            );
                            try {
                                assign = await mi.sendVarAssign(this.gdb, {
                                    varname: grandchildVarname,
                                    expression: args.value,
                                });
                                break;
                            } catch {
                                continue; // try another child
                            }
                        }
                    }
                    if (!assign) {
                        throw err; // no recovery possible
                    }
                }
            }
            response.body = {
                value: assign.value,
                type: varobj ? varobj.type : undefined,
                variablesReference:
                    varobj && parseInt(varobj.numchild, 10) > 0
                        ? this.variableHandles.create({
                              type: 'object',
                              frameHandle: ref.frameHandle,
                              varobjName: varobj.varname,
                          })
                        : 0,
            };
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
        this.sendResponse(response);
    }

    // protected async setExpressionRequest(response: DebugProtocol.SetExpressionResponse,
    //                                      args: DebugProtocol.SetExpressionArguments): Promise<void> {
    //     logger.error('got setExpressionRequest');
    //     this.sendResponse(response);
    // }

    protected async evaluateRequestGdbCommand(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments,
        frameRef: FrameReference | undefined
    ): Promise<void> {
        if (args.expression[1] === '-') {
            await this.gdb.sendCommand(args.expression.slice(1));
        } else {
            await mi.sendInterpreterExecConsole(this.gdb, {
                frameRef,
                command: args.expression.slice(1),
            });
        }
        response.body = {
            result: '\r',
            variablesReference: 0,
        };
        this.sendResponse(response);
        return;
    }

    private async isInstructionBreakpoint(
        breakpointNumber: string
    ): Promise<boolean> {
        // Get instruction breakpoint list
        const existingInstBreakpointsList =
            await this.getInstructionBreakpointList();

        // Check if breakpoint is part of instruction breakpoints
        const isInstructionBp = existingInstBreakpointsList.some(
            (bp) => parseInt(bp.number) === parseInt(breakpointNumber)
        );
        return isInstructionBp;
    }

    protected async evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ): Promise<void> {
        return this.doEvaluateRequest(response, args, false);
    }

    protected async doEvaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments,
        alwaysAllowCliCommand: boolean // if true, allows evaluation of expression without a frameId
    ): Promise<void> {
        response.body = {
            result: 'Error: could not evaluate expression',
            variablesReference: 0,
        }; // default response
        try {
            const allowCliCommand =
                alwaysAllowCliCommand && args.expression.startsWith('>');

            if (!allowCliCommand && args.frameId === undefined) {
                throw new Error(
                    'Evaluation of expression without frameId is not supported.'
                );
            }

            const frameRef = args.frameId
                ? this.frameHandles.get(args.frameId)
                : undefined;

            if (!allowCliCommand && !frameRef) {
                this.sendResponse(response);
                return;
            }

            if (args.expression.startsWith('>') && args.context === 'repl') {
                const regexDisable = new RegExp(
                    '^\\s*disable\\s*(?:(?:breakpoint|count|delete|once)\\d*)?\\s*\\d*\\s*$'
                );
                const regexEnable = new RegExp(
                    '^\\s*enable\\s*(?:(?:breakpoint|count|delete|once)\\d*)?\\s*\\d*\\s*$'
                );
                const regexDelete = new RegExp(
                    '^\\s*(?:d|del|delete)\\s+(?:breakpoints\\s+)?(\\d+)?\\s*$'
                );
                if (
                    args.expression.slice(1).search(regexDisable) != -1 ||
                    args.expression.slice(1).search(regexEnable) != -1
                ) {
                    this.sendEvent(
                        new OutputEvent(
                            'warning: "enable" and "disable" commands cannot be reflected in the GUI',
                            'stdout'
                        )
                    );
                }
                const deleteRegexMatch = args.expression
                    .slice(1)
                    .match(regexDelete);
                if (deleteRegexMatch) {
                    if (
                        await this.isInstructionBreakpoint(deleteRegexMatch[1])
                    ) {
                        this.sendEvent(
                            new OutputEvent(
                                'warning: "delete" command not working for IDE instruction breakpoints, please delete from GUI',
                                'stdout'
                            )
                        );
                    }
                }
                return await this.evaluateRequestGdbCommand(
                    response,
                    args,
                    frameRef
                );
            }

            const stackDepth = await mi.sendStackInfoDepth(this.gdb, {
                maxDepth: 100,
            });
            const depth = parseInt(stackDepth.depth, 10);
            let varobj = this.gdb.varManager.getVar(
                frameRef,
                depth,
                args.expression
            );
            if (!varobj) {
                const varCreateResponse = await mi.sendVarCreate(this.gdb, {
                    expression: args.expression,
                    frameRef,
                });
                varobj = this.gdb.varManager.addVar(
                    frameRef,
                    depth,
                    args.expression,
                    false,
                    false,
                    varCreateResponse
                );
            } else {
                const vup = await mi.sendVarUpdate(this.gdb, {
                    name: varobj.varname,
                });
                const update = vup.changelist[0];
                if (update) {
                    if (update.in_scope === 'true') {
                        if (update.name === varobj.varname) {
                            varobj.value = update.value;
                        }
                    } else {
                        this.gdb.varManager.removeVar(
                            frameRef,
                            depth,
                            varobj.varname
                        );
                        await mi.sendVarDelete(this.gdb, {
                            varname: varobj.varname,
                        });
                        const varCreateResponse = await mi.sendVarCreate(
                            this.gdb,
                            {
                                expression: args.expression,
                                frameRef,
                            }
                        );
                        varobj = this.gdb.varManager.addVar(
                            frameRef,
                            depth,
                            args.expression,
                            false,
                            false,
                            varCreateResponse
                        );
                    }
                }
            }
            if (varobj && args.frameId != undefined) {
                const result =
                    args.context === 'variables' && Number(varobj.numchild)
                        ? await this.getChildElements(varobj, args.frameId)
                        : varobj.value;
                response.body = {
                    result,
                    type: varobj.type,
                    variablesReference:
                        parseInt(varobj.numchild, 10) > 0
                            ? this.variableHandles.create({
                                  type: 'object',
                                  frameHandle: args.frameId,
                                  varobjName: varobj.varname,
                              })
                            : 0,
                };
            }

            this.sendResponse(response);
        } catch (err) {
            if (err instanceof Error && err.message.includes('var-create')) {
                if (args.context === 'hover') {
                    response.success = false;
                }
                this.sendResponse(response);
            } else {
                this.sendErrorResponse(
                    response,
                    1,
                    err instanceof Error ? err.message : String(err)
                );
            }
        }
    }

    protected async getChildElements(varobj: VarObjType, frameHandle: number) {
        if (Number(varobj.numchild) > 0) {
            const objRef: ObjectVariableReference = {
                type: 'object',
                frameHandle: frameHandle,
                varobjName: varobj.varname,
            };
            const childVariables: DebugProtocol.Variable[] =
                await this.handleVariableRequestObject(objRef);
            const value = arrayChildRegex.test(varobj.type)
                ? childVariables.map<string | number | boolean>((child) =>
                      this.convertValue(child)
                  )
                : childVariables.reduce<
                      Record<string, string | number | boolean>
                  >(
                      (accum, child) => (
                          (accum[child.name] = this.convertValue(child)),
                          accum
                      ),
                      {}
                  );
            return JSON.stringify(value, null, 2);
        }
        return varobj.value;
    }

    protected convertValue(variable: DebugProtocol.Variable) {
        const varValue = variable.value;
        const varType = String(variable.type);
        if (cNumberTypeRegex.test(varType)) {
            if (numberRegex.test(varValue)) {
                return Number(varValue);
            } else {
                // probably a string/other representation
                return String(varValue);
            }
        } else if (cBoolRegex.test(varType)) {
            return Boolean(varValue);
        } else {
            return varValue;
        }
    }

    /**
     * Implement the cdt-gdb-adapter/Memory request.
     */
    protected async memoryRequest(response: MemoryResponse, args: any) {
        try {
            if (typeof args.address !== 'string') {
                throw new Error(
                    `Invalid type for 'address', expected string, got ${typeof args.address}`
                );
            }

            if (typeof args.length !== 'number') {
                throw new Error(
                    `Invalid type for 'length', expected number, got ${typeof args.length}`
                );
            }

            if (
                typeof args.offset !== 'number' &&
                typeof args.offset !== 'undefined'
            ) {
                throw new Error(
                    `Invalid type for 'offset', expected number or undefined, got ${typeof args.offset}`
                );
            }

            const typedArgs = args as MemoryRequestArguments;

            const result = await mi.sendDataReadMemoryBytes(
                this.gdb,
                typedArgs.address,
                typedArgs.length,
                typedArgs.offset
            );
            response.body = {
                data: result.memory[0].contents,
                address: result.memory[0].begin,
            };
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async disassembleRequest(
        response: DebugProtocol.DisassembleResponse,
        args: CDTDisassembleArguments
    ) {
        try {
            if (!args.memoryReference) {
                throw new Error('Target memory reference is not specified!');
            }
            const instructionStartOffset = args.instructionOffset ?? 0;
            const instructionEndOffset =
                args.instructionCount + instructionStartOffset;
            const instructions: DebugProtocol.DisassembledInstruction[] = [];
            const memoryReference =
                args.offset === undefined
                    ? args.memoryReference
                    : calculateMemoryOffset(args.memoryReference, args.offset);

            if (instructionStartOffset < 0) {
                // Getting lower memory area
                const list = await getInstructions(
                    this.gdb,
                    memoryReference,
                    instructionStartOffset
                );

                // Add them to instruction list
                instructions.push(...list);
            }

            if (instructionEndOffset > 0) {
                // Getting higher memory area
                const list = await getInstructions(
                    this.gdb,
                    memoryReference,
                    instructionEndOffset
                );

                // Add them to instruction list
                instructions.push(...list);
            }

            response.body = {
                instructions,
            };
            this.sendResponse(response);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.sendEvent(new OutputEvent(`Error: ${message}`));
            this.sendErrorResponse(response, 1, message);
        }
    }

    protected async readMemoryRequest(
        response: DebugProtocol.ReadMemoryResponse,
        args: DebugProtocol.ReadMemoryArguments
    ): Promise<void> {
        try {
            if (args.count) {
                const result = await mi.sendDataReadMemoryBytes(
                    this.gdb,
                    args.memoryReference,
                    args.count,
                    args.offset
                );
                response.body = {
                    data: hexToBase64(result.memory[0].contents),
                    address: result.memory[0].begin,
                };
                this.sendResponse(response);
            } else {
                this.sendResponse(response);
            }
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    /**
     * Implement the memoryWrite request.
     */
    protected async writeMemoryRequest(
        response: DebugProtocol.WriteMemoryResponse,
        args: DebugProtocol.WriteMemoryArguments
    ) {
        try {
            const { memoryReference, data } = args;
            const typeofAddress = typeof memoryReference;
            const typeofContent = typeof data;
            if (typeofAddress !== 'string') {
                throw new Error(
                    `Invalid type for 'address', expected string, got ${typeofAddress}`
                );
            }
            if (typeofContent !== 'string') {
                throw new Error(
                    `Invalid type for 'content', expected string, got ${typeofContent}`
                );
            }
            const hexContent = base64ToHex(data);
            await mi.sendDataWriteMemoryBytes(
                this.gdb,
                memoryReference,
                hexContent
            );
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected async disconnectRequest(
        response: DebugProtocol.DisconnectResponse,
        _args: DebugProtocol.DisconnectArguments
    ): Promise<void> {
        try {
            await this.gdb.sendGDBExit();
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(
                response,
                1,
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    protected sendStoppedEvent(
        reason: string,
        threadId: number,
        allThreadsStopped?: boolean
    ) {
        // Reset frame handles and variables for new context
        this.frameHandles.reset();
        this.variableHandles.reset();
        // Send the event
        this.sendEvent(new StoppedEvent(reason, threadId, allThreadsStopped));
    }

    protected handleGDBStopped(result: any) {
        const getThreadId = (resultData: any) =>
            parseInt(resultData['thread-id'], 10);
        const getAllThreadsStopped = (resultData: any) => {
            return (
                !!resultData['stopped-threads'] &&
                resultData['stopped-threads'] === 'all'
            );
        };

        switch (result.reason) {
            case 'exited':
            case 'exited-normally':
                this.sendEvent(new TerminatedEvent());
                break;
            case 'breakpoint-hit':
                if (this.logPointMessages[result.bkptno]) {
                    this.sendEvent(
                        new OutputEvent(this.logPointMessages[result.bkptno])
                    );
                    mi.sendExecContinue(this.gdb);
                } else {
                    const reason =
                        this.functionBreakpoints.indexOf(result.bkptno) > -1
                            ? 'function breakpoint'
                            : 'breakpoint';
                    this.sendStoppedEvent(
                        reason,
                        getThreadId(result),
                        getAllThreadsStopped(result)
                    );
                }
                break;
            case 'end-stepping-range':
            case 'function-finished':
                this.sendStoppedEvent(
                    'step',
                    getThreadId(result),
                    getAllThreadsStopped(result)
                );
                break;
            case 'signal-received': {
                const name = result['signal-name'] || 'signal';
                this.sendStoppedEvent(
                    name,
                    getThreadId(result),
                    getAllThreadsStopped(result)
                );
                break;
            }
            default:
                this.sendStoppedEvent(
                    'generic',
                    getThreadId(result),
                    getAllThreadsStopped(result)
                );
        }
    }

    protected sendContinuedEvent(
        threadId: number,
        allThreadsContinued?: boolean
    ) {
        // Reset frame handles and variables for new context
        this.frameHandles.reset();
        this.variableHandles.reset();
        // Send the event
        this.sendEvent(new ContinuedEvent(threadId, allThreadsContinued));
    }

    protected handleGDBResume(result: any) {
        const getThreadId = (resultData: any) => {
            return parseInt(resultData['thread-id'], 10);
        };
        const getAllThreadsContinued = (resultData: any) => {
            return (
                !!resultData['thread-id'] && resultData['thread-id'] === 'all'
            );
        };

        const isAllThreadsContinued = getAllThreadsContinued(result);
        if (isAllThreadsContinued) {
            // If all threads continued, then the value of the 'thread-id' is 'all',
            // hence, there isn't a thread id number. We are sending the id of the first
            // thread in the thread list along with the allThreadsContinued=true information.
            // Theoratically, at least we need to have a single thread; for any unexpected case,
            // we are sending thread id as '1'.
            const id = this.threads[0]?.id;
            return this.sendContinuedEvent(id !== undefined ? id : 1, true);
        }
        return this.sendContinuedEvent(getThreadId(result));
    }

    protected handleGDBAsync(resultClass: string, resultData: any) {
        const updateIsRunning = () => {
            this.isRunning = this.threads.length ? true : false;
            for (const thread of this.threads) {
                if (!thread.running) {
                    this.isRunning = false;
                }
            }
        };
        switch (resultClass) {
            case 'running':
                if (this.gdb.isNonStopMode()) {
                    const rawId = resultData['thread-id'];
                    const id = parseInt(rawId, 10);
                    for (const thread of this.threads) {
                        if (thread.id === id || rawId === 'all') {
                            thread.running = true;
                        }
                    }
                } else {
                    for (const thread of this.threads) {
                        thread.running = true;
                    }
                }
                updateIsRunning();
                if (this.isInitialized) {
                    this.handleGDBResume(resultData);
                }
                break;
            case 'stopped': {
                let suppressHandleGDBStopped = false;
                this.currentSourceFile = resultData.frame.fullname;
                if (this.gdb.isNonStopMode()) {
                    const id = parseInt(resultData['thread-id'], 10);
                    for (const thread of this.threads) {
                        if (thread.id === id) {
                            thread.running = false;
                        }
                    }
                    if (
                        this.waitPaused &&
                        resultData.reason === 'signal-received' &&
                        (this.waitPausedThreadId === id ||
                            this.waitPausedThreadId === -1)
                    ) {
                        suppressHandleGDBStopped = true;
                    }
                } else {
                    for (const thread of this.threads) {
                        thread.running = false;
                    }
                    if (
                        this.waitPaused &&
                        resultData.reason === 'signal-received'
                    ) {
                        suppressHandleGDBStopped = true;
                    }
                }

                if (this.waitPaused) {
                    if (!suppressHandleGDBStopped) {
                        // if we aren't suppressing the stopped event going
                        // to the client, then we also musn't resume the
                        // target after inserting the breakpoints
                        this.waitPausedNeeded = false;
                    }
                    this.waitPaused();
                    this.waitPaused = undefined;
                }

                const wasRunning = this.isRunning;
                updateIsRunning();
                if (
                    !suppressHandleGDBStopped &&
                    (this.gdb.isNonStopMode() ||
                        (wasRunning && !this.isRunning))
                ) {
                    if (this.isInitialized) {
                        this.handleGDBStopped(resultData);
                    }
                }
                break;
            }
            default:
                logger.warn(
                    `GDB unhandled async: ${resultClass}: ${JSON.stringify(
                        resultData
                    )}`
                );
        }
    }

    protected handleGDBNotify(notifyClass: string, notifyData: any) {
        switch (notifyClass) {
            case 'thread-created':
                this.threads.push(this.convertThread(notifyData));
                break;
            case 'thread-exited': {
                const thread: mi.MIThreadInfo = notifyData;
                const exitId = parseInt(thread.id, 10);
                this.threads = this.threads.filter((t) => t.id !== exitId);
                break;
            }
            case 'thread-selected':
            case 'thread-group-added':
            case 'thread-group-started':
            case 'thread-group-exited':
            case 'library-loaded':
                break;
            case 'breakpoint-created':
                {
                    // Check if the bp is going to be erased in the future, if so, don't send the bp event
                    if (notifyData.bkpt.disp === 'del') {
                        break;
                    }
                    const breakpoint: DebugProtocol.Breakpoint = {
                        id: parseInt(notifyData.bkpt.number, 10),
                        verified: notifyData.bkpt.enabled === 'y',
                        source: {
                            name: notifyData.bkpt.fullname,
                            path: notifyData.bkpt.file,
                        },
                        line: parseInt(notifyData.bkpt.line, 10),
                    };
                    const breakpointevent = new BreakpointEvent(
                        'new',
                        breakpoint
                    );
                    this.sendEvent(breakpointevent);
                }
                break;
            case 'breakpoint-modified':
                {
                    // Check if the bp is going to be erased in the future, if so, don't send the bp event
                    if (notifyData.bkpt.disp === 'del') {
                        break;
                    }
                    let breakpoint: DebugProtocol.Breakpoint;
                    if (notifyData.bkpt.file) {
                        breakpoint = {
                            id: parseInt(notifyData.bkpt.number, 10),
                            verified: true,
                            source: {
                                name: notifyData.bkpt.fullname,
                                path: notifyData.bkpt.file,
                            },
                            line: parseInt(notifyData.bkpt.line, 10),
                        };
                    } else {
                        breakpoint = {
                            id: parseInt(notifyData.bkpt.number, 10),
                            verified: true,
                            instructionReference: notifyData.bkpt.addr,
                        };
                    }

                    const breakpointevent = new BreakpointEvent(
                        'changed',
                        breakpoint
                    );
                    this.sendEvent(breakpointevent);
                }
                break;
            case 'breakpoint-deleted':
                {
                    const breakpoint: DebugProtocol.Breakpoint = {
                        id: parseInt(notifyData.id, 10),
                        verified: false,
                    };
                    const breakpointevent = new BreakpointEvent(
                        'removed',
                        breakpoint
                    );
                    this.sendEvent(breakpointevent);
                }
                break;
            case 'cmd-param-changed':
                // Known unhandled notifies
                break;
            default:
                logger.warn(
                    `GDB unhandled notify: ${notifyClass}: ${JSON.stringify(
                        notifyData
                    )}`
                );
        }
    }
    /**
     * Pushing to global variables response
     */
    private pushToGlobalVariableArray(
        globalArray: DebugProtocol.Variable[],
        elementToAdd: VarObjType
    ): DebugProtocol.Variable[] {
        globalArray.push({
            name: elementToAdd.expression,
            value: elementToAdd.value ?? '',
            memoryReference: `&(${elementToAdd.expression})`,
            type: elementToAdd.type,
            variablesReference:
                parseInt(elementToAdd.numchild, 10) > 0
                    ? this.variableHandles.create({
                          type: 'object',
                          varobjName: elementToAdd.varname,
                          frameHandle: -1, // Global variables don't have a frame
                      })
                    : 0,
        });

        return globalArray;
    }

    protected async handleVariableRequestStatic(): Promise<
        DebugProtocol.Variable[]
    > {
        return [];
    }

    private async loopOnSymbolsInSymbolGroup(
        symbolGroup: mi.MISymbolInfoVarsDebug,
        globalVariables: DebugProtocol.Variable[]
    ): Promise<DebugProtocol.Variable[]> {
        // Iterate over each global variable in the group
        for (const symbol of symbolGroup.symbols) {
            // skip if symbol is a static variable, we cannot create a variable object with a floating frame for static global variables as two files can have the same variable name
            if (symbol.description.includes('static')) {
                continue;
            }

            // Create a GDB/MI variable object for each global variable
            let miVarObj: mi.MIVarCreateResponse | undefined = undefined;
            try {
                miVarObj = await mi.sendVarCreate(this.gdb, {
                    expression: symbol.name,
                    frame: 'floating',
                });
            } catch (error: unknown) {
                // Cannot create variable object, that means it's probably not saved in the data section of memory (const members)
                if (!(error as Error).message.includes('-var-create')) {
                    throw error;
                }
            }
            if (!miVarObj) {
                // Variable object creation failed, that means the expression cannot be a variable. Which means user wouldn't be able to inspect it.
                continue;
            }
            // If we have an array parent entry, we need to display the address.
            try {
                // Try to get the address of the array, if it is optimised out, print the message as the value of the array
                if (arrayRegex.test(miVarObj.type)) {
                    const addr = await mi.sendDataEvaluateExpression(
                        this.gdb,
                        `&(${symbol.name})`
                    );
                    miVarObj.value = addr.value ? addr.value : '';
                }
            } catch (error: unknown) {
                // Handle error by printing the error message as a value
                miVarObj.value = (error as Error).message;
            }
            // Add the variable to the variable map
            const varAddedResponse = this.gdb.varManager.addVar(
                { threadId: -1, frameId: -1 }, //threadID = -1, frameID = -1 for global variables. This is an implementation choice and not a value used by GDB
                -1, //depth
                symbol.name, // variable/expression name
                true, // is it a variable?
                false, // is it a child variable? we don't store child variables in this method. It is only stored in VariableRequestObject
                miVarObj, // return of GDB/MI variable object creation function
                symbol.type // type of the variable
            );
            globalVariables = this.pushToGlobalVariableArray(
                globalVariables,
                varAddedResponse
            );
        }
        return globalVariables;
    }
    /**
     * Necessary steps for viewing global variables
     * retrieve global symbols/variables from GDB
     * each symbol has a property stating which source file it is created to and the type attribute provides if it's static or not.
     * A map is created in the debug-adapter for global variables to store them.
     */
    protected async handleVariableRequestGlobal(): Promise<
        DebugProtocol.Variable[]
    > {
        // Create empty array response for global variaables
        let globalVariables: DebugProtocol.Variable[] = [];
        // Check if any global variables are stored in the adapter's variable map. They have threadId of -1, frameId of -1, and depth of -1 as well
        const existingGlobalVars = this.gdb.varManager.getVars(
            { threadId: -1, frameId: -1 },
            -1
        );
        // Get all global variables from GDB
        const globalvars = await mi.sendSymbolInfoVars(this.gdb);
        // if there are no global variables stored in adapter's map
        if (!existingGlobalVars) {
            if (globalvars.symbols.debug.length > 0) {
                // Iterate over global variables debug groups (global variables are grouped by source file)
                for (const symbolgroup of globalvars.symbols.debug) {
                    globalVariables = await this.loopOnSymbolsInSymbolGroup(
                        symbolgroup,
                        globalVariables
                    );
                }
            } else {
                // No global variables found in GDB either
            }
        } else {
            // There are global variables in the adapter's variable map
            if (globalvars.symbols.debug.length > 0) {
                // There are global variables in GDB as well
                // Make sure the adapter's map and GDB are in sync
                // Array of variables to erase from adapter's map
                for (const variableInMap of existingGlobalVars) {
                    // Ignore it if it's a child variable or an expression
                    if (variableInMap.isVar && !variableInMap.isChild) {
                        // request update from GDB
                        const variableUpdate = await mi.sendVarUpdate(
                            this.gdb,
                            {
                                name: variableInMap.varname,
                            }
                        );
                        // If changelist has the length 0, the value of update will be undefined
                        // If update is undefined, that means the variable object still exists in GDB/MI, but it hasn't changed it's value.
                        // When a variable object is erased from GDB/MI, the -var-update command will trigger an error
                        const update = variableUpdate.changelist[0];
                        let pushFlag = true;
                        if (update) {
                            // If in_scope === true, that means the value is valid and it should be updated in the variable map
                            if (update.in_scope === 'true') {
                                if (update.name === variableInMap.varname) {
                                    // Update the value
                                    variableInMap.value = update.value;
                                    variableInMap.type =
                                        update.type_changed === 'true'
                                            ? update.new_type
                                            : variableInMap.type;
                                    variableInMap.numchild =
                                        update.type_changed === 'true'
                                            ? update.new_num_children
                                            : variableInMap.numchild;
                                }
                            } else if (update.in_scope === 'invalid') {
                                // If in_scope === 'invalid', that means variable no longer exists, i.e. a new executable file is being debugged
                                this.gdb.varManager.removeVar(
                                    { threadId: -1, frameId: -1 },
                                    -1,
                                    variableInMap.varname
                                );
                                pushFlag = false;
                            }
                            // in_scope === 'false' is not possible for global variables
                        }
                        if (pushFlag) {
                            // Push global variable to response to be shown in IDE
                            globalVariables = this.pushToGlobalVariableArray(
                                globalVariables,
                                variableInMap
                            );
                        }
                    }
                }
            } else {
                // There are no global variables in GDB
                // Erase global variables from adapter's map
                for (const variableInMap of existingGlobalVars) {
                    this.gdb.varManager.removeVar(
                        { threadId: -1, frameId: -1 },
                        -1,
                        variableInMap.varname
                    );
                }
            }
        }
        return globalVariables;
    }

    protected async handleVariableRequestFrame(
        ref: FrameVariableReference
    ): Promise<DebugProtocol.Variable[]> {
        // initialize variables array and dereference the frame handle
        const variables: DebugProtocol.Variable[] = [];
        const frameRef = this.frameHandles.get(ref.frameHandle);
        if (!frameRef) {
            return Promise.resolve(variables);
        }

        // vars used to determine if we should call sendStackListVariables()
        let callStack = false;
        let numVars = 0;

        // stack depth necessary for differentiating between similarly named variables at different stack depths
        const stackDepth = await mi.sendStackInfoDepth(this.gdb, {
            maxDepth: 100,
        });
        const depth = parseInt(stackDepth.depth, 10);

        // array of varnames to delete. Cannot delete while iterating through the vars array below.
        const toDelete = new Array<string>();

        // get the list of vars we need to update for this frameId/threadId/depth tuple
        const vars = this.gdb.varManager.getVars(frameRef, depth);
        if (vars) {
            for (const varobj of vars) {
                // ignore expressions and child entries
                if (varobj.isVar && !varobj.isChild) {
                    // request update from GDB
                    const vup = await mi.sendVarUpdate(this.gdb, {
                        name: varobj.varname,
                    });
                    // if changelist is length 0, update is undefined
                    const update = vup.changelist[0];
                    let pushVar = true;
                    if (update) {
                        if (update.in_scope === 'true') {
                            numVars++;
                            if (update.name === varobj.varname) {
                                // don't update the parent value to a child's value
                                varobj.value = update.value;
                            }
                        } else {
                            // var is out of scope, delete it and call sendStackListVariables() later
                            callStack = true;
                            pushVar = false;
                            toDelete.push(update.name);
                        }
                    } else if (varobj.value) {
                        // value hasn't updated but it's still in scope
                        numVars++;
                    }
                    // only push entries to the result that aren't being deleted
                    if (pushVar) {
                        let value = varobj.value;
                        // if we have an array parent entry, we need to display the address.
                        if (arrayRegex.test(varobj.type)) {
                            value = await this.getAddr(varobj);
                        }
                        variables.push({
                            name: varobj.expression,
                            evaluateName: varobj.expression,
                            value,
                            type: varobj.type,
                            memoryReference: `&(${varobj.expression})`,
                            variablesReference:
                                parseInt(varobj.numchild, 10) > 0
                                    ? this.variableHandles.create({
                                          type: 'object',
                                          frameHandle: ref.frameHandle,
                                          varobjName: varobj.varname,
                                      })
                                    : 0,
                        });
                    }
                }
            }
            // clean up out of scope entries
            for (const varname of toDelete) {
                await this.gdb.varManager.removeVar(frameRef, depth, varname);
            }
        }
        // if we had out of scope entries or no entries in the frameId/threadId/depth tuple, query GDB for new ones
        if (callStack === true || numVars === 0) {
            const result = await mi.sendStackListVariables(this.gdb, {
                frameRef,
                printValues: 'simple-values',
            });
            for (const variable of result.variables) {
                let varobj = this.gdb.varManager.getVar(
                    frameRef,
                    depth,
                    variable.name
                );
                if (!varobj) {
                    // create var in GDB and store it in the varMgr
                    const varCreateResponse = await mi.sendVarCreate(this.gdb, {
                        expression: variable.name,
                        frameRef,
                    });
                    varobj = this.gdb.varManager.addVar(
                        frameRef,
                        depth,
                        variable.name,
                        true,
                        false,
                        varCreateResponse
                    );
                } else {
                    // var existed as an expression before. Now it's a variable too.
                    varobj = await this.gdb.varManager.updateVar(
                        frameRef,
                        depth,
                        varobj
                    );
                    varobj.isVar = true;
                }
                let value = varobj.value;
                // if we have an array parent entry, we need to display the address.
                if (arrayRegex.test(varobj.type)) {
                    value = await this.getAddr(varobj);
                }
                variables.push({
                    name: varobj.expression,
                    evaluateName: varobj.expression,
                    value,
                    type: varobj.type,
                    memoryReference: `&(${varobj.expression})`,
                    variablesReference:
                        parseInt(varobj.numchild, 10) > 0
                            ? this.variableHandles.create({
                                  type: 'object',
                                  frameHandle: ref.frameHandle,
                                  varobjName: varobj.varname,
                              })
                            : 0,
                });
            }
        }
        return Promise.resolve(variables);
    }

    protected async handleVariableRequestObject(
        ref: ObjectVariableReference
    ): Promise<DebugProtocol.Variable[]> {
        // initialize variables array and dereference the frame handle
        const variables: DebugProtocol.Variable[] = [];
        const frameRef = this.frameHandles.get(ref.frameHandle);
        if (!frameRef && ref.frameHandle !== -1) {
            // Global variables have frameHandle -1
            return Promise.resolve(variables);
        }

        // fetch stack depth to obtain frameId/threadId/depth tuple
        const stackDepth = await mi.sendStackInfoDepth(this.gdb, {
            maxDepth: 100,
        });
        const depth = parseInt(stackDepth.depth, 10);
        // we need to keep track of children and the parent varname in GDB
        let children;
        let parentVarname = ref.varobjName;

        // if a varobj exists, use the varname stored there
        const varobj = this.gdb.varManager.getVarByName(
            frameRef,
            depth,
            ref.varobjName
        );
        if (varobj) {
            children = await mi.sendVarListChildren(this.gdb, {
                name: varobj.varname,
                printValues: mi.MIVarPrintValues.all,
            });
            parentVarname = varobj.varname;
        } else {
            // otherwise use the parent name passed in the variable reference
            children = await mi.sendVarListChildren(this.gdb, {
                name: ref.varobjName,
                printValues: mi.MIVarPrintValues.all,
            });
        }
        // Grab the full path of parent.
        const topLevelPathExpression =
            varobj?.expression ??
            (await this.getFullPathExpression(parentVarname));

        // iterate through the children
        for (const child of children.children) {
            // check if we're dealing with a C++ object. If we are, we need to fetch the grandchildren instead.
            const isClass = this.isChildOfClass(child);
            if (isClass) {
                const name = `${parentVarname}.${child.exp}`;
                const objChildren = await mi.sendVarListChildren(this.gdb, {
                    name,
                    printValues: mi.MIVarPrintValues.all,
                });
                // Append the child path to the top level full path.
                const parentClassName = `${topLevelPathExpression}.${child.exp}`;
                for (const objChild of objChildren.children) {
                    const childName = `${name}.${objChild.exp}`;
                    variables.push({
                        name: objChild.exp,
                        evaluateName: `${parentClassName}.${objChild.exp}`,
                        value: objChild.value ? objChild.value : objChild.type,
                        type: objChild.type,
                        variablesReference:
                            parseInt(objChild.numchild, 10) > 0
                                ? this.variableHandles.create({
                                      type: 'object',
                                      frameHandle: ref.frameHandle,
                                      varobjName: childName,
                                  })
                                : 0,
                    });
                }
            } else {
                // check if we're dealing with an array
                let name = `${ref.varobjName}.${child.exp}`;
                const varobjName = name;
                const value = child.value ? child.value : child.type;
                const isArrayParent = arrayRegex.test(child.type);
                const isArrayChild =
                    varobj !== undefined
                        ? arrayRegex.test(varobj.type) &&
                          arrayChildRegex.test(child.exp)
                        : false;
                if (isArrayChild) {
                    // update the display name for array elements to have square brackets
                    name = `[${child.exp}]`;
                }
                const variableName = isArrayChild ? name : child.exp;
                const evaluateName =
                    isArrayParent || isArrayChild
                        ? `${topLevelPathExpression}[${child.exp}]`
                        : `${topLevelPathExpression}.${child.exp}`;
                variables.push({
                    name: variableName,
                    evaluateName,
                    value,
                    type: child.type,
                    variablesReference:
                        parseInt(child.numchild, 10) > 0
                            ? this.variableHandles.create({
                                  type: 'object',
                                  frameHandle: ref.frameHandle,
                                  varobjName,
                              })
                            : 0,
                });
            }
        }
        return Promise.resolve(variables);
    }

    /** Query GDB using varXX name to get complete variable name */
    protected async getFullPathExpression(inputVarName: string) {
        const exprResponse = await mi.sendVarInfoPathExpression(
            this.gdb,
            inputVarName
        );
        // result from GDB looks like (parentName).field so remove ().
        return exprResponse.path_expr.replace(/[()]/g, '');
    }

    // Register view
    // Assume that the register name are unchanging over time, and the same across all threadsf
    private registerMap = new Map<string, number>();
    private registerMapReverse = new Map<number, string>();
    protected async handleVariableRequestRegister(
        ref: RegisterVariableReference
    ): Promise<DebugProtocol.Variable[]> {
        // initialize variables array and dereference the frame handle
        const variables: DebugProtocol.Variable[] = [];
        const frameRef = this.frameHandles.get(ref.frameHandle);
        if (!frameRef) {
            return Promise.resolve(variables);
        }

        if (this.registerMap.size === 0) {
            const result_names = await mi.sendDataListRegisterNames(this.gdb, {
                frameRef,
            });
            let idx = 0;
            const registerNames = result_names['register-names'];
            for (const regs of registerNames) {
                if (regs !== '') {
                    this.registerMap.set(regs, idx);
                    this.registerMapReverse.set(idx, regs);
                }
                idx++;
            }
        }

        const result_values = await mi.sendDataListRegisterValues(this.gdb, {
            fmt: 'x',
            frameRef,
        });
        const reg_values = result_values['register-values'];
        for (const n of reg_values) {
            const id = n.number;
            const reg = this.registerMapReverse.get(parseInt(id));
            if (reg) {
                const val = n.value;
                const res: DebugProtocol.Variable = {
                    name: reg,
                    evaluateName: '$' + reg,
                    value: val,
                    variablesReference: 0,
                };
                variables.push(res);
            } else {
                throw new Error('Unable to parse response for reg. values');
            }
        }

        return Promise.resolve(variables);
    }

    protected async getAddr(varobj: VarObjType) {
        const addr = await mi.sendDataEvaluateExpression(
            this.gdb,
            `&(${varobj.expression})`
        );
        return addr.value ? addr.value : varobj.value;
    }

    protected isChildOfClass(child: mi.MIVarChild): boolean {
        return (
            child.type === undefined &&
            child.value === '' &&
            (child.exp === 'public' ||
                child.exp === 'protected' ||
                child.exp === 'private')
        );
    }
}
