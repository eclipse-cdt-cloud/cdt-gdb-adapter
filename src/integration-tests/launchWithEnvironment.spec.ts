/*********************************************************************
 * Copyright (c) 2023 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import { expect } from 'chai';
import * as path from 'path';
import { LaunchRequestArguments } from '../GDBDebugSession';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    getScopes,
    isRemoteTest,
    resolveLineTagLocations,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { platform } from 'os';
import { DebugProtocol } from '@vscode/debugprotocol';

const debugTargetAdapter = 'debugTargetAdapter.js';

describe('launch with environment', function () {
    let dc: CdtDebugClient | undefined;

    const lineTags = {
        'STOP HERE': 0,
    };

    before(function () {
        resolveLineTagLocations(
            path.join(testProgramsDir, 'vars_env.c'),
            lineTags
        );
    });

    const showGDBEnv = async (name: string): Promise<string | undefined> => {
        const value = await dc?.send('cdt-gdb-tests/executeCommand', {
            command: `show environment ${name}`,
        });
        return value?.body?.console?.[1]?.trim();
    };

    const getAPPEnv = (
        vars: DebugProtocol.VariablesResponse,
        name: string
    ): string => {
        const variable = vars.body.variables.find((i) => i.name === name);
        if (!variable) {
            throw new Error(`Variable not found : ${name}`);
        }
        return variable.value;
    };

    const runForEnvironmentTest = async (
        adapter?: string,
        test?: Mocha.Runnable | undefined,
        environment?: Record<string, string | null> | undefined,
        targetEnvironment?: Record<string, string | null> | undefined
    ) => {
        dc = await standardBeforeEach(adapter);
        await dc.launchRequest(
            fillDefaults(test, {
                program: path.join(testProgramsDir, 'vars_env'),
                environment: environment,
                target: {
                    environment: targetEnvironment,
                },
            } as LaunchRequestArguments)
        );

        const bpResp = await dc.setBreakpointsRequest({
            source: {
                name: 'vars_env.c',
                path: path.join(testProgramsDir, 'vars_env.c'),
            },
            breakpoints: [
                {
                    column: 1,
                    line: lineTags['STOP HERE'],
                },
            ],
        });
        expect(bpResp.body.breakpoints.length).eq(1);
        expect(bpResp.body.breakpoints[0].verified).eq(true);
        expect(bpResp.body.breakpoints[0].message).eq(undefined);
        await dc.configurationDoneRequest();
        await dc.waitForEvent('stopped');
        await dc?.send('cdt-gdb-tests/executeCommand', {
            command: `set print addr off`,
        });
        const scope = await getScopes(dc);
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });

        const APP_PROC = {
            ENV_PATH: getAPPEnv(vars, 'path'),
            ENV_VARTEST1: getAPPEnv(vars, 'test1'),
            ENV_VARTEST2: getAPPEnv(vars, 'test2'),
            ENV_VARTEST3: getAPPEnv(vars, 'test3'),
            ENV_VARTEST4: getAPPEnv(vars, 'test4'),
            ENV_TEST_VAR: getAPPEnv(vars, 'envtest'),
        };

        // Output of the "show variable <VARNAME>" command
        // (gets value of 'undefined' in any unexpected error occured in test)
        const GDB_PROC = {
            SHOW_VARTEST1: await showGDBEnv('VARTEST1'),
            SHOW_VARTEST2: await showGDBEnv('VARTEST2'),
            SHOW_VARTEST3: await showGDBEnv('VARTEST3'),
            SHOW_VARTEST4: await showGDBEnv('VARTEST4'),
            SHOW_ENV_TEST_VAR: await showGDBEnv('ENV_TEST_VAR'),
        };

        return {
            APP_PROC,
            GDB_PROC,
        };
    };

    afterEach(async function () {
        // dc could be undefined if test is skipped.
        await dc?.stop();
        dc = undefined;
    });

    it('sets environment variables passed to the process', async function () {
        const environment = {
            VARTEST1: 'TEST1',
            VARTEST2: 'TEST2',
            VARTEST3: 'TEST3',
            VARTEST4: 'TEST4',
        };

        const { APP_PROC, GDB_PROC } = await runForEnvironmentTest(
            undefined,
            this.test,
            environment
        );

        expect(APP_PROC.ENV_VARTEST1).to.equals('"TEST1"');
        expect(APP_PROC.ENV_VARTEST2).to.equals('"TEST2"');
        expect(APP_PROC.ENV_VARTEST3).to.equals('"TEST3"');
        expect(APP_PROC.ENV_VARTEST4).to.equals('"TEST4"');

        expect(GDB_PROC.SHOW_VARTEST1).to.equals('VARTEST1 = TEST1');
        expect(GDB_PROC.SHOW_VARTEST2).to.equals('VARTEST2 = TEST2');
        expect(GDB_PROC.SHOW_VARTEST3).to.equals('VARTEST3 = TEST3');
        expect(GDB_PROC.SHOW_VARTEST4).to.equals('VARTEST4 = TEST4');
    });

    it('checks setting environment variables with debugAdapter', async function () {
        if (isRemoteTest) {
            // checks setting environment variables with debugTargetAdapter is the test for when isRemoteTest
            this.skip();
        }

        const environment = {
            VARTEST1: 'TEST1',
            VARTEST2: 'TEST2',
        };
        const targetEnvironment = {
            VARTEST1: 'TEST1_SOMEDIFFERENT_VALUE',
            VARTEST2: 'TEST2_SOMEDIFFERENT_VALUE',
            VARTEST3: 'TEST3_SOMEDIFFERENT_VALUE',
            VARTEST4: 'TEST4_SOMEDIFFERENT_VALUE',
        };

        const { APP_PROC, GDB_PROC } = await runForEnvironmentTest(
            undefined,
            this.test,
            environment,
            targetEnvironment
        );

        expect(APP_PROC.ENV_VARTEST1).to.equals('"TEST1"');
        expect(APP_PROC.ENV_VARTEST2).to.equals('"TEST2"');
        expect(APP_PROC.ENV_VARTEST3).to.equals(''); // NULL
        expect(APP_PROC.ENV_VARTEST4).to.equals(''); // NULL

        expect(GDB_PROC.SHOW_VARTEST1).to.equals('VARTEST1 = TEST1');
        expect(GDB_PROC.SHOW_VARTEST2).to.equals('VARTEST2 = TEST2');
        expect(GDB_PROC.SHOW_VARTEST3).to.equals(
            'Environment variable "VARTEST3" not defined.'
        );
        expect(GDB_PROC.SHOW_VARTEST4).to.equals(
            'Environment variable "VARTEST4" not defined.'
        );
    });

    it('checks setting environment variables with debugTargetAdapter', async function () {
        const environment = {
            VARTEST1: 'TEST1',
            VARTEST2: 'TEST2',
        };
        const targetEnvironment = {
            VARTEST1: 'TEST1_SOMEDIFFERENT_VALUE',
            VARTEST2: 'TEST2_SOMEDIFFERENT_VALUE',
            VARTEST3: 'TEST3_SOMEDIFFERENT_VALUE',
            VARTEST4: 'TEST4_SOMEDIFFERENT_VALUE',
        };

        const { APP_PROC, GDB_PROC } = await runForEnvironmentTest(
            debugTargetAdapter,
            this.test,
            environment,
            targetEnvironment
        );

        expect(APP_PROC.ENV_VARTEST1).to.equals('"TEST1_SOMEDIFFERENT_VALUE"');
        expect(APP_PROC.ENV_VARTEST2).to.equals('"TEST2_SOMEDIFFERENT_VALUE"');
        expect(APP_PROC.ENV_VARTEST3).to.equals('"TEST3_SOMEDIFFERENT_VALUE"');
        expect(APP_PROC.ENV_VARTEST4).to.equals('"TEST4_SOMEDIFFERENT_VALUE"');

        expect(GDB_PROC.SHOW_VARTEST1).to.equals('VARTEST1 = TEST1');
        expect(GDB_PROC.SHOW_VARTEST2).to.equals('VARTEST2 = TEST2');
        expect(GDB_PROC.SHOW_VARTEST3).to.equals(
            'Environment variable "VARTEST3" not defined.'
        );
        expect(GDB_PROC.SHOW_VARTEST4).to.equals(
            'Environment variable "VARTEST4" not defined.'
        );
    });

    it('unsets when target environment variables sets null with debugTargetAdapter', async function () {
        const environment = {
            VARTEST1: 'TEST1',
            VARTEST2: 'TEST2',
            VARTEST3: 'TEST3',
            VARTEST4: 'TEST4',
        };
        const targetEnvironment = {
            VARTEST1: 'TEST1_SOMEDIFFERENT_VALUE',
            VARTEST2: 'TEST2_SOMEDIFFERENT_VALUE',
            VARTEST3: null,
            VARTEST4: null,
        };

        const { APP_PROC, GDB_PROC } = await runForEnvironmentTest(
            debugTargetAdapter,
            this.test,
            environment,
            targetEnvironment
        );

        expect(APP_PROC.ENV_VARTEST1).to.equals('"TEST1_SOMEDIFFERENT_VALUE"');
        expect(APP_PROC.ENV_VARTEST2).to.equals('"TEST2_SOMEDIFFERENT_VALUE"');
        expect(APP_PROC.ENV_VARTEST3).to.equals(''); // NULL
        expect(APP_PROC.ENV_VARTEST4).to.equals(''); // NULL

        expect(GDB_PROC.SHOW_VARTEST1).to.equals('VARTEST1 = TEST1');
        expect(GDB_PROC.SHOW_VARTEST2).to.equals('VARTEST2 = TEST2');
        expect(GDB_PROC.SHOW_VARTEST3).to.equals('VARTEST3 = TEST3');
        expect(GDB_PROC.SHOW_VARTEST4).to.equals('VARTEST4 = TEST4');
    });

    it('ensures that path is not null', async function () {
        const { APP_PROC } = await runForEnvironmentTest(undefined, this.test);

        expect(APP_PROC.ENV_PATH).not.to.equals('');
    });

    it('ensures that new entries could be injected to path', async function () {
        const pathToAppend = __dirname;
        const currentPathValue = process.env.PATH;
        const environment = {
            PATH: `${pathToAppend}${path.delimiter}${currentPathValue}`,
        };
        const { APP_PROC } = await runForEnvironmentTest(
            undefined,
            this.test,
            environment
        );

        expect(APP_PROC.ENV_PATH).not.to.equals('');

        const entries = APP_PROC.ENV_PATH.substring(
            1,
            APP_PROC.ENV_PATH.length - 1
        ).split(path.delimiter);
        if (platform() === 'win32') {
            // Win32 test platform auto inject another folder to the front of the list.
            // So we have a little bit different test here.
            const winEntries = entries.map((i) => i.replace(/\\\\/g, '\\'));
            expect(
                winEntries,
                'Path does not include appended folder'
            ).to.includes(pathToAppend);
        } else {
            expect(entries[0]).to.equals(pathToAppend);
        }
    });

    it('ensures that ENV_TEST_VAR is not null', async function () {
        const { APP_PROC } = await runForEnvironmentTest(undefined, this.test);

        expect(APP_PROC.ENV_TEST_VAR).not.to.equals('');
    });

    it('check setting null will delete the variable', async function () {
        const environment = {
            ENV_TEST_VAR: null,
        };

        const { APP_PROC } = await runForEnvironmentTest(
            undefined,
            this.test,
            environment
        );

        expect(APP_PROC.ENV_TEST_VAR).to.equals('');
    });
});
