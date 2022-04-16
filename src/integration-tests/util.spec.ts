/*********************************************************************
 * Copyright (c) 2022 Kichwa Coders Canada, Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import { compareVersions, parseGdbVersionOutput } from '../util';
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
