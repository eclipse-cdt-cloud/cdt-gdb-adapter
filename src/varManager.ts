import {MIVarCreateResponse} from './mi/var';

export interface VarObjType {
  varname: string;
  expression: string;
  numchild: string;
  value: string;
  type: string;
  isVar: boolean;
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
                       varCreateResponse: MIVarCreateResponse): VarObjType {
    let vars = variableMap.get(getKey(frameId, threadId, depth));
    if (!vars) {
        vars = new Array<VarObjType>();
    }
    const varobj: VarObjType = {varname: varCreateResponse.name, expression, numchild: varCreateResponse.numchild,
        value: varCreateResponse.value, type: varCreateResponse.type, isVar};
    vars.push(varobj);
    variableMap.set(getKey(frameId, threadId, depth), vars);
    return varobj;
}

export function removeVar(frameId: number, threadId: number, depth: number, varname: string): void {
    const vars = variableMap.get(getKey(frameId, threadId, depth));
    let deleteme;
    if (vars) {
        for (const varobj of vars) {
            if (varobj.varname === varname) {
                deleteme = varobj;
                break;
            }
        }
        if (deleteme)  {
            vars.splice(vars.indexOf(deleteme), 1);
        }
        variableMap.set(getKey(frameId, threadId, depth), vars);
    }
}
