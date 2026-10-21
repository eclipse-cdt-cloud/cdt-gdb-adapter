/*********************************************************************
 * Copyright (c) 2026 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { IGDBBackend } from '../types/gdb';
import { SymbolSource, UNKNOWN_SOURCE_FILE } from '../types/session';
import * as mi from '../mi';

export class GDBSymbolInfoVariablesSource implements SymbolSource {
    private readonly cache = new Map<number, Promise<Map<string, string[]>>>();

    constructor(private readonly gdb: IGDBBackend) {}

    async notifySymbolFileLoaded(inferiorId: number): Promise<void> {
        this.clearSymbolCache(inferiorId);
    }

    async getGlobalVariablesByFile(
        inferiorId: number,
        threadId?: number
    ): Promise<Map<string, string[]>> {
        const cached = this.cache.get(inferiorId);
        if (cached) {
            return cached;
        }
        if (threadId === undefined) {
            return this.readSymbols(undefined);
        }
        const symbolListPromise = this.readSymbols(threadId);
        this.cache.set(inferiorId, symbolListPromise);
        symbolListPromise.catch(() => {
            if (this.cache.get(inferiorId) === symbolListPromise) {
                this.cache.delete(inferiorId);
            }
        });
        return symbolListPromise;
    }

    private async readSymbols(
        threadId?: number
    ): Promise<Map<string, string[]>> {
        const result = await mi.sendSymbolInfoVars(this.gdb, {
            non_debug: true,
            threadId,
        });
        const symbols = new Map<string, string[]>();
        for (const debug of result.symbols?.debug ?? []) {
            const names = symbols.get(debug.filename) ?? [];
            for (const variable of debug.symbols) {
                if (!names.includes(variable.name)) {
                    names.push(variable.name);
                }
            }
            symbols.set(debug.filename, names);
        }

        const unknownNames = [
            ...new Set(
                (result.symbols?.nondebug ?? [])
                    .map((symbol) => symbol.name)
                    .filter((name) => /^[A-Za-z_]\w*$/.test(name))
            ),
        ];
        if (unknownNames.length > 0) {
            symbols.set(UNKNOWN_SOURCE_FILE, unknownNames);
        }
        return symbols;
    }

    clearSymbolCache(inferiorId: number): void {
        this.cache.delete(inferiorId);
    }
}
