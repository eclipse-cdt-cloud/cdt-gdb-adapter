/*********************************************************************
 * Copyright (c) 2025 ABB Ltd. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

export function isWindowsPath(p: string): boolean {
    return /^[a-zA-Z]:[\\/]/.test(p);
}
