# Integration tests

This directory contains integration tests of the debug adapter.  Theses tests
spawn a debug adapter process and, using a "fake" client, drive a debug
session.  It uses the `gdb` in your `PATH`.

## Running the tests

1. Build the test programs: run `make` in the `test-programs` directory
2. Build the package as usual: run `npm run build` in the top-level directory
3. Run the tests: run `npm run test:integration` in the top-level directory

## Debugging tips

Defining the `INSPECT_DEBUG_ADAPTER` environment variable will cause the
testsuite to pass the `--inspect-brk` flag to the node interpreter running the
debug adapter.  This lets you attach with a debugger and resume execution.

One easily available debugger is built in the Chromium/Chrome browser.  Navigate
to [chrome://inspect](chrome://inspect), the debug adapter waiting to be
attached to should appear under "Remote Target".

When debugging a test case, you will likely want to run just this one.  You can
do so by changing the test declaration:

    it('should do something', ...)

to

    it.only('should do something', ...)
