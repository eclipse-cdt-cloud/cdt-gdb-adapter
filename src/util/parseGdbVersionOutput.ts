/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

/**
 * Find gdb version info from a string object which is supposed to
 * contain output text of "gdb --version" command.
 *
 * @param stdout
 * 		output text from "gdb --version" command .
 * @return
 * 		String representation of version of gdb such as "10.1" on success
 */
export function parseGdbVersionOutput(stdout: string): string | undefined {
    return stdout.split(/ gdb( \(.*?\))? (\D* )*\(?(\d*(\.\d*)*)/g)[3];
}
