/*********************************************************************
 * Copyright (c) 2025 Arm Ltd. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

class GDBBackendError extends Error {
    constructor(
        error: Error,
        name: string = 'GDBBackendError',
        public backend = ''
    ) {
        super(error.message);
        this.name = name;
        this.stack = error.stack;
    }
}

export class GDBError extends GDBBackendError {
    constructor(error: Error, backend = '') {
        super(error, 'GDBError', backend);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class GDBThreadRunning extends GDBBackendError {
    constructor(error: Error, backend = '') {
        super(error, 'GDBThreadRunning', backend);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class GDBUnknownResponse extends GDBBackendError {
    constructor(error: Error, backend = '') {
        super(error, 'GDBUnknownResponse', backend);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class GDBPipeError extends GDBBackendError {
    constructor(error: Error, backend = '') {
        super(error, 'GDBPipeError', backend);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
