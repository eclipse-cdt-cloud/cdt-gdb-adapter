/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import {
    buildString,
    compareVersions,
    createEnvValues,
    parseGdbVersionOutput,
} from '../util';
import { expect } from 'chai';

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

describe('buildString', () => {
    const regex1 = /%([^%]+)%/g;
    const regex2 = /\$(\w+)/g;
    const regex3 = /\${env.([^}]+)}/g;

    it('should not change if no key included', () => {
        const valuesToInject = {
            VAR1: 'VAR1',
        };
        const result = buildString(
            'BUILD_STRING_TEST_VALUE',
            valuesToInject,
            regex1
        );

        expect(result).equals('BUILD_STRING_TEST_VALUE');
    });

    it('should not change if no key included on multiple regex', () => {
        const valuesToInject = {
            VAR1: 'TEST1_VALUE',
        };
        const result = buildString(
            'BUILD_STRING_TEST_VALUE',
            valuesToInject,
            regex1,
            regex2,
            regex3
        );

        expect(result).equals('BUILD_STRING_TEST_VALUE');
    });

    it('should change if key included', () => {
        const valuesToInject = {
            VAR1: 'TEST1_VALUE',
        };
        const result = buildString(
            'TEST VALUE %VAR1%',
            valuesToInject,
            regex1,
            regex2,
            regex3
        );

        expect(result).equals('TEST VALUE TEST1_VALUE');
    });

    it('should change if key included on multiple regex', () => {
        const valuesToInject = {
            VAR1: 'TEST1_VALUE',
        };
        const result = buildString(
            'TEST VALUE %VAR1%, also $VAR1, and also ${env.VAR1}',
            valuesToInject,
            regex1,
            regex2,
            regex3
        );

        expect(result).equals(
            'TEST VALUE TEST1_VALUE, also TEST1_VALUE, and also TEST1_VALUE'
        );
    });

    it('should not change if key not found', () => {
        const valuesToInject = {
            VAR1: 'TEST1_VALUE',
        };
        const result = buildString(
            'TEST VALUE %VAR2%, also $VAR2, and also ${env.VAR2}',
            valuesToInject,
            regex1,
            regex2,
            regex3
        );

        expect(result).equals(
            'TEST VALUE %VAR2%, also $VAR2, and also ${env.VAR2}'
        );
    });

    it('should change only found keys and leave others unchanged', () => {
        const valuesToInject = {
            VAR1: 'TEST1_VALUE',
        };
        const result = buildString(
            'TEST VALUE %VAR1%, also $VAR2, and also ${env.VAR3}',
            valuesToInject,
            regex1,
            regex2,
            regex3
        );

        expect(result).equals(
            'TEST VALUE TEST1_VALUE, also $VAR2, and also ${env.VAR3}'
        );
    });
});

describe('createEnvValues', () => {
    const initialENV = {
        VAR1: 'TEST1',
        VAR2: 'TEST2',
        var3: 'TEST3',
        _VARU1: 'TESTU1',
        _VARU2_: 'TESTU2',
        _VAR_U3_: 'TESTU2',
        _var_u4_: 'TESTU2',
    };

    it('should not change source', () => {
        const copyOfInitialValues = {
            ...initialENV,
        };
        const valuesToInject = {
            VAR4: 'TEST4',
        };
        const result = createEnvValues(copyOfInitialValues, valuesToInject);

        expect(initialENV).to.deep.equals(copyOfInitialValues);
        expect(result).to.deep.equals({ ...initialENV, ...valuesToInject });
    });
    it('should injects basic values', () => {
        const valuesToInject = {
            VAR5: 'TEST5',
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({ ...initialENV, ...valuesToInject });
    });
    it('should injection formats', () => {
        const valuesToInject = {
            VARFORMATTEST1: '$VAR1',
            VARFORMATTEST2: '%VAR1%',
            VARFORMATTEST3: '${env.VAR1}',
            VARFORMATTEST4: '$VAR2;SOME DATA',
            VARFORMATTEST5: '%VAR2%;SOME DATA',
            VARFORMATTEST6: '${env.VAR2};SOME DATA',
            VARFORMATTEST7: '$var3:SOME DATA',
            VARFORMATTEST8: '%var3%:SOME DATA',
            VARFORMATTEST9: '${env.var3}:SOME DATA',
            VARFORMATTEST10: '$VAR1 SOME DATA',
            VARFORMATTEST11: '%VAR1% SOME DATA',
            VARFORMATTEST12: '${env.VAR1} SOME DATA',
        };

        const valuesExpectedInjected = {
            VARFORMATTEST1: initialENV.VAR1,
            VARFORMATTEST2: initialENV.VAR1,
            VARFORMATTEST3: initialENV.VAR1,
            VARFORMATTEST4: `${initialENV.VAR2};SOME DATA`,
            VARFORMATTEST5: `${initialENV.VAR2};SOME DATA`,
            VARFORMATTEST6: `${initialENV.VAR2};SOME DATA`,
            VARFORMATTEST7: `${initialENV.var3}:SOME DATA`,
            VARFORMATTEST8: `${initialENV.var3}:SOME DATA`,
            VARFORMATTEST9: `${initialENV.var3}:SOME DATA`,
            VARFORMATTEST10: `${initialENV.VAR1} SOME DATA`,
            VARFORMATTEST11: `${initialENV.VAR1} SOME DATA`,
            VARFORMATTEST12: `${initialENV.VAR1} SOME DATA`,
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({
            ...initialENV,
            ...valuesExpectedInjected,
        });
    });
    it('should injection formats with underscore', () => {
        const valuesToInject = {
            VARFORMATTEST1: '$_VARU1',
            VARFORMATTEST2: '%_VARU1%',
            VARFORMATTEST3: '${env._VARU1}',
            VARFORMATTEST4: '$_VARU2_;SOME DATA',
            VARFORMATTEST5: '%_VARU2_%;SOME DATA',
            VARFORMATTEST6: '${env._VARU2_};SOME DATA',
            VARFORMATTEST7: '$_VAR_U3_:SOME DATA',
            VARFORMATTEST8: '%_VAR_U3_%:SOME DATA',
            VARFORMATTEST9: '${env._VAR_U3_}:SOME DATA',
            VARFORMATTEST10: '$_var_u4_ SOME DATA',
            VARFORMATTEST11: '%_var_u4_% SOME DATA',
            VARFORMATTEST12: '${env._var_u4_} SOME DATA',
        };

        const valuesExpectedInjected = {
            VARFORMATTEST1: initialENV._VARU1,
            VARFORMATTEST2: initialENV._VARU1,
            VARFORMATTEST3: initialENV._VARU1,
            VARFORMATTEST4: `${initialENV._VARU2_};SOME DATA`,
            VARFORMATTEST5: `${initialENV._VARU2_};SOME DATA`,
            VARFORMATTEST6: `${initialENV._VARU2_};SOME DATA`,
            VARFORMATTEST7: `${initialENV._VAR_U3_}:SOME DATA`,
            VARFORMATTEST8: `${initialENV._VAR_U3_}:SOME DATA`,
            VARFORMATTEST9: `${initialENV._VAR_U3_}:SOME DATA`,
            VARFORMATTEST10: `${initialENV._var_u4_} SOME DATA`,
            VARFORMATTEST11: `${initialENV._var_u4_} SOME DATA`,
            VARFORMATTEST12: `${initialENV._var_u4_} SOME DATA`,
        };
        const result = createEnvValues(initialENV, valuesToInject);

        expect(result).to.deep.equals({
            ...initialENV,
            ...valuesExpectedInjected,
        });
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
