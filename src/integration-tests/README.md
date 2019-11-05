# Integration tests

This directory contains integration tests of the debug adapter.  Theses tests
spawn a debug adapter process and, using a "fake" client, drive a debug
session.  It uses the `gdb` in your `PATH`.

## Running the tests

1. Build the test programs: run `make` in the `test-programs` directory
2. Build the package as usual: run `yarn build` in the top-level directory
3. Run the tests: run `yarn test:integration` in the top-level directory

## Running the tests using Docker

The tests can be run on a docker container. This is useful to run the testsuite
in the same environment as it is run on the CI machine.

To do this, simply prefix the desired command (such as `yarn test`) with this
command to run it in docker:

`docker run --rm -it -v $(git rev-parse --show-toplevel):/work -w /work/$(git rev-parse --show-prefix) --cap-add=SYS_PTRACE --security-opt seccomp=unconfined quay.io/eclipse-cdt/cdt-infra-eclipse-full:latest`

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
