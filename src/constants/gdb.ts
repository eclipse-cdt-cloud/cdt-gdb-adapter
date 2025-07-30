/*********************************************************************
 * Copyright (c) 2025 Arm Ltd. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

/**
 * GDB MI and GDB CLI commands considered to cause
 * a thread/target resume.
 */
export const RESUME_COMMANDS = [
    // GDB MI
    '-exec-continue',
    '-exec-finish',
    '-exec-jump',
    '-exec-next',
    '-exec-next-instruction',
    '-exec-return',
    '-exec-run',
    '-exec-step',
    '-exec-step-instruction',
    '-exec-until',
    // GDB CLI (initCommands, customResetCommands)
    'advance',
    'continue',
    'fg',
    'c',
    'finish',
    'fin',
    'jump',
    'j',
    'next',
    'n',
    'nexti',
    'ni',
    'run',
    'r',
    'start',
    'starti',
    'step',
    's',
    'stepi',
    'si',
    'until',
    'u',
];
