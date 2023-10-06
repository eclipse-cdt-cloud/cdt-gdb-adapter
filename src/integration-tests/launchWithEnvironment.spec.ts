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
    getCharStringVariableValue,
    getScopes,
    hardwareBreakpoint,
    isRemoteTest,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { platform } from 'os';

const debugAdapter = 'debugAdapter.js';
const debugTargetAdapter = 'debugTargetAdapter.js';

describe('launch with environment', function () {
    let dc: CdtDebugClient | undefined;
    const runForEnvironmentTest = async (
        adapter?: string,
        test?: Mocha.Runnable | undefined,
        environment?: Record<string, string | null> | undefined,
        targetEnvironment?: Record<string, string | null> | undefined
    ) => {
        dc = await standardBeforeEach(adapter || debugAdapter);
        await dc.launchRequest(
            fillDefaults(test, {
                program: path.join(
                    testProgramsDir,
                    platform() === 'win32' ? 'vars_env.exe' : 'vars_env'
                ),
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
                    line: 22,
                },
            ],
        });
        expect(bpResp.body.breakpoints.length).eq(1);
        expect(bpResp.body.breakpoints[0].verified).eq(true);
        expect(bpResp.body.breakpoints[0].message).eq(undefined);
        await dc.configurationDoneRequest();
        await dc.waitForEvent('stopped');
        const scope = await getScopes(dc);
        const vr = scope.scopes.body.scopes[0].variablesReference;
        const vars = await dc.variablesRequest({ variablesReference: vr });

        // Getting the environment variables in running application process.
        const varPATHInApp = vars.body.variables.find((i) => i.name === 'path');
        const varTEST1InApp = vars.body.variables.find(
            (i) => i.name === 'test1'
        );
        const varTEST2InApp = vars.body.variables.find(
            (i) => i.name === 'test2'
        );
        const varTEST3InApp = vars.body.variables.find(
            (i) => i.name === 'test3'
        );
        const varTEST4InApp = vars.body.variables.find(
            (i) => i.name === 'test4'
        );

        // Getting the environment variables in GDB process.
        const varTEST1InGDB = await dc?.send('cdt-gdb-tests/executeCommand', {
            command: `show environment VARTEST1`,
        });
        const varTEST2InGDB = await dc?.send('cdt-gdb-tests/executeCommand', {
            command: `show environment VARTEST2`,
        });
        const varTEST3InGDB = await dc?.send('cdt-gdb-tests/executeCommand', {
            command: `show environment VARTEST3`,
        });
        const varTEST4InGDB = await dc?.send('cdt-gdb-tests/executeCommand', {
            command: `show environment VARTEST4`,
        });

        // Control that application contains the variables to read.
        expect(varPATHInApp).not.equals(undefined, 'Variable `path` not found');
        expect(varTEST1InApp).not.equals(
            undefined,
            'Variable `test1` not found'
        );
        expect(varTEST2InApp).not.equals(
            undefined,
            'Variable `test2` not found'
        );
        expect(varTEST3InApp).not.equals(
            undefined,
            'Variable `test3` not found'
        );
        expect(varTEST4InApp).not.equals(
            undefined,
            'Variable `test4` not found'
        );

        // String values of environment variables read from the running application
        const APP_PROC = {
            ENV_PATH: getCharStringVariableValue(varPATHInApp!),
            ENV_VARTEST1: getCharStringVariableValue(varTEST1InApp!),
            ENV_VARTEST2: getCharStringVariableValue(varTEST2InApp!),
            ENV_VARTEST3: getCharStringVariableValue(varTEST3InApp!),
            ENV_VARTEST4: getCharStringVariableValue(varTEST4InApp!),
        };

        // Output of the "show variable <VARNAME>" command
        // (gets value of 'undefined' in any unexpected error occured in test)
        const GDB_PROC = {
            SHOW_VARTEST1: varTEST1InGDB?.body?.console?.[1].trim(),
            SHOW_VARTEST2: varTEST2InGDB?.body?.console?.[1].trim(),
            SHOW_VARTEST3: varTEST3InGDB?.body?.console?.[1].trim(),
            SHOW_VARTEST4: varTEST4InGDB?.body?.console?.[1].trim(),
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
        if (hardwareBreakpoint) {
            this.skip();
        }
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

        expect(APP_PROC.ENV_VARTEST1).to.equals('TEST1');
        expect(APP_PROC.ENV_VARTEST2).to.equals('TEST2');
        expect(APP_PROC.ENV_VARTEST3).to.equals('TEST3');
        expect(APP_PROC.ENV_VARTEST4).to.equals('TEST4');

        expect(GDB_PROC.SHOW_VARTEST1).to.equals('VARTEST1 = TEST1');
        expect(GDB_PROC.SHOW_VARTEST2).to.equals('VARTEST2 = TEST2');
        expect(GDB_PROC.SHOW_VARTEST3).to.equals('VARTEST3 = TEST3');
        expect(GDB_PROC.SHOW_VARTEST4).to.equals('VARTEST4 = TEST4');
    });

    it('checks setting environment variables with debugAdapter', async function () {
        if (hardwareBreakpoint || (platform() === 'win32' && !isRemoteTest)) {
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

        expect(APP_PROC.ENV_VARTEST1).to.equals('TEST1');
        expect(APP_PROC.ENV_VARTEST2).to.equals('TEST2');
        expect(APP_PROC.ENV_VARTEST3).to.equals(null);
        expect(APP_PROC.ENV_VARTEST4).to.equals(null);

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
        if (hardwareBreakpoint) {
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
            debugTargetAdapter,
            this.test,
            environment,
            targetEnvironment
        );

        expect(APP_PROC.ENV_VARTEST1).to.equals('TEST1_SOMEDIFFERENT_VALUE');
        expect(APP_PROC.ENV_VARTEST2).to.equals('TEST2_SOMEDIFFERENT_VALUE');
        expect(APP_PROC.ENV_VARTEST3).to.equals('TEST3_SOMEDIFFERENT_VALUE');
        expect(APP_PROC.ENV_VARTEST4).to.equals('TEST4_SOMEDIFFERENT_VALUE');

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
        if (hardwareBreakpoint) {
            this.skip();
        }
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

        expect(APP_PROC.ENV_VARTEST1).to.equals('TEST1_SOMEDIFFERENT_VALUE');
        expect(APP_PROC.ENV_VARTEST2).to.equals('TEST2_SOMEDIFFERENT_VALUE');
        expect(APP_PROC.ENV_VARTEST3).to.equals(null);
        expect(APP_PROC.ENV_VARTEST4).to.equals(null);

        expect(GDB_PROC.SHOW_VARTEST1).to.equals('VARTEST1 = TEST1');
        expect(GDB_PROC.SHOW_VARTEST2).to.equals('VARTEST2 = TEST2');
        expect(GDB_PROC.SHOW_VARTEST3).to.equals('VARTEST3 = TEST3');
        expect(GDB_PROC.SHOW_VARTEST4).to.equals('VARTEST4 = TEST4');
    });

    it('ensures that path is not null', async function () {
        if (hardwareBreakpoint) {
            this.skip();
        }
        const { APP_PROC } = await runForEnvironmentTest(undefined, this.test);

        expect(APP_PROC.ENV_PATH).not.to.equals(null);
    });

    it('ensures that new entries could be injected to path', async function () {
        if (hardwareBreakpoint) {
            this.skip();
        }
        const pathToAppend = __dirname;
        const currentPathValue = process.env.PATH || process.env.Path;
        const environment = {
            PATH: `${pathToAppend}${path.delimiter}${currentPathValue}`,
        };
        const { APP_PROC } = await runForEnvironmentTest(
            undefined,
            this.test,
            environment
        );

        expect(APP_PROC.ENV_PATH).not.to.equals(null);

        if (platform() === 'win32') {
            // Win32 test platform auto inject another folder to the front of the list.
            // So we have a little bit different test here.
            const entriesInPath = APP_PROC.ENV_PATH!.split(path.delimiter).map(
                (i) => i.replace(/\\\\/g, '\\')
            );
            expect(
                entriesInPath,
                'Path does not include appended folder'
            ).to.includes(pathToAppend);
        } else {
            const entriesInPath = APP_PROC.ENV_PATH!.split(path.delimiter);
            expect(entriesInPath[0]).to.equals(pathToAppend);
        }
    });

    it('check setting null will delete the variable', async function () {
        if (platform() === 'win32' || hardwareBreakpoint) {
            this.skip();
        }
        const environment = {
            PATH: null,
        };

        const { APP_PROC } = await runForEnvironmentTest(
            undefined,
            this.test,
            environment
        );

        expect(APP_PROC.ENV_PATH).to.equals(null);
    });
});
