/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as path from 'path';
import * as os from 'os';
import {
    LaunchRequestArguments,
    TargetLaunchRequestArguments,
} from '../types/session';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    gdbNonStop,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('launch', function () {
    let dc: CdtDebugClient;
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySpaceProgram = path.join(testProgramsDir, 'empty space');
    const emptySrc = path.join(testProgramsDir, 'empty.c');
    const emptySpaceSrc = path.join(testProgramsDir, 'empty space.c');
    const unicodeProgram = path.join(testProgramsDir, 'bug275-测试');
    // the name of this file is short enough to work around https://sourceware.org/bugzilla/show_bug.cgi?id=30618
    const unicodeSrc = path.join(testProgramsDir, 'bug275-测试.c');

    beforeEach(async function () {
        dc = await standardBeforeEach();
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('can launch and hit a breakpoint', async function () {
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptyProgram,
            } as LaunchRequestArguments),
            {
                path: emptySrc,
                line: 3,
            }
        );
    });

    it('receives an error when no port is provided nor a suitable regex', async function () {
        if (!isRemoteTest) {
            this.skip();
        }
        const errorMessage = await new Promise<Error>((resolve, reject) => {
            dc.launchRequest(
                fillDefaults(this.test, {
                    program: emptyProgram,
                    target: {
                        serverPortRegExp: 'Not a correct regex',
                        portDetectionTimeout: 1000,
                    },
                } as TargetLaunchRequestArguments)
            )
                .then(reject)
                .catch(resolve);
        });
        expect(errorMessage.message).to.satisfy(
            (msg: string) =>
                msg.includes('Error') &&
                msg.includes('port number not specified or regex is incorrect')
        );
    });

    it('reports an error when specifying a non-existent binary', async function () {
        const errorMessage = await new Promise<Error>((resolve, reject) => {
            dc.launchRequest(
                fillDefaults(this.test, {
                    program: '/does/not/exist',
                } as LaunchRequestArguments)
            )
                .then(reject)
                .catch(resolve);
        });

        // When launching a remote test gdbserver generates the error which is not exactly the same
        // as GDB's error
        expect(errorMessage.message).to.satisfy(
            (msg: string) =>
                msg.includes('/does/not/exist') &&
                (msg.includes('The system cannot find the path specified') ||
                    msg.includes('No such file or directory') ||
                    msg.includes('not found'))
        );
    });

    it('works with a space in file names', async function () {
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: emptySpaceProgram,
            } as LaunchRequestArguments),
            {
                path: emptySpaceSrc,
                line: 3,
            }
        );
    });

    it('works with unicode in file names', async function () {
        if (!gdbNonStop && os.platform() === 'win32' && isRemoteTest) {
            // on windows remote tests don't support the unicode in file name (except for non-stop which seems to)
            this.skip();
        }
        await dc.hitBreakpoint(
            fillDefaults(this.test, {
                program: unicodeProgram,
            } as LaunchRequestArguments),
            {
                path: unicodeSrc,
                line: 3,
            }
        );
    });

    it('provides a decent error if program is omitted', async function () {
        const errorMessage = await new Promise<Error>((resolve, reject) => {
            dc.launchRequest(
                fillDefaults(this.test, {} as LaunchRequestArguments)
            )
                .then(reject)
                .catch(resolve);
        });

        expect(errorMessage.message).to.satisfy((msg: string) =>
            msg.includes('program must be specified')
        );
    });
});
