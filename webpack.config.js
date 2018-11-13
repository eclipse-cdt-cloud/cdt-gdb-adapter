const path = require('path');

module.exports = {
    target: 'node',
    mode: 'none',
    context: __dirname,
    resolve: {
        extensions: [ '.ts', '.js' ]
    },
    entry: {
        debugAdapter: './src/debugAdapter.ts'
    },
    output: {
        path: path.resolve(__dirname, 'out'),
        filename: '[name].js',
        libraryTarget: 'commonjs',
        devtoolModuleFilenameTemplate: '[absolute-resource-path]'
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    compilerOptions: {
                        sourceMap: true
                    }
                }
            }
        ]
    }
};