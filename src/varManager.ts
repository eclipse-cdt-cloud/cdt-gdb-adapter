import { GDBBackend } from './GDBBackend';
import { MIVarCreateResponse } from './mi/var';
import { sendVarCreate, sendVarDelete, sendVarUpdate } from './mi/var';

export interface VarObjType {
    varname: string;
    expression: string;
    numchild: string;
    children: VarObjType[];
    value: string;
    type: string;
    isVar: boolean;
    isChild: boolean;
}

const variableMap: Map<string, VarObjType[]> = new Map<string, VarObjType[]>();

export function getKey(frameId: number, threadId: number, depth: number): string {
    return `frame${frameId}_thread${threadId}_depth${depth}`;
}

export function getVars(frameId: number, threadId: number, depth: number): VarObjType[] | undefined {
    return variableMap.get(getKey(frameId, threadId, depth));
}

export function getVar(frameId: number, threadId: number, depth: number, expression: string): VarObjType | undefined {
    const vars = getVars(frameId, threadId, depth);
    if (vars) {
        for (const varobj of vars) {
            if (varobj.expression === expression) {
                return varobj;
            }
        }
    }
    return;
}

export function addVar(frameId: number, threadId: number, depth: number, expression: string, isVar: boolean,
                       isChild: boolean, varCreateResponse: MIVarCreateResponse): VarObjType {
    let vars = variableMap.get(getKey(frameId, threadId, depth));
    if (!vars) {
        vars = [];
        variableMap.set(getKey(frameId, threadId, depth), vars);
    }
    const varobj: VarObjType = {
        varname: varCreateResponse.name, expression, numchild: varCreateResponse.numchild,
        children: [], value: varCreateResponse.value, type: varCreateResponse.type, isVar, isChild,
    };
    vars.push(varobj);
    return varobj;
}

export async function removeVar(gdb: GDBBackend, frameId: number, threadId: number, depth: number, varname: string)
    : Promise<void> {
    let deleteme: VarObjType | undefined;
    const vars = variableMap.get(getKey(frameId, threadId, depth));
    if (vars) {
        for (const varobj of vars) {
            if (varobj.varname === varname) {
                deleteme = varobj;
                break;
            }
        }
        if (deleteme) {
            await sendVarDelete(gdb, { varname: deleteme.varname });
            vars.splice(vars.indexOf(deleteme), 1);
            for (const child of deleteme.children) {
                await removeVar(gdb, frameId, threadId, depth, child.varname);
            }
        }
    }
}

export async function updateVar(gdb: GDBBackend, frameId: number, threadId: number, depth: number, varobj: VarObjType)
    : Promise<VarObjType> {
    let returnVar = varobj;
    const vup = await sendVarUpdate(gdb, { threadId, name: varobj.varname });
    const update = vup.changelist[0];
    if (update) {
        if (update.in_scope === 'true') {
            varobj.value = update.value;
            varobj.isVar = true;
        } else {
            removeVar(gdb, frameId, threadId, depth, varobj.varname);
            await sendVarDelete(gdb, { varname: varobj.varname });
            const createResponse = await sendVarCreate(gdb, { frame: 'current', expression: varobj.expression });
            returnVar = addVar(frameId, threadId, depth, varobj.expression, true, false, createResponse);
        }
    }
    return Promise.resolve(returnVar);
}
