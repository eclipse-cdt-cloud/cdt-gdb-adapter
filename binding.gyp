{
    'targets': [
        {
            'target_name': 'pty',
            'sources': ['src/native/pty.cc'],
            'conditions': [
                ['OS=="win"', { 'defines': ['WINDOWS'] }],
            ],
        },
    ],
}
