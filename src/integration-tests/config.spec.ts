/*********************************************************************
 * Copyright (c) 2023 Kichwa Coders Canada Inc. and others.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import * as tmp from 'tmp';
import * as fs from 'fs';
import {
    LaunchRequestArguments,
    AttachRequestArguments,
} from '../GDBDebugSession';
import {
    debugServerPort,
    defaultAdapter,
    fillDefaults,
    standardBeforeEach,
    testProgramsDir,
} from './utils';

describe('config', function () {
    const emptyProgram = path.join(testProgramsDir, 'empty');
    const emptySrc = path.join(testProgramsDir, 'empty.c');

    async function verifyLaunchWorks(
        test: Mocha.Context,
        commandLine: string[],
        requestArgs: LaunchRequestArguments
    ) {
        if (debugServerPort) {
            // This test requires launching the adapter to work
            test.skip();
        }

        const dc = await standardBeforeEach(defaultAdapter, commandLine);

        try {
            await dc.hitBreakpoint(fillDefaults(test.test, requestArgs), {
                path: emptySrc,
                line: 3,
            });
        } finally {
            await dc.stop();
        }
    }

    it('can specify program via --config=', async function () {
        const config = { program: emptyProgram };
        await verifyLaunchWorks(
            this,
            [`--config=${JSON.stringify(config)}`],
            {} as LaunchRequestArguments
        );
    });

    it('program via --config= can be overridden', async function () {
        const config = { program: '/program/that/does/not/exist' };
        await verifyLaunchWorks(this, [`--config=${JSON.stringify(config)}`], {
            program: emptyProgram,
        } as LaunchRequestArguments);
    });

    it('can specify program via --config-frozen=', async function () {
        const config = { program: emptyProgram };
        await verifyLaunchWorks(
            this,
            [`--config-frozen=${JSON.stringify(config)}`],
            {} as LaunchRequestArguments
        );
    });

    it('program via --config-frozen= can not be overridden', async function () {
        const config = { program: emptyProgram };
        await verifyLaunchWorks(
            this,
            [`--config-frozen=${JSON.stringify(config)}`],
            {
                program: '/program/that/does/not/exist',
            } as LaunchRequestArguments
        );
    });

    it('can specify program via --config= using response file', async function () {
        const config = { program: emptyProgram };
        const json = JSON.stringify(config);
        const jsonFile = tmp.fileSync();
        fs.writeFileSync(jsonFile.fd, json);
        fs.closeSync(jsonFile.fd);

        await verifyLaunchWorks(
            this,
            [`--config=@${jsonFile.name}`],
            {} as LaunchRequestArguments
        );
    });

    it('can specify program via --config-frozen= using response file', async function () {
        const config = { program: emptyProgram };
        const json = JSON.stringify(config);
        const jsonFile = tmp.fileSync();
        fs.writeFileSync(jsonFile.fd, json);
        fs.closeSync(jsonFile.fd);

        await verifyLaunchWorks(
            this,
            [`--config-frozen=@${jsonFile.name}`],
            {} as LaunchRequestArguments
        );
    });

    // This test most closely models the original design goal
    // for the change that added --config and --config-frozen
    // as discussed in #227 and #228
    // In summary we force a launch request for the given program,
    // but the user does not specify the program and specifies
    // an attach request
    it('config frozen forces specific launch type', async function () {
        if (debugServerPort) {
            // This test requires launching the adapter to work
            this.skip();
        }

        const config = { request: 'launch', program: emptyProgram };

        // Launch the adapter with the frozen config
        const dc = await standardBeforeEach(defaultAdapter, [
            `--config-frozen=${JSON.stringify(config)}`,
        ]);

        try {
            await Promise.all([
                // Do an attach request omitting the program that we want
                // the adapter to force into a launch request
                dc.attachRequest(
                    fillDefaults(this.test, {} as AttachRequestArguments)
                ),

                // The rest of this code is to ensure we launcher properly by verifying
                // we can run to a breakpoint
                dc.waitForEvent('initialized').then((_event) => {
                    return dc
                        .setBreakpointsRequest({
                            lines: [3],
                            breakpoints: [{ line: 3 }],
                            source: { path: emptySrc },
                        })
                        .then((_response) => {
                            return dc.configurationDoneRequest();
                        });
                }),
                dc.assertStoppedLocation('breakpoint', {
                    path: emptySrc,
                    line: 3,
                }),
            ]);
        } finally {
            await dc.stop();
        }
    });
});
