/*********************************************************************
 * Copyright (c) 2025 Arm Ltd. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { ILogger, logger, LogLevel } from '@vscode/debugadapter/lib/logger';

/**
 * Wrapper class for Debug Adapter logger to prepend messages with a name.
 */
export class NamedLogger implements ILogger {
    protected readonly _logger = logger;
    constructor(protected name?: string) {}
    log(msg: string, level?: LogLevel): void {
        this._logger.log(
            this.name && this.name.length ? `[${this.name}] ${msg}` : msg,
            level
        );
    }
    verbose(msg: string): void {
        this._logger.verbose(
            this.name && this.name.length ? `[${this.name}] ${msg}` : msg
        );
    }
    warn(msg: string): void {
        this._logger.warn(
            this.name && this.name.length ? `[${this.name}] ${msg}` : msg
        );
    }
    error(msg: string): void {
        this._logger.error(
            this.name && this.name.length ? `[${this.name}] ${msg}` : msg
        );
    }
}
