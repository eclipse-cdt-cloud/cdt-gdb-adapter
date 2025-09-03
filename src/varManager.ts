import { IGDBBackend } from './types/gdb';
import { MIVarCreateResponse } from './mi/var';
import { sendVarCreate, sendVarDelete, sendVarUpdate } from './mi/var';
import { FrameReference } from './types/session';

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

    constructor(protected gdb: IGDBBackend) {
        this.gdb = gdb;
    }

    public getKey(frameRef: FrameReference, depth: number): string {
        return `frame${frameRef.frameId}_thread${frameRef.threadId}_depth${depth}`;
    }

    public getVars(
        frameRef: FrameReference | undefined,
        depth: number
    ): VarObjType[] | undefined {
        return frameRef
            ? this.variableMap.get(this.getKey(frameRef, depth))
            : undefined;
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
        let vars = frameRef
            ? this.variableMap.get(this.getKey(frameRef, depth))
            : undefined;
        if (!vars) {
            vars = [];
            if (frameRef) {
                this.variableMap.set(this.getKey(frameRef, depth), vars);
            }
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
                    frameRef: frameRef?.frameId === -1 ? undefined : frameRef,
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
