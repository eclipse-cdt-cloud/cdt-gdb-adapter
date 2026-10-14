import { logger } from '@vscode/debugadapter/lib/logger';
import { IGDBBackend } from './types/gdb';
import { FrameReference } from './types/session';
import {
    MIVarCreateResponse,
    sendVarCreate,
    sendVarDelete,
    sendVarUpdate,
} from './mi/var';

export interface VarObjType {
    varname: string;
    expression: string;
    numchild: string;
    children: VarObjType[];
    value: string;
    type: string;
    isVar: boolean;
    isChild: boolean;
    varType: string;
}

export class VarManager {
    protected readonly variableMap: Map<string, VarObjType[]> = new Map<
        string,
        VarObjType[]
    >();

    private readonly frameContexts: Map<
        string,
        { key: string; ready: Promise<void> }
    > = new Map();

    constructor(protected gdb: IGDBBackend) {
        this.gdb = gdb;
    }

    public getKey(frameRef: FrameReference | undefined, depth: number): string {
        if (!frameRef) {
            return `global`;
        }
        return `frame${frameRef.frameId}_thread${frameRef.threadId}_depth${depth}_pc${
            frameRef.pc || ''
        }`;
    }

    public prepareFrame(
        frameRef: FrameReference | undefined,
        depth: number
    ): Promise<void> {
        if (!frameRef?.pc) {
            return Promise.resolve();
        }

        const identity = `frame${frameRef.frameId}_thread${frameRef.threadId}_depth${depth}`;
        const key = this.getKey(frameRef, depth);
        const previous = this.frameContexts.get(identity);
        if (previous?.key === key) {
            return previous.ready;
        }

        const context: { key: string; ready: Promise<void> } = {
            key,
            ready: Promise.resolve(),
        };
        context.ready = (async () => {
            if (!previous) {
                return;
            }
            await previous.ready;

            const staleVars = this.variableMap.get(previous.key) || [];
            try {
                for (const variable of staleVars) {
                    if (!variable.isChild) {
                        try {
                            await sendVarDelete(this.gdb, {
                                varname: variable.varname,
                            });
                        } catch (error) {
                            logger.verbose(
                                `Failed to delete stale varobj ${variable.varname}: ${error}`
                            );
                        }
                    }
                }
            } finally {
                this.variableMap.delete(previous.key);
            }
        })();

        this.frameContexts.set(identity, context);
        void context.ready.catch(() => {
            if (this.frameContexts.get(identity) === context) {
                this.frameContexts.delete(identity);
            }
        });
        return context.ready;
    }

    public getVars(
        frameRef: FrameReference | undefined,
        depth: number
    ): VarObjType[] | undefined {
        return this.variableMap.get(this.getKey(frameRef, depth));
    }

    public getVar(
        frameRef: FrameReference | undefined,
        depth: number,
        expression: string,
        type?: string
    ): VarObjType | undefined {
        const vars = this.getVars(frameRef, depth);
        if (vars) {
            for (const varobj of vars) {
                if (varobj.expression === expression) {
                    if (type !== 'registers') {
                        type = 'local';
                    }
                    if (type === varobj.varType) {
                        return varobj;
                    }
                }
            }
        }
        return;
    }

    public getVarByName(
        frameRef: FrameReference | undefined,
        depth: number,
        varname: string
    ): VarObjType | undefined {
        const vars = this.getVars(frameRef, depth);
        if (vars) {
            for (const varobj of vars) {
                if (varobj.varname === varname) {
                    return varobj;
                }
            }
        }
        return;
    }

    public addVar(
        frameRef: FrameReference | undefined,
        depth: number,
        expression: string,
        isVar: boolean,
        isChild: boolean,
        varCreateResponse: MIVarCreateResponse,
        type?: string
    ): VarObjType {
        let vars = this.variableMap.get(this.getKey(frameRef, depth));
        if (!vars) {
            vars = [];
            this.variableMap.set(this.getKey(frameRef, depth), vars);
        }
        const varobj: VarObjType = {
            varname: varCreateResponse.name,
            expression,
            numchild: varCreateResponse.numchild,
            children: [],
            value: varCreateResponse.value,
            type: varCreateResponse.type,
            isVar,
            isChild,
            varType: type ? type : 'local',
        };
        vars.push(varobj);
        return varobj;
    }

    public async removeVar(
        frameRef: FrameReference | undefined,
        depth: number,
        varname: string
    ): Promise<void> {
        let deleteme: VarObjType | undefined;
        const vars = frameRef
            ? this.variableMap.get(this.getKey(frameRef, depth))
            : undefined;
        if (vars) {
            for (const varobj of vars) {
                if (varobj.varname === varname) {
                    deleteme = varobj;
                    break;
                }
            }
            if (deleteme) {
                await sendVarDelete(this.gdb, { varname: deleteme.varname });
                vars.splice(vars.indexOf(deleteme), 1);
                for (const child of deleteme.children) {
                    await this.removeVar(frameRef, depth, child.varname);
                }
            }
        }
    }

    public async updateVar(
        frameRef: FrameReference | undefined,
        depth: number,
        varobj: VarObjType
    ): Promise<VarObjType> {
        let returnVar = varobj;
        const vup = await sendVarUpdate(this.gdb, { name: varobj.varname });
        const update = vup.changelist[0];
        if (update) {
            if (update.in_scope === 'true') {
                if (update.name === varobj.varname) {
                    // don't update the parent value to a child's value
                    varobj.value = update.value;
                }
            } else {
                this.removeVar(frameRef, depth, varobj.varname);
                await sendVarDelete(this.gdb, { varname: varobj.varname });
                const createResponse = await sendVarCreate(this.gdb, {
                    frame: 'current',
                    expression: varobj.expression,
                    frameRef,
                });
                returnVar = this.addVar(
                    frameRef,
                    depth,
                    varobj.expression,
                    varobj.isVar,
                    varobj.isChild,
                    createResponse
                );
            }
        }
        return Promise.resolve(returnVar);
    }
}
