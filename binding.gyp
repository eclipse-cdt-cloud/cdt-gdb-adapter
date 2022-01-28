{
    'targets': [
        {
            'target_name': 'pty',
            'sources': ['src/native/pty.cc'],
            'conditions': [
                ['OS=="win"', { 'defines': ['WINDOWS', 'NAPI_CPP_EXCEPTIONS'] }],
                ['OS=="mac"', { 'defines': ['MAC'] }],
                ['OS=="linux"', { 'defines': ['LINUX'] }],
            ],
            # https://github.com/nodejs/node/blob/master/doc/api/n-api.md#n-api-version-matrix
            'defines': ['NAPI_VERSION=4'],
        },
    ],
    'target_defaults': {
        # https://github.com/nodejs/node-addon-api/blob/master/doc/setup.md#installation-and-usage
        # Setup N-API C++ wrappers:
        'include_dirs': ["<!@(node -p \"require('node-addon-api').include\")"],
        'dependencies': ["<!(node -p \"require('node-addon-api').gyp\")"],
        # Use C++ exceptions:
        'cflags!': [ '-fno-exceptions' ],
        'cflags_cc!': [ '-fno-exceptions' ],
        'configurations': {
            'Release': {
                'msvs_settings': {
                    'VCCLCompilerTool': { 'ExceptionHandling': 1 },
                },
                'xcode_settings': {
                    'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
                    'CLANG_CXX_LIBRARY': 'libc++',
                    'MACOSX_DEPLOYMENT_TARGET': '10.7',
                },
            },
        },
    },
}
