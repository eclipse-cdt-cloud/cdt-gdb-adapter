# Integration tests

This directory contains integration tests of the debug adapter.  Theses tests
spawn a debug adapter process and, using a "fake" client, drive a debug
session.  It uses the `gdb` in your `PATH`.

## Running the tests

1. Build the test programs: run `make` in the `test-programs` directory
2. Build the package as usual: run `npm run build` in the top-level directory
3. Run the tests: run `npm run test:integration` in the top-level directory

## Debugging tips

To debug, use the included launch configurations in the launch.json file for this vscode project.

'Mocha All' will run all compiled spec.js files in the {workspace}/dist/integration-tests/ directory.
'Mocha Current File' will run the currently open spec.js file in the editor window. You can find the corresponding spec.js file for a given spec.ts file in the directory listed above.

Breakpoints can be set in the corresponding spec.ts file and will work as expected, though stepping 
may take you into compiled or framework .js files. 
It may be possible with some additional configuration to run the spec.ts files directly.

When debugging a test case, you will likely want to run just this one.  You can
do so by changing the test declaration:

    it('should do something', ...)

to

    it.only('should do something', ...)
