/*********************************************************************
 * Copyright (c) 2019 Kichwa Coders and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as cp from 'child_process';
import * as path from 'path';
import {
    TargetLaunchRequestArguments,
    TargetLaunchArguments,
} from '../GDBTargetDebugSession';
import { CdtDebugClient } from './debugClient';
import { fillDefaults, standardBeforeEach, testProgramsDir } from './utils';

describe('launch remote', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');

    beforeEach(async function () {
        dc = await standardBeforeEach('debugTargetAdapter.js');
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('can launch remote and hit a breakpoint', async function () {
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
                target: {
                    type: 'remote',
                } as TargetLaunchArguments,
            } as TargetLaunchRequestArguments),
            {
                path: emptySrc,
                line: 3,
            }
        );
    });

    it('can print a message to the debug console sent from a socket server', async function () {
        const socketServer = cp.spawn(
            "node",
            [`${path.join(testProgramsDir, "socketServer.js")}`],
            {
                cwd: testProgramsDir,
            }
        );
        let socketPort = "";
        socketServer.stdout.on("data", (data) => {
            socketPort = data.toString();
            socketPort = socketPort.substring(0, socketPort.indexOf("\n"));
        })
        const serverPort: number = Math.floor(Math.random() * 10000);
        await dc.getSocketOutput(
            fillDefaults(this.test, {
                program: emptyProgram,
                openGdbConsole: false,
                initCommands: ["break _fini"],
                target: {
                    host: "localhost",
                    port: serverPort.toString(),
                    server: "gdbserver",
                    serverParameters: [
                        "--once",
                        `localhost:${serverPort}`,
                        emptyProgram
                    ],
                    uart: {
                        socketPort: socketPort,
                        eolCharacter: "LF"
                    }
                } as TargetLaunchArguments
            } as TargetLaunchRequestArguments),
            "Socket",
            "Hello World!\n"
        )
    });
});
