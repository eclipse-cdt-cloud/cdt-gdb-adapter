/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { LoggingDebugSession, Logger, OutputEvent, Thread, InitializedEvent, TerminatedEvent, StoppedEvent, StackFrame, Source, Handles, Scope } from 'vscode-debugadapter/lib/main';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { logger } from 'vscode-debugadapter/lib/logger';
import { GDBBackend } from './GDBBackend';
import * as path from 'path';
import * as exec from './mi/exec';
import { sendBreakDelete, sendBreakInsert, sendBreakList} from './mi/breakpoint';
import { sendTargetAttachRequest, sendTargetSelectRequest } from './mi/target';
import { sendThreadInfoRequest } from './mi/thread';
import { sendStackInfoDepth, sendStackListFramesRequest, sendStackListVariables } from './mi/stack';
import { sendVarCreate, sendVarListChildren, sendVarUpdate, MIVarCreateResponse, sendVarDelete } from './mi/var';
import { MIVariableInfo} from './mi/base';

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    gdb?: string;
    program: string;
    arguments?: string;
    target: string;
    verbose?: boolean;
}

export interface AttachRequestArguments extends DebugProtocol.LaunchRequestArguments {
    gdb?: string;
    program: string;
    processId: string;
    verbose?: boolean;
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
    varobjName: string;
}

export type VariableReference = FrameVariableReference | ObjectVariableReference;

interface VarObjType{
    varname: string; 
    expression: string;
    numchild: string; 
    value: string;
    type: string;
}

export class GDBDebugSession extends LoggingDebugSession {
    private gdb: GDBBackend = new GDBBackend();
    private isAttach = false;
    private isRunning = false;
    private frameHandles = new Handles<FrameReference>();
    private variableHandles = new Handles<VariableReference>();

    constructor() {
        super("gdb-debug.log");
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        this.sendResponse(response);
    }

    protected async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): Promise<void> {
        try {
            logger.setup(args.verbose ? Logger.LogLevel.Verbose : Logger.LogLevel.Warn, false);

            this.isAttach = true;

            this.gdb.on('consoleStreamOutput', (output, category) => {
                this.sendEvent(new OutputEvent(output, category));
            });

            this.gdb.on('async', result => this.handleGDBAsync(result));

            await this.gdb.attach(args);

            await sendTargetAttachRequest(this.gdb, {pid: args.processId});
            this.sendEvent(new OutputEvent(`attached to process ${args.processId}`));

            this.sendEvent(new InitializedEvent());
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): Promise<void> {
        try {
            logger.setup(args.verbose ? Logger.LogLevel.Verbose : Logger.LogLevel.Warn, false);

            this.gdb.on('consoleStreamOutput', (output, category) => {
                this.sendEvent(new OutputEvent(output, category));
            });

            this.gdb.on('async', result => this.handleGDBAsync(result));

            await this.gdb.launch(args);

            this.gdb.sendEnablePrettyPrint();

            if (args.arguments) {
                await exec.sendExecArguments(this.gdb, {arguments: args.arguments});
            }
            this.sendEvent(new InitializedEvent());
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
        try {
            // Need to get the list of current breakpoints in the file and then make sure
            // that we end up with the requested set of breakpoints for that file
            // deleting ones not requested and inserting new ones.
            const file = <string>args.source.path;
            const breakpoints = args.breakpoints || [];

            let inserts = breakpoints.slice();
            const deletes = new Array<string>();

            const actual = new Array<DebugProtocol.Breakpoint>();

            const result = await sendBreakList(this.gdb);
            result.BreakpointTable.body.forEach(gdbbp => {
                if (gdbbp.fullname === file && gdbbp.line) {
                    // TODO probably need more through checks than just line number
                    const line = parseInt(gdbbp.line);
                    if (!breakpoints.find(vsbp => vsbp.line === line)) {
                        deletes.push(gdbbp.number);
                    }

                    inserts = inserts.filter(vsbp => {
                        if (vsbp.line !== line) {
                            return true;
                        } else {
                            actual.push({
                                verified: true,
                                line: gdbbp.line ? parseInt(gdbbp.line) : 0,
                                id: parseInt(gdbbp.number)
                            });
                            return false;
                        }
                    });
                }
            });

            for (const vsbp of inserts) {
                const gdbbp = await sendBreakInsert(this.gdb, {location: `${file}:${vsbp.line}`});
                actual.push({
                    id: parseInt(gdbbp.bkpt.number),
                    line: gdbbp.bkpt.line ? parseInt(gdbbp.bkpt.line) : 0,
                    verified: true
                });
            }
            
            response.body = {
                breakpoints: actual
            };

            if (deletes.length > 0) {
                await sendBreakDelete(this.gdb, {breakpoints: deletes});
            }

            this.sendResponse(response);
        } catch(err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected async configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): Promise<void> {
        try {
            if (this.isAttach) {
                await exec.sendExecContinue(this.gdb);
            } else {
                await exec.sendExecRun(this.gdb);
            }
            this.isRunning = true;
            this.sendResponse(response);
        } catch(err) {
            this.sendErrorResponse(response, 100, err);
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

            const result = await sendThreadInfoRequest(this.gdb, {});
            const threads = result.threads.map(thread => {
                return new Thread(parseInt(thread.id), thread.name ? thread.name : thread.id);
            });

            response.body = {
                threads: threads
            };

            this.sendResponse(response);
        } catch(err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): Promise<void> {
        try {
            const depthResult = await sendStackInfoDepth(this.gdb, {maxDepth: 100});
            const depth = parseInt(depthResult.depth);
            const levels = args.levels ? (args.levels > depth ? depth : args.levels) : depth;
            const lowFrame = args.startFrame || 0;
            const highFrame = lowFrame + levels - 1;
            const listResult = await sendStackListFramesRequest(this.gdb, {lowFrame: lowFrame, highFrame: highFrame});

            const stack = listResult.stack.map(frame => {
                let source;
                if (frame.fullname) {
                    source = new Source(path.basename(frame.file || frame.fullname), frame.fullname);
                }
                let line;
                if (frame.line) {
                    line = parseInt(frame.line);
                }
                const frameHandle = this.frameHandles.create({threadId: args.threadId, frameId: parseInt(frame.level)});
                return new StackFrame(frameHandle, frame.func || frame.fullname || "", source, line);
            });

            response.body = {
                stackFrames: stack,
                totalFrames: depth
            };

            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err);
        }
    }
    
    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): Promise<void> {
        try {
            await exec.sendExecNext(this.gdb);
            this.sendResponse(response);
        } catch(err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): Promise<void> {
        try {
            await exec.sendExecStep(this.gdb);
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): Promise<void> {
        try {
            await exec.sendExecFinish(this.gdb);
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): Promise<void> {
        try {
            await exec.sendExecContinue(this.gdb);
            this.sendResponse(response);
        } catch(err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        const frame: FrameVariableReference = {
            type: 'frame',
            frameHandle: args.frameId
        };

        response.body = {
            scopes: [
                new Scope("Local", this.variableHandles.create(frame), false)
            ]
        };

        this.sendResponse(response);
    }

    protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): Promise<void> {
        try {
            const ref = this.variableHandles.get(args.variablesReference);
            if (!ref) {
                this.sendResponse(response);
                return;
            }

            const variables = new Array<DebugProtocol.Variable>();

            if (ref.type === 'frame') {
                const frame = this.frameHandles.get(ref.frameHandle);
                if (!frame) {
                    this.sendResponse(response);
                    return;
                }

                let call_stack = false;

                const stackDepth = await sendStackInfoDepth(this.gdb, {maxDepth: 100});
                const depth = parseInt(stackDepth.depth);
                const toDelete = new Array<string>();

                const vars = this.getVars(frame.frameId, frame.threadId, depth);
                if (vars) {
                    for (const varobj of vars) {
                        const vup = await sendVarUpdate(this.gdb, {threadId: frame.threadId, name: varobj.varname});
                        const update = vup.changelist[0];
                        if (update) {
                            if (update.in_scope === 'true') {
                                varobj.value = update.value;
                                variables.push({
                                    name: varobj.expression,
                                    value: update.value,
                                    type: varobj.type,
                                    variablesReference: parseInt(varobj.numchild) > 0
                                        ? this.variableHandles.create({type: 'object', varobjName: varobj.varname})
                                        : 0
                                });
                            } else {
                                call_stack = true;
                                toDelete.push(update.name);
                            }
                        } else if (varobj.value) {
                            variables.push({
                                name: varobj.expression,
                                value: varobj.value,
                                type: varobj.type,
                                variablesReference: parseInt(varobj.numchild) > 0
                                    ? this.variableHandles.create({type: 'object', varobjName: varobj.varname})
                                    : 0
                            });
                        }
                    }
                    for (const varname of toDelete) {
                        this.removeVar(frame.frameId, frame.threadId, depth, varname);
                        await sendVarDelete(this.gdb, {varname: varname});
                    }

                } else {
                    call_stack = true;
                }
                if (call_stack === true) {
                    const result = await sendStackListVariables(this.gdb, {thread: frame.threadId, frame: frame.frameId, printValues: 'simple-values'});
                    for (const variable of result.variables) {
                        const varobj = this.getVar(frame.frameId, frame.threadId, depth, variable.name);
                        if (!varobj) {
                            const varobj = await this.createVariable(variable, variables);
                            this.addVar(frame.frameId, frame.threadId, depth, variable.name, varobj);
                        }
                    }
                }
                
            } else if (ref.type === 'object') {
                const children = await sendVarListChildren(this.gdb, {name: ref.varobjName, printValues: 'all-values'});
                for (const child of children.children) {
                    variables.push({
                        name: child.exp,
                        value: child.value ? child.value : child.type,
                        type: child.type,
                        variablesReference: parseInt(child.numchild) > 0
                            ? this.variableHandles.create({type: 'object', varobjName: child.name})
                            : 0
                    });
                }
            }

            response.body = {
                variables: variables
            };

            this.sendResponse(response);
    } catch (err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {
        try {
            switch (args.context) {
                case 'repl':
                    await this.gdb.sendCommand(args.expression);
                    this.sendResponse(response);
                    break;
            }
        } catch (err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    private variableMap: Map<string, Array<VarObjType>> = new Map<string, Array<VarObjType>>();

    private getKey(frameId: number, threadId: number, depth: number) : string {
        return `frame${frameId}_thread${threadId}_depth${depth}`;
    }

    private getVars(frameId: number, threadId: number, depth: number) : VarObjType[] | undefined {
        return this.variableMap.get(this.getKey(frameId, threadId, depth));
    }

    private getVar(frameId: number, threadId: number, depth: number, expression: string) : VarObjType | undefined {
        const vars = this.getVars(frameId, threadId, depth);
        if (vars) {
            for (const varobj of vars) {
                if (varobj.expression === expression) {
                    return varobj;
                }
            }
        }
        return;
    }

    private addVar(frameId: number, threadId: number, depth: number, expression: string, varobj: MIVarCreateResponse): void {
        let vars = this.variableMap.get(this.getKey(frameId, threadId, depth));
        if (!vars) {
            vars = new Array<VarObjType>();
        }
        vars.push({varname: varobj.name, expression: expression, numchild: varobj.numchild, value: varobj.value, type: varobj.type});
        this.variableMap.set(this.getKey(frameId, threadId, depth), vars);
    }

    private removeVar(frameId: number, threadId: number, depth: number, varname: string): void {
        let vars = this.variableMap.get(this.getKey(frameId, threadId, depth));
        let deleteme;
        if (vars) {
            for (let varobj of vars) {
                if (varobj.varname === varname) {
                    deleteme = varobj;
                    break;
                }
            }
            if (deleteme)  {
                vars.splice(vars.indexOf(deleteme), 1);
            }
            this.variableMap.set(this.getKey(frameId, threadId, depth), vars);
        }
    }

    private async createVariable(variable: MIVariableInfo, variables: DebugProtocol.Variable[] ) : Promise<MIVarCreateResponse> {
        const varobj = await sendVarCreate(this.gdb, {frame: 'current', expression: variable.name});
        if (varobj.numchild === "0") {
            variables.push({
                name: variable.name,
                value: varobj.value,
                type: variable.type,
                variablesReference: 0
            });
        } else {
            variables.push({
                name: variable.name,
                value: varobj.value,
                type: variable.type,
                variablesReference: this.variableHandles.create({type: 'object', varobjName: varobj.name})
            });
        }
        return varobj;
    }

    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): Promise<void> {
        try {
            await this.gdb.sendGDBExit();
            this.sendResponse(response);
        } catch (err) {
            this.sendErrorResponse(response, 1, err);
        }
    }

    private sendStoppedEvent(reason: string, threadId: number, exceptionText?: string) {
        // Reset frame handles and variables for new context
        this.frameHandles.reset();
        this.variableHandles.reset();
        // Send the event
        this.sendEvent(new StoppedEvent(reason, threadId, exceptionText));
    }

    private handleGDBStopped(result: any) {
        switch (result.reason) {
            case 'exited-normally':
                this.sendEvent(new TerminatedEvent());
                break;
            case 'breakpoint-hit':
                this.sendStoppedEvent('breakpoint', parseInt(result["thread-id"]));
                break;
            case 'end-stepping-range':
                this.sendStoppedEvent('step', parseInt(result["thread-id"]));
                break;
            default:
                logger.warn("GDB unhandled stop: " + JSON.stringify(result));
        }
    }

    private handleGDBAsync(result: any) {
        switch (result._class) {
            case 'running':
                // not sure we care, we do get the thread-id that's running tho
                break;
            case 'stopped':
                this.handleGDBStopped(result);
                break;
            default:
                logger.warn("GDB unhandled async: " + JSON.stringify(result));
        }
    }
}