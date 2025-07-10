/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { Response } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';

export interface RequestArguments extends DebugProtocol.LaunchRequestArguments {
    gdb?: string;
    gdbArguments?: string[];
    gdbAsync?: boolean;
    gdbNonStop?: boolean;
    // defaults to the environment of the process of the adapter
    environment?: Record<string, string | null>;
    program: string;
    // defaults to dirname of the program, if present or the cwd of the process of the adapter
    cwd?: string;
    verbose?: boolean;
    logFile?: string;
    openGdbConsole?: boolean;
    initCommands?: string[];
    hardwareBreakpoint?: boolean;
    customResetCommands?: string[];
}

export interface LaunchRequestArguments extends RequestArguments {
    arguments?: string;
}

export interface AttachRequestArguments extends RequestArguments {
    processId: string;
}

export interface FrameReference {
    threadId: number;
    frameId: number;
}

export interface FrameVariableReference {
    type: 'frame';
    frameHandle: number;
}

export interface ObjectVariableReference {
    type: 'object';
    frameHandle: number;
    varobjName: string;
}

export interface RegisterVariableReference {
    type: 'registers';
    frameHandle: number;
    regname?: string;
}

export type VariableReference =
    | FrameVariableReference
    | ObjectVariableReference
    | RegisterVariableReference;

export interface MemoryRequestArguments {
    address: string;
    length: number;
    offset?: number;
}

/**
 * Response for our custom 'cdt-gdb-adapter/Memory' request.
 */
export interface MemoryContents {
    /* Hex-encoded string of bytes.  */
    data: string;
    address: string;
}

export interface MemoryResponse extends Response {
    body: MemoryContents;
}

export interface CDTDisassembleArguments
    extends DebugProtocol.DisassembleArguments {
    /**
     * Memory reference to the end location containing the instructions to disassemble. When this
     * optional setting is provided, the minimum number of lines needed to get to the endMemoryReference
     * is used.
     */
    endMemoryReference: string;
}

export interface UARTArguments {
    // Path to the serial port connected to the UART on the board.
    serialPort?: string;
    // Target TCP port on the host machine to attach socket to print UART output (defaults to 3456)
    socketPort?: string;
    // Baud Rate (in bits/s) of the serial port to be opened (defaults to 115200).
    baudRate?: number;
    // The number of bits in each character of data sent across the serial line (defaults to 8).
    characterSize?: 5 | 6 | 7 | 8;
    // The type of parity check enabled with the transmitted data (defaults to "none" - no parity bit sent)
    parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
    // The number of stop bits sent to allow the receiver to detect the end of characters and resynchronize with the character stream (defaults to 1).
    stopBits?: 1 | 1.5 | 2;
    // The handshaking method used for flow control across the serial line (defaults to "none" - no handshaking)
    handshakingMethod?: 'none' | 'XON/XOFF' | 'RTS/CTS';
    // The EOL character used to parse the UART output line-by-line.
    eolCharacter?: 'LF' | 'CRLF';
}

export interface TargetAttachArguments {
    // Target type default is "remote"
    type?: string;
    // Target parameters would be something like "localhost:12345", defaults
    // to [`${host}:${port}`]
    parameters?: string[];
    // Target host to connect to, defaults to 'localhost', ignored if parameters is set
    host?: string;
    // Target port to connect to, ignored if parameters is set
    port?: string;
    // Target connect commands - if specified used in preference of type, parameters, host, target
    connectCommands?: string[];
    // Settings related to displaying UART output in the debug console
    uart?: UARTArguments;
}

export interface TargetLaunchArguments extends TargetAttachArguments {
    // The executable for the target server to launch (e.g. gdbserver or JLinkGDBServerCLExe),
    // defaults to 'gdbserver --once :0 ${args.program}' (requires gdbserver >= 7.3)
    server?: string;
    serverParameters?: string[];
    // Specifies the working directory of gdbserver, defaults to environment in RequestArguments
    environment?: Record<string, string | null>;
    // Regular expression to extract port from by examinging stdout/err of server.
    // Once server is launched, port will be set to this if port is not set.
    // defaults to matching a string like 'Listening on port 41551' which is what gdbserver provides
    // Ignored if port or parameters is set
    serverPortRegExp?: string;
    // Delay after startup before continuing launch, in milliseconds. If serverPortRegExp is
    // provided, it is the delay after that regexp is seen.
    serverStartupDelay?: number;
    // Automatically kill the launched server when client issues a disconnect (default: true)
    automaticallyKillServer?: boolean;
    // Specifies the working directory of gdbserver, defaults to cwd in RequestArguments
    cwd?: string;
    // Maximum time allowed for detecting the port number, default is 10sec
    portDetectionTimeout?: number;
}

export interface ImageAndSymbolArguments {
    // If specified, a symbol file to load at the given (optional) offset
    symbolFileName?: string;
    symbolOffset?: string;
    // If specified, an image file to load at the given (optional) offset
    imageFileName?: string;
    imageOffset?: string;
}

export interface TargetAttachRequestArguments extends RequestArguments {
    target?: TargetAttachArguments;
    imageAndSymbols?: ImageAndSymbolArguments;
    // Optional commands to issue between loading image and resuming target
    preRunCommands?: string[];
}

export interface TargetLaunchRequestArguments
    extends TargetAttachRequestArguments {
    target?: TargetLaunchArguments;
    imageAndSymbols?: ImageAndSymbolArguments;
    // Optional commands to issue between loading image and resuming target
    preRunCommands?: string[];
}
