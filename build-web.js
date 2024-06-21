/*********************************************************************
 * Copyright (c) 2024 Renesas Electronics Corporation and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
// @ts-check
const esbuild = require('esbuild');
const path = require('node:path');
const { nodeExternalsPlugin } = require('esbuild-node-externals');

/** @typedef {import('esbuild').BuildOptions} BuildOptions */

const args = process.argv.slice(2);
const optionWatch = args.includes('--watch');
const optionNoMinify = args.includes('--no-minify');
const sourceFolder = path.join(__dirname, 'src');
const distFolder = path.join(__dirname, 'dist');

/** @type {BuildOptions[]} */
const buildConfigurations = [
    {
        target: ['es2015'],
        platform: 'browser',
        format: 'cjs',
        minify: !optionNoMinify,
        bundle: true,
        sourcemap: true,
        entryPoints: [path.join(sourceFolder, 'web.ts')],
        outfile: path.join(distFolder, 'browser', 'web.js'),
        mainFields: ['browser', 'modules', 'main'],
        alias: {
            os: 'os-browserify',
            path: 'path-browserify',
            stream: 'stream-browserify',
        },
        plugins: [nodeExternalsPlugin()],
    },
];

if (optionWatch) {
    (async function watch() {
        await Promise.all([
            ...buildConfigurations.map((config) =>
                esbuild.context(config).then((context) => context.watch())
            ),
        ]);
    })();
} else {
    (async function build() {
        await Promise.all([
            ...buildConfigurations.map((config) => esbuild.build(config)),
        ]);
    })();
}
