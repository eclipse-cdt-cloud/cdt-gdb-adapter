/*********************************************************************
 * Copyright (c) 2025 Arm Ltd. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { IStdioProcess } from '../types/gdb';

/**
 * Check if the process is active
 *
 * @param proc
 *     Process to check
 * @return
 *     Returns true if process is active, false otherwise
 */
export const isProcessActive = (proc?: IStdioProcess): boolean => {
    if (!proc) {
        return false;
    }
    return !proc.exitCode && proc.exitCode !== 0 && !proc.signalCode;
};
