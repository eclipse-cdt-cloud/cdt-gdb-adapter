/*********************************************************************
 * Copyright (c) 2023 Kichwa Coders Canada Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/

import * as path from 'path';
import { CdtDebugClient } from './debugClient';
import {
    fillDefaults,
    resolveLineTagLocations,
    standardBeforeEach,
    testProgramsDir,
} from './utils';
import { expect } from 'chai';

/**
 * To test that cwd is set properly we remove the compilation directory from the executable,
 * see the makefile for that part, and then launch with a variety of executable/cwd locations
 * to make sure that we can insert breakpoints when we expect to, and cannot insert breakpoints
 * when we force gdb not to be able to find the source
 */
describe('gdb cwd', function () {
    let dc: CdtDebugClient;
    const program = path.join(testProgramsDir, 'cwd.exe');
    const programRelocated = path.join(testProgramsDir, 'Debug', 'cwd.exe');
    const src = path.join(testProgramsDir, 'cwd.c');
    const lineTags = {
        'STOP HERE': 0,
    };

    before(function () {
        resolveLineTagLocations(src, lineTags);
    });

    beforeEach(async function () {
        dc = await standardBeforeEach();
    });

    afterEach(async function () {
        await dc.stop();
    });

    it('default cwd finds source in program directory', async function () {
        await dc.launchRequest(
            fillDefaults(this.test, {
                program: program,
            })
        );

        const bps = await dc.setBreakpointsRequest({
            lines: [lineTags['STOP HERE']],
            breakpoints: [{ line: lineTags['STOP HERE'], column: 1 }],
            source: { path: src },
        });
        expect(bps.body.breakpoints[0].verified).to.eq(true);
    });

    it('explicit cwd finds source in program directory', async function () {
        await dc.launchRequest(
            fillDefaults(this.test, {
                program: program,
                cwd: testProgramsDir,
            })
        );

        const bps = await dc.setBreakpointsRequest({
            lines: [lineTags['STOP HERE']],
            breakpoints: [{ line: lineTags['STOP HERE'], column: 1 }],
            source: { path: src },
        });
        expect(bps.body.breakpoints[0].verified).to.eq(true);
    });

    it('default cwd does not find source with relocated program', async function () {
        await dc.launchRequest(
            fillDefaults(this.test, {
                program: programRelocated,
            })
        );

        const bps = await dc.setBreakpointsRequest({
            lines: [lineTags['STOP HERE']],
            breakpoints: [{ line: lineTags['STOP HERE'], column: 1 }],
            source: { path: src },
        });
        expect(bps.body.breakpoints[0].verified).to.eq(false);
    });

    it('explicitly incorrect cwd does not finds source with relocated program', async function () {
        await dc.launchRequest(
            fillDefaults(this.test, {
                program: programRelocated,
                cwd: path.join(testProgramsDir, 'EmptyDir'),
            })
        );

        const bps = await dc.setBreakpointsRequest({
            lines: [lineTags['STOP HERE']],
            breakpoints: [{ line: lineTags['STOP HERE'], column: 1 }],
            source: { path: src },
        });
        expect(bps.body.breakpoints[0].verified).to.eq(false);
    });

    it('explicitly correct cwd does find source with relocated program', async function () {
        await dc.launchRequest(
            fillDefaults(this.test, {
                program: programRelocated,
                cwd: testProgramsDir,
            })
        );

        const bps = await dc.setBreakpointsRequest({
            lines: [lineTags['STOP HERE']],
            breakpoints: [{ line: lineTags['STOP HERE'], column: 1 }],
            source: { path: src },
        });
        expect(bps.body.breakpoints[0].verified).to.eq(true);
    });
});
