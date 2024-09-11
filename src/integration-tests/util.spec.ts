/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { compareVersions } from '../util/compareVersions';
import { parseGdbVersionOutput } from '../util/parseGdbVersionOutput';
import { createEnvValues } from '../util/createEnvValues';
import { expect } from 'chai';
import * as os from 'os';

describe('util', async () => {
    it('compareVersions', async () => {
        expect(compareVersions('1', '2')).to.eq(-1);
        expect(compareVersions('2', '1')).to.eq(1);
        expect(compareVersions('11', '2')).to.eq(1);
        expect(compareVersions('2', '11')).to.eq(-1);
        expect(compareVersions('1.0', '2.0')).to.eq(-1);
        expect(compareVersions('2.0', '1.0')).to.eq(1);
        expect(compareVersions('1.0', '1.0')).to.eq(0);
        expect(compareVersions('1', '1.1')).to.eq(-1);
        expect(compareVersions('1', '0.1')).to.eq(1);
        expect(compareVersions('1.1', '1')).to.eq(1);
        expect(compareVersions('0.1', '1')).to.eq(-1);
        expect(compareVersions('1.0', '1')).to.eq(0);
        expect(compareVersions('1', '1.0')).to.eq(0);
        expect(compareVersions('1.asdf.0', '1.cdef.0')).to.eq(0);
        expect(compareVersions('1.asdf', '1')).to.eq(0);
        expect(compareVersions('1', '1.asdf')).to.eq(0);
    });
    it('parseGdbOutput', async () => {
        expect(parseGdbVersionOutput('GNU gdb 6.8.50.20080730')).to.eq(
            '6.8.50.20080730'
        );
        expect(
            parseGdbVersionOutput('GNU gdb (GDB) 6.8.50.20080730-cvs')
        ).to.eq('6.8.50.20080730');
        expect(
            parseGdbVersionOutput(
                'GNU gdb (Ericsson GDB 1.0-10) 6.8.50.20080730-cvs'
            )
        ).to.eq('6.8.50.20080730');
        expect(
            parseGdbVersionOutput('GNU gdb (GDB) Fedora (7.0-3.fc12)')
        ).to.eq('7.0');
        expect(parseGdbVersionOutput('GNU gdb 7.0')).to.eq('7.0');
        expect(parseGdbVersionOutput('GNU gdb Fedora (6.8-27.el5)')).to.eq(
            '6.8'
        );
        expect(
            parseGdbVersionOutput('GNU gdb Red Hat Linux (6.3.0.0-1.162.el4rh)')
        ).to.eq('6.3.0.0');
        expect(
            parseGdbVersionOutput(
                'GNU gdb (GDB) STMicroelectronics/Linux Base 7.4-71 [build Mar  1 2013]'
            )
        ).to.eq('7.4');
    });
});

describe('createEnvValues', () => {
    const initialENV = {
        VAR1: 'TEST1',
        VAR2: 'TEST2',
    };

    it('should not change source', () => {
        const copyOfInitialValues = {
            ...initialENV,
        };
        const valuesToInject = {
            VAR3: 'TEST3',
        };
        const result = createEnvValues(copyOfInitialValues, valuesToInject);

        expect(initialENV).to.deep.equals(copyOfInitialValues);
        expect(result).to.deep.equals({ ...initialENV, ...valuesToInject });
    });
    it('should injects basic values', () => {
        const valuesToInject = {
            VAR4: 'TEST4',
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({ ...initialENV, ...valuesToInject });
    });
    it('should not change existing case', function () {
        if (os.platform() !== 'win32') {
            // Skip the test if not Windows (Run only for Windows)
            this.skip();
        }
        const initialENV = {
            VAR1: 'TEST1',
        };
        const valuesToInject = {
            var1: 'TEST2',
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({ VAR1: 'TEST2' });
    });
    it('should inject both variable name cases', function () {
        if (os.platform() === 'win32') {
            // Skip the test for Windows
            this.skip();
        }
        const initialENV = {
            VAR1: 'TEST1',
        };
        const valuesToInject = {
            var1: 'TEST2',
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({ VAR1: 'TEST1', var1: 'TEST2' });
    });
    it('should perform delete operations', () => {
        const sourceENV = {
            VAR1: 'TEST1',
            VAR2: 'TEST2',
            VAR3: 'TEST3',
            VAR4: 'TEST4',
        };

        const expectedResult = {
            VAR2: 'TEST2',
            VAR4: 'TEST4',
        };
        const valuesToInject = {
            VAR1: null,
            VAR3: null,
        };

        const result = createEnvValues(sourceENV, valuesToInject);

        expect(result).to.deep.equals(expectedResult);
    });
});
