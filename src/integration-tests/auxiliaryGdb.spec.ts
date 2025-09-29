/*********************************************************************
 * Copyright (c) 2025 Arm Ltd and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { expect } from 'chai';
import { CdtDebugClient } from './debugClient';
import {
    standardBeforeEach,
    testProgramsDir,
    fillDefaults,
    isRemoteTest,
    gdbAsync,
    gdbNonStop,
    getScopes,
    Scope,
} from './utils';
import { TargetLaunchRequestArguments } from '../types/session';
import { DebugProtocol } from '@vscode/debugprotocol';
import { hexToBase64 } from '../web';

// This mock adapter creates a standard GDB backend and a stub auxiliary GDB backend
const auxiliaryGdbAdapter =
    'integration-tests/mocks/debugAdapters/auxiliaryGdb.js';

describe('auxiliary gdb', async function () {
    const program = path.join(testProgramsDir, 'loopforever');
    let dc: CdtDebugClient;
    let stdOutput: string[] = [];

    // Auxiliary GDB only supported for remote all-stop mode for the time being
    const skipTest = (): boolean => {
        return !isRemoteTest || !gdbAsync || gdbNonStop;
    };

    const completeStartup = async function (): Promise<Scope> {
        // Complete 'startup', to be reviewed when startup sequence is improved.
        // Note: we just care about being stopped, not the exact location.
        await Promise.all([
            dc.waitForEvent('stopped'),
            dc.configurationDoneRequest(),
        ]);

        // Get scopes for a valid frame ID while target is paused
        return getScopes(dc);
    };

    const stdOutputContains = (text: string): boolean => {
        return stdOutput.some((line) => line.startsWith(text));
    };

    const stdOutputLacks = (text: string): boolean => {
        return stdOutput.every((line) => !line.includes(text));
    };

    const extracAddress = (addressReference: string): string => {
        return addressReference.slice(0, addressReference.indexOf(' '));
    };

    beforeEach(async function () {
        dc = await standardBeforeEach(auxiliaryGdbAdapter);
        // Capture output events, spyOn doesn't work well with logger
        dc.on('output', (event) => {
            if (event.body.category === 'stdout') {
                stdOutput.push(event.body.output);
            }
        });
        await dc.launchRequest(
            fillDefaults(this.currentTest, {
                program,
                auxiliaryGdb: true,
            } as TargetLaunchRequestArguments)
        );
    });

    afterEach(async function () {
        if (dc) {
            await dc.stop();
        }
        stdOutput = [];
    });

    it('creates auxiliary connection', async function () {
        if (skipTest()) {
            this.skip();
        }
        // Test if relevant output events came during 'beforeEach'
        expect(
            stdOutputContains('GDB Remote session: connect to auxiliary GDB')
        ).to.be.true;
        expect(
            stdOutputContains(
                '[AUX-MOCK] sendCommand: target remote localhost:'
            )
        ).to.be.true;
    });

    it('evaluates expression through main connection when paused', async function () {
        if (skipTest()) {
            this.skip();
        }

        // Complete startup sequence for well-defined state.
        const scope = await completeStartup();

        // Clear stdOutput buffer and evaluate expression while target is paused
        stdOutput = [];
        const response = (await dc.evaluateRequest({
            expression: 'var1',
            context: 'repl',
            frameId: scope.frame.id,
        })) as DebugProtocol.EvaluateResponse;
        expect(response.success).to.be.true;
        expect(response.body.variablesReference).to.equal(0);

        // No AUX-MOCK functions must have been called
        expect(stdOutputLacks('[AUX-MOCK]')).to.be.true;
    });

    it('evaluates expression through auxiliary connection when running and gets children', async function () {
        if (skipTest()) {
            this.skip();
        }

        // Complete startup sequence for well-defined state.
        const scope = await completeStartup();

        // Set target running
        await dc.continueRequest({ threadId: scope.thread.id });

        // Clear stdOutput buffer and evaluate expression while target is running
        stdOutput = [];
        const evalResponse = (await dc.evaluateRequest({
            expression: 'var1',
            context: 'repl',
        })) as DebugProtocol.EvaluateResponse;
        expect(evalResponse.success).to.be.true;
        expect(evalResponse.body.result).to.equal('MockValue');
        expect(evalResponse.body.variablesReference).not.to.equal('0');

        // -var-create for AUX-MOCK must have been called
        expect(
            stdOutputContains('[AUX-MOCK] sendCommand: -var-create - @ "var1"')
        ).to.be.true;

        // Clear stdOutput buffer and get expression children while target is running
        stdOutput = [];
        const varsResponse = (await dc.variablesRequest({
            variablesReference: evalResponse.body.variablesReference,
        } as DebugProtocol.VariablesArguments)) as DebugProtocol.VariablesResponse;
        expect(evalResponse.success).to.be.true;
        expect(varsResponse.body.variables.length).to.equal(1);
        expect(varsResponse.body.variables[0].name).to.equal('MockChildExp');
        expect(varsResponse.body.variables[0].value).to.equal('MockChildValue');

        // -var-list-children for AUX-MOCK must have been called
        expect(
            stdOutputContains(
                '[AUX-MOCK] sendCommand: -var-list-children 1 MockVariable'
            )
        ).to.be.true;
    });

    it('reads and writes memory through main connection when paused', async function () {
        if (skipTest()) {
            this.skip();
        }

        // Complete startup sequence for well-defined state.
        const scope = await completeStartup();

        // Get address of var1 while target is paused to have a sensible memory address
        const evalResponse = (await dc.evaluateRequest({
            expression: '&var1',
            context: 'repl',
            frameId: scope.frame.id,
        })) as DebugProtocol.EvaluateResponse;
        expect(evalResponse.success).to.be.true;

        // Returned result can contain variable name in addition to address
        const address = extracAddress(evalResponse.body.result);

        // Clear stdOutput buffer and read memory at address while target is paused
        stdOutput = [];
        const readMemoryResponse = (await dc.readMemoryRequest({
            memoryReference: address,
            count: 4,
        } as DebugProtocol.ReadMemoryArguments)) as DebugProtocol.ReadMemoryResponse;
        expect(readMemoryResponse.success).to.be.true;
        const resultAddress = BigInt(readMemoryResponse.body?.address ?? '0');
        expect(resultAddress).to.equal(BigInt(address));

        // No AUX-MOCK functions must have been called
        expect(stdOutput.every((line) => !line.startsWith('[AUX-MOCK]'))).to.be
            .true;

        // Clear stdOutput buffer and write memory at address while target is paused
        stdOutput = [];
        const writeMemoryResponse = (await dc.writeMemoryRequest({
            memoryReference: address,
            data: hexToBase64('AABBCCDD'),
        } as DebugProtocol.WriteMemoryArguments)) as DebugProtocol.WriteMemoryResponse;
        expect(writeMemoryResponse.success).to.be.true;

        // No AUX-MOCK functions must have been called
        expect(stdOutput.every((line) => !line.startsWith('[AUX-MOCK]'))).to.be
            .true;
    });

    it('reads and writes memory through auxiliary connection when running', async function () {
        if (skipTest()) {
            this.skip();
        }

        // Complete startup sequence for well-defined state.
        const scope = await completeStartup();

        // Get address of var1 while target is paused to have a sensible memory address
        const evalResponse = (await dc.evaluateRequest({
            expression: '&var1',
            context: 'repl',
            frameId: scope.frame.id,
        })) as DebugProtocol.EvaluateResponse;
        expect(evalResponse.success).to.be.true;

        // Returned result can contain variable name in addition to address
        const address = extracAddress(evalResponse.body.result);

        // Set target running
        await dc.continueRequest({ threadId: scope.thread.id });

        // Clear stdOutput buffer and read memory at address while target is running
        stdOutput = [];
        const readMemoryResponse = (await dc.readMemoryRequest({
            memoryReference: address,
            count: 4,
        } as DebugProtocol.ReadMemoryArguments)) as DebugProtocol.ReadMemoryResponse;
        expect(readMemoryResponse.success).to.be.true;
        const resultAddress = BigInt(readMemoryResponse.body?.address ?? '0');
        expect(resultAddress).to.equal(BigInt('0x00000000')); // Mock always returns 0

        // -data-read-memory-bytes for AUX-MOCK must have been called
        expect(
            stdOutputContains(
                '[AUX-MOCK] sendCommand: -data-read-memory-bytes -o 0 '
            )
        ).to.be.true;

        // Clear stdOutput buffer and write memory at address while target is running
        stdOutput = [];
        const writeMemoryResponse = (await dc.writeMemoryRequest({
            memoryReference: address,
            data: hexToBase64('AABBCCDD'),
        } as DebugProtocol.WriteMemoryArguments)) as DebugProtocol.WriteMemoryResponse;
        expect(writeMemoryResponse.success).to.be.true;

        // -var-list-children for AUX-MOCK must have been called
        expect(
            stdOutputContains(
                '[AUX-MOCK] sendCommand: -data-write-memory-bytes '
            )
        ).to.be.true;
    });
});
