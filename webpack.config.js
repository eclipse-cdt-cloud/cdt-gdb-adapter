const path = require('path');

module.exports = {
    target: 'node',
    mode: 'none',
    context: __dirname,
    resolve: {
        extensions: [ '.js' ]
    },
    entry: {
        gdbDebugAdapter: './out/debugAdapter.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        libraryTarget: 'commonjs',
        devtoolModuleFilenameTemplate: '[absolute-resource-path]'
    },
    devtool: 'source-map'
};