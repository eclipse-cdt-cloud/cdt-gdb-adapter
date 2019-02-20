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
import {
    Handles, InitializedEvent, Logger, logger, LoggingDebugSession, OutputEvent, Response, Scope, Source,
    StackFrame, StoppedEvent, TerminatedEvent, Thread,
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { GDBBackend } from './GDBBackend';
import * as mi from './mi';
import { sendDataReadMemoryBytes } from './mi/data';
import * as varMgr from './varManager';

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    gdb?: string;
    program: string;
    arguments?: string;
    verbose?: boolean;
    logFile?: string;
    openGdbConsole?: boolean;
}

export interface AttachRequestArguments extends DebugProtocol.LaunchRequestArguments {
    gdb?: string;
    program: string;
    processId: string;
    verbose?: boolean;
    logFile?: string;
    openGdbConsole?: boolean;
}

export interface FrameReference {
    threadId: number;
    frameId: number;
}

export interface FrameVariableReference {
    type: 'frame';
    frameHandle: number;
}

export interface ObjectVariableReference {
    type: 'object';
    frameHandle: number;
    varobjName: string;
}

export type VariableReference = FrameVariableReference | ObjectVariableReference;

export interface MemoryRequestArguments {
    address: string;
    length: number;
}

/**
 * Response for our custom 'cdt-gdb-adapter/Memory' request.
 */
export interface MemoryContents {
    /* Hex-encoded string of bytes.  */
    data: string;
    address: string;
}

export interface MemoryResponse extends Response {
    body: MemoryContents;
}

export class GDBDebugSession extends LoggingDebugSession {
    protected gdb: GDBBackend = this.createBackend();
    protected isAttach = false;
    protected isRunning = false;

    protected supportsRunInTerminalRequest = false;
    protected supportsGdbConsole = false;

    /* A reference to the logger to be used by subclasses */
    protected logger: Logger.Logger;

    private frameHandles = new Handles<FrameReference>();
    private variableHandles = new Handles<VariableReference>();

    constructor() {
        super();
        this.logger = logger;
    }

    protected createBackend(): GDBBackend {
        return new GDBBackend();
    }

    /**
     * Handle requests not defined in the debug adapter protocol.
     */
    protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {
        if (command === 'cdt-gdb-adapter/Memory') {
            this.memoryRequest(response as MemoryResponse, args);
        } else {
            return super.customRequest(command, response, args);
        }
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments): void {
        this.supportsRunInTerminalRequest = args.supportsRunInTerminalRequest === true;
        this.supportsGdbConsole = os.platform() !== 'win32' && this.supportsRunInTerminalRequest;
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsSetVariable = true;
        // response.body.supportsSetExpression = true;
        this.sendResponse(response);
    }

    protected async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): Promise<void> {
        try {
            logger.setup(args.verbose ? Logger.LogLevel.Verbose : Logger.LogLevel.Warn, args.logFile || false);

            this.gdb.on('consoleStreamOutput', (output, category) => {
                this.sendEvent(new OutputEvent(output, category));
            });

            this.gdb.on('async', (result) => this.handleGDBAsync(result));

            await this.spawn(args);
            await this.gdb.sendFileExecAndSymbols(args.program);

            await mi.sendTargetAttachRequest(this.gdb, { pid: args.processId });
            this.sendEvent(new OutputEvent(`attached to process ${args.processId}`));

            this.sendEvent(new InitializedEvent());
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): Promise<void> {
        try {
            logger.setup(args.verbose ? Logger.LogLevel.Verbose : Logger.LogLevel.Warn, args.logFile || false);

            this.gdb.on('consoleStreamOutput', (output, category) => {
                this.sendEvent(new OutputEvent(output, category));
            });

            this.gdb.on('async', (result) => this.handleGDBAsync(result));

            await this.spawn(args);
            await this.gdb.sendFileExecAndSymbols(args.program);

            this.gdb.sendEnablePrettyPrint();

            if (args.arguments) {
                await mi.sendExecArguments(this.gdb, { arguments: args.arguments });
            }
            this.sendEvent(new InitializedEvent());
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async spawn(args: LaunchRequestArguments | AttachRequestArguments) {
        if (args.openGdbConsole) {
            if (!this.supportsGdbConsole) {
                logger.warn('cdt-gdb-adapter: openGdbConsole is not supported on this platform');
            } else if (!await this.gdb.supportsNewUi(args.gdb)) {
                logger.warn(`cdt-gdb-adapter: new-ui command not detected (${args.gdb || 'gdb'})`);
            } else {
                logger.verbose('cdt-gdb-adapter: spawning gdb console in client terminal');
                return this.spawnInClientTerminal(args);
            }
        }
        return this.gdb.spawn(args);
    }

    protected async spawnInClientTerminal(
        args: DebugProtocol.LaunchRequestArguments | DebugProtocol.AttachRequestArguments) {
        return this.gdb.spawnInClientTerminal(
            args as LaunchRequestArguments | AttachRequestArguments,
            async (command) => {
                const response = await new Promise<DebugProtocol.Response>((resolve) =>
                    this.sendRequest('runInTerminal', {
                        kind: 'integrated',
                        cwd: process.cwd(),
                        env: process.env,
                        args: command,
                    } as DebugProtocol.RunInTerminalRequestArguments, 5000, resolve),
                );
                if (!response.success) {
                    const message = `could not start the terminal on the client: ${response.message}`;
                    logger.error(message);
                    throw new Error(message);
                }
            },
        );
    }

    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
        try {
            // Need to get the list of current breakpoints in the file and then make sure
            // that we end up with the requested set of breakpoints for that file
            // deleting ones not requested and inserting new ones.
            const file = args.source.path as string;
            const breakpoints = args.breakpoints || [];

            let inserts = breakpoints.slice();
            const deletes = new Array<string>();

            const actual = new Array<DebugProtocol.Breakpoint>();

            const result = await mi.sendBreakList(this.gdb);
            result.BreakpointTable.body.forEach((gdbbp) => {
                if (gdbbp.fullname === file && gdbbp.line) {
                    // TODO probably need more through checks than just line number
                    const line = parseInt(gdbbp.line, 10);
                    if (!breakpoints.find((vsbp) => vsbp.line === line)) {
                        deletes.push(gdbbp.number);
                    }

                    inserts = inserts.filter((vsbp) => {
                        if (vsbp.line !== line) {
                            return true;
                        } else {
                            actual.push({
                                verified: true,
                                line: gdbbp.line ? parseInt(gdbbp.line, 10) : 0,
                                id: parseInt(gdbbp.number, 10),
                            });
                            return false;
                        }
                    });
                }
            });

            for (const vsbp of inserts) {
                const gdbbp = await mi.sendBreakInsert(this.gdb, { location: `${file}:${vsbp.line}` });
                actual.push({
                    id: parseInt(gdbbp.bkpt.number, 10),
                    line: gdbbp.bkpt.line ? parseInt(gdbbp.bkpt.line, 10) : 0,
                    verified: true,
                });
            }

            response.body = {
                breakpoints: actual,
            };

            if (deletes.length > 0) {
                await mi.sendBreakDelete(this.gdb, { breakpoints: deletes });
            }

            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments): Promise<void> {
        try {
            if (this.isAttach) {
                await mi.sendExecContinue(this.gdb);
            } else {
                await mi.sendExecRun(this.gdb);
            }
            this.isRunning = true;
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 100, err.message);
        }
    }

    protected async threadsRequest(response: DebugProtocol.ThreadsResponse): Promise<void> {
        try {
            if (!this.isRunning) {
                // This is a thread request that comes out too early
                // comes out right after configDone and no way to delay it
                this.sendResponse(response);
                return;
            }

            const result = await mi.sendThreadInfoRequest(this.gdb, {});
            const threads = result.threads.map((thread) => {
                return new Thread(parseInt(thread.id, 10), thread.name ? thread.name : thread.id);
            });

            response.body = {
                threads,
            };

            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments): Promise<void> {
        try {
            const depthResult = await mi.sendStackInfoDepth(this.gdb, { maxDepth: 100 });
            const depth = parseInt(depthResult.depth, 10);
            const levels = args.levels ? (args.levels > depth ? depth : args.levels) : depth;
            const lowFrame = args.startFrame || 0;
            const highFrame = lowFrame + levels - 1;
            const listResult = await mi.sendStackListFramesRequest(this.gdb, { lowFrame, highFrame });

            const stack = listResult.stack.map((frame) => {
                let source;
                if (frame.fullname) {
                    source = new Source(path.basename(frame.file || frame.fullname), frame.fullname);
                }
                let line;
                if (frame.line) {
                    line = parseInt(frame.line, 10);
                }
                const frameHandle = this.frameHandles.create({
                    threadId: args.threadId,
                    frameId: parseInt(frame.level, 10),
                });
                return new StackFrame(frameHandle, frame.func || frame.fullname || '', source, line);
            });

            response.body = {
                stackFrames: stack,
                totalFrames: depth,
            };

            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async nextRequest(response: DebugProtocol.NextResponse,
        args: DebugProtocol.NextArguments): Promise<void> {
        try {
            await mi.sendExecNext(this.gdb);
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments): Promise<void> {
        try {
            await mi.sendExecStep(this.gdb);
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse,
        args: DebugProtocol.StepOutArguments): Promise<void> {
        try {
            await mi.sendExecFinish(this.gdb);
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse,
        args: DebugProtocol.ContinueArguments): Promise<void> {
        try {
            await mi.sendExecContinue(this.gdb);
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments): void {
        const frame: FrameVariableReference = {
            type: 'frame',
            frameHandle: args.frameId,
        };

        response.body = {
            scopes: [
                new Scope('Local', this.variableHandles.create(frame), false),
            ],
        };

        this.sendResponse(response);
    }

    protected async variablesRequest(response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments): Promise<void> {
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
            if (ref.type === 'frame') {
                response.body.variables = await this.handleVariableRequestFrame(ref);

            } else if (ref.type === 'object') {
                response.body.variables = await this.handleVariableRequestObject(ref);
            }
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async setVariableRequest(response: DebugProtocol.SetVariableResponse,
        args: DebugProtocol.SetVariableArguments): Promise<void> {
        try {
            const ref = this.variableHandles.get(args.variablesReference);
            if (!ref) {
                this.sendResponse(response);
                return;
            }
            const frame = this.frameHandles.get(ref.frameHandle);
            if (!frame) {
                this.sendResponse(response);
                return;
            }
            const parentVarname = ref.type === 'object' ? ref.varobjName : '';
            const varname = parentVarname + (parentVarname === '' ? '' : '.') + args.name.replace(/^\[(\d+)\]/, '$1');
            const stackDepth = await mi.sendStackInfoDepth(this.gdb, { maxDepth: 100 });
            const depth = parseInt(stackDepth.depth, 10);
            let varobj = varMgr.getVar(frame.frameId, frame.threadId, depth, varname);
            let assign;
            if (varobj) {
                assign = await mi.sendVarAssign(this.gdb, { varname: varobj.varname, expression: args.value });
            } else {
                try {
                    assign = await mi.sendVarAssign(this.gdb, { varname, expression: args.value });
                } catch (err) {
                    if (parentVarname === '') {
                        throw err; // no recovery possible
                    }
                    const children = await mi.sendVarListChildren(this.gdb, {
                        name: parentVarname,
                        printValues: 'all-values',
                    });
                    for (const child of children.children) {
                        if (this.isChildOfClass(child)) {
                            const grandchildVarname = child.name + '.' + args.name.replace(/^\[(\d+)\]/, '$1');
                            varobj = varMgr.getVar(frame.frameId, frame.threadId, depth, grandchildVarname);
                            try {
                                assign = await mi.sendVarAssign(this.gdb, {
                                    varname: grandchildVarname,
                                    expression: args.value,
                                });
                                break;
                            } catch (err) {
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
                variablesReference: (varobj && parseInt(varobj.numchild, 10) > 0)
                    ? this.variableHandles.create({
                        type: 'object',
                        frameHandle: ref.frameHandle,
                        varobjName: varobj.varname,
                    })
                    : 0,
            };
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
        this.sendResponse(response);
    }

    // protected async setExpressionRequest(response: DebugProtocol.SetExpressionResponse,
    //                                      args: DebugProtocol.SetExpressionArguments): Promise<void> {
    //     logger.error('got setExpressionRequest');
    //     this.sendResponse(response);
    // }

    protected async evaluateRequest(response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments): Promise<void> {
        response.body = { result: 'Error: could not evaluate expression', variablesReference: 0 }; // default response
        try {
            if (args.frameId === undefined) {
                throw new Error('Evaluation of expression without frameId is not supported.');
            }

            const frame = this.frameHandles.get(args.frameId);
            if (!frame) {
                this.sendResponse(response);
                return;
            }
            const stackDepth = await mi.sendStackInfoDepth(this.gdb, { maxDepth: 100 });
            const depth = parseInt(stackDepth.depth, 10);
            let varobj = varMgr.getVar(frame.frameId, frame.threadId, depth, args.expression);
            if (!varobj) {
                const varCreateResponse = await mi.sendVarCreate(this.gdb,
                    { expression: args.expression, frame: 'current' });
                varobj = varMgr.addVar(frame.frameId, frame.threadId, depth, args.expression, false,
                    false, varCreateResponse);
            } else {
                const vup = await mi.sendVarUpdate(this.gdb, {
                    threadId: frame.threadId,
                    name: varobj.varname,
                });
                const update = vup.changelist[0];
                if (update) {
                    if (update.in_scope === 'true') {
                        if (update.name === varobj.varname) {
                            varobj.value = update.value;
                        }
                    } else {
                        varMgr.removeVar(this.gdb, frame.frameId, frame.threadId, depth,
                            varobj.varname);
                        await mi.sendVarDelete(this.gdb, { varname: varobj.varname });
                        const varCreateResponse = await mi.sendVarCreate(this.gdb,
                            { expression: args.expression, frame: 'current' });
                        varobj = varMgr.addVar(frame.frameId, frame.threadId, depth, args.expression,
                            false, false, varCreateResponse);
                    }
                }
            }
            if (varobj) {
                response.body = {
                    result: varobj.value,
                    type: varobj.type,
                    variablesReference: parseInt(varobj.numchild, 10) > 0
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
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    /**
     * Implement the cdt-gdb-adapter/Memory request.
     */
    protected async memoryRequest(response: MemoryResponse, args: any) {
        try {
            if (typeof (args.address) !== 'string') {
                throw new Error(`Invalid type for 'address', expected string, got ${typeof (args.address)}`);
            }

            if (typeof (args.length) !== 'number') {
                throw new Error(`Invalid type for 'length', expected number, got ${typeof (args.length)}`);
            }

            const typedArgs = args as MemoryRequestArguments;

            const result = await sendDataReadMemoryBytes(this.gdb, typedArgs.address, typedArgs.length);
            response.body = {
                data: result.memory[0].contents,
                address: result.memory[0].begin,
            };
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse,
        args: DebugProtocol.DisconnectArguments): Promise<void> {
        try {
            await this.gdb.sendGDBExit();
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err.message);
        }
    }

    protected sendStoppedEvent(reason: string, threadId: number, exceptionText?: string) {
        // Reset frame handles and variables for new context
        this.frameHandles.reset();
        this.variableHandles.reset();
        // Send the event
        this.sendEvent(new StoppedEvent(reason, threadId, exceptionText));
    }

    protected handleGDBStopped(result: any) {
        switch (result.reason) {
            case 'exited-normally':
                this.sendEvent(new TerminatedEvent());
                break;
            case 'breakpoint-hit':
                this.sendStoppedEvent('breakpoint', parseInt(result['thread-id'], 10));
                break;
            case 'end-stepping-range':
                this.sendStoppedEvent('step', parseInt(result['thread-id'], 10));
                break;
            default:
                logger.warn('GDB unhandled stop: ' + JSON.stringify(result));
        }
    }

    protected handleGDBAsync(result: any) {
        switch (result._class) {
            case 'running':
                // not sure we care, we do get the thread-id that's running tho
                break;
            case 'stopped':
                this.handleGDBStopped(result);
                break;
            default:
                logger.warn('GDB unhandled async: ' + JSON.stringify(result));
        }
    }

    private async handleVariableRequestFrame(ref: FrameVariableReference): Promise<DebugProtocol.Variable[]> {
        // initialize variables array and dereference the frame handle
        const variables: DebugProtocol.Variable[] = [];
        const frame = this.frameHandles.get(ref.frameHandle);
        if (!frame) {
            return Promise.resolve(variables);
        }

        // vars used to determine if we should call sendStackListVariables()
        let callStack = false;
        let numVars = 0;

        // stack depth necessary for differentiating between similarly named variables at different stack depths
        const stackDepth = await mi.sendStackInfoDepth(this.gdb, { maxDepth: 100 });
        const depth = parseInt(stackDepth.depth, 10);

        // array of varnames to delete. Cannot delete while iterating through the vars array below.
        const toDelete = new Array<string>();

        // get the list of vars we need to update for this frameId/threadId/depth tuple
        const vars = varMgr.getVars(frame.frameId, frame.threadId, depth);
        if (vars) {
            for (const varobj of vars) {
                // ignore expressions and child entries
                if (varobj.isVar && !varobj.isChild) {
                    // request update from GDB
                    const vup = await mi.sendVarUpdate(this.gdb, {
                        threadId: frame.threadId,
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
                    // only push entries to the array that aren't being deleted
                    if (pushVar) {
                        variables.push({
                            name: varobj.expression,
                            value: varobj.value,
                            type: varobj.type,
                            variablesReference: parseInt(varobj.numchild, 10) > 0
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
                await varMgr.removeVar(this.gdb, frame.frameId, frame.threadId, depth, varname);
            }
        }
        // if we had out of scope entries or no entries in the frameId/threadId/depth tuple, query GDB for new ones
        if (callStack === true || numVars === 0) {
            const result = await mi.sendStackListVariables(this.gdb, {
                thread: frame.threadId,
                frame: frame.frameId,
                printValues: 'simple-values',
            });
            for (const variable of result.variables) {
                let varobj = varMgr.getVar(frame.frameId, frame.threadId, depth, variable.name);
                if (!varobj) {
                    // create var in GDB and store it in the varMgr
                    const varCreateResponse = await mi.sendVarCreate(this.gdb, {
                        frame: 'current', expression: variable.name,
                    });
                    varobj = varMgr.addVar(frame.frameId, frame.threadId, depth, variable.name, true, false,
                        varCreateResponse);
                } else {
                    // var existed as an expression before. Now it's a variable too.
                    varobj = await varMgr.updateVar(this.gdb, frame.frameId, frame.threadId, depth, varobj);
                    varobj.isVar = true;
                }
                variables.push({
                    name: varobj.expression,
                    value: varobj.value,
                    type: varobj.type,
                    variablesReference: parseInt(varobj.numchild, 10) > 0
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

    private async handleVariableRequestObject(ref: ObjectVariableReference): Promise<DebugProtocol.Variable[]> {
        // initialize variables array and dereference the frame handle
        const variables: DebugProtocol.Variable[] = [];
        const frame = this.frameHandles.get(ref.frameHandle);
        if (!frame) {
            return Promise.resolve(variables);

        }

        // fetch stack depth to obtain frameId/threadId/depth tuple
        const stackDepth = await mi.sendStackInfoDepth(this.gdb, { maxDepth: 100 });
        const depth = parseInt(stackDepth.depth, 10);
        // we need to keep track of children and the parent varname in GDB
        let children;
        let parentVarname = ref.varobjName;

        // if a varobj exists, use the varname stored there
        const varobj = varMgr.getVarByName(frame.frameId, frame.threadId, depth, ref.varobjName);
        if (varobj) {
            children = await mi.sendVarListChildren(this.gdb, {
                name: varobj.varname,
                printValues: 'all-values',
            });
            parentVarname = varobj.varname;
        } else {
            // otherwise use the parent name passed in the variable reference
            children = await mi.sendVarListChildren(this.gdb, {
                name: ref.varobjName,
                printValues: 'all-values',
            });
        }

        // iterate through the children
        for (const child of children.children) {
            // check if we're dealing with a C++ object. If we are, we need to fetch the grandchildren instead.
            const isClass = this.isChildOfClass(child);
            if (isClass) {
                const name = `${parentVarname}.${child.exp}`;
                const objChildren = await mi.sendVarListChildren(this.gdb, {
                    name,
                    printValues: 'all-values',
                });
                for (const objChild of objChildren.children) {
                    const childName = `${name}.${objChild.exp}`;
                    variables.push({
                        name: objChild.exp,
                        value: objChild.value ? objChild.value : objChild.type,
                        type: objChild.type,
                        variablesReference: parseInt(objChild.numchild, 10) > 0
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
                let varobjName = name;
                const arrayRegex = /.*\[[\d]+\].*/g;
                const arrayChildRegex = /[\d]+/g;
                const isArrayParent = arrayRegex.test(child.type);
                const isArrayChild = (varobj !== undefined
                    ? arrayRegex.test(varobj.type) && arrayChildRegex.test(child.exp)
                    : false);
                if (isArrayChild) {
                    // update the display name for array elements to have square brackets
                    name = `[${child.exp}]`;
                }
                if (isArrayParent || isArrayChild) {
                    // can't use a relative varname (eg. var1.a.b.c) to create/update a new var so fetch and track these
                    // vars by evaluating their path expression from GDB
                    const exprResponse = await mi.sendVarInfoPathExpression(this.gdb,
                        child.name);
                    // create or update the var in GDB
                    let arrobj = varMgr.getVar(frame.frameId, frame.threadId, depth, exprResponse.path_expr);
                    if (!arrobj) {
                        const varCreateResponse = await mi.sendVarCreate(this.gdb, {
                            frame: 'current', expression: exprResponse.path_expr,
                        });
                        arrobj = varMgr.addVar(frame.frameId, frame.threadId, depth, exprResponse.path_expr,
                            true, false, varCreateResponse);
                    } else {
                        arrobj = await varMgr.updateVar(this.gdb, frame.frameId, frame.threadId, depth,
                            arrobj);
                    }
                    arrobj.isChild = true;
                    varobjName = arrobj.varname;
                }
                const variableName = isArrayChild ? name : child.exp;
                variables.push({
                    name: variableName,
                    value: child.value ? child.value : child.type,
                    type: child.type,
                    variablesReference: parseInt(child.numchild, 10) > 0
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

    private isChildOfClass(child: mi.MIVarChild): boolean {
        return child.type === undefined && child.value === '' &&
            (child.exp === 'public' || child.exp === 'protected' || child.exp === 'private');
    }
}
