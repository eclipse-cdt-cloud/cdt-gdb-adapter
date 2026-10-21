/*********************************************************************
 * Copyright (c) 2026 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { SymbolSource, SymbolProvider } from '../types/session';

export class GlobalSymbolProvider implements SymbolProvider {
    constructor(public readonly symbolSource: SymbolSource) {}

    async notifySymbolFileLoaded(
        inferiorId: number,
        filePath: string
    ): Promise<void> {
        return await this.symbolSource.notifySymbolFileLoaded(
            inferiorId,
            filePath
        );
    }

    async getSourceFiles(
        inferiorId: number,
        threadId?: number
    ): Promise<string[]> {
        return [
            ...(
                await this.symbolSource.getGlobalVariablesByFile(
                    inferiorId,
                    threadId
                )
            ).keys(),
        ];
    }

    async getSymbolNames(
        inferiorId: number,
        sourceFile: string,
        threadId?: number
    ): Promise<string[] | undefined> {
        return (
            await this.symbolSource.getGlobalVariablesByFile(
                inferiorId,
                threadId
            )
        ).get(sourceFile);
    }

    clearSymbolCache(inferiorId: number): void {
        this.symbolSource.clearSymbolCache(inferiorId);
    }
}
