# CDT GDB Debug Adapter

This is an implementation of the Debug Adapter Protocol for gdb.
It is loosely based on the Eclipse CDT MI layer.
We are at least learning from it.

The source code can be found in the following repository: https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter

## Building

Build is pretty simple.

```sh
yarn
```

The entry point for the adapter is `out/debugAdapter.js` for local debugging
and `out/debugTargetAdapter.js` for target (remote) debugging.g

## Testing

Testing of the adapter can be run with `yarn test`. See [Integration Tests readme](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/blob/main/src/integration-tests/README.md)
for more details, including how to setup a Windows machine with msys2 to run the tests.

## Testing on GitHub Actions

Pull Requests built using GitHub actions.
In the GitHub actions result you can examine test report and download the `test-logs` artifacts which are the verbose logs of each test that was run.

## Debugging

To debug the adapter there are multiple options depending on how this module is integrated. For example,
if being used as a VS Code extension, see https://github.com/eclipse-cdt-cloud/cdt-gdb-vscode#building.

However, if you are writing tests and developing this module independently you can use the launch
configurations in the launch.json with VS Code. For example, if you open a \*.spec.ts file in VS Code
you can use the "Mocha Current File & launch Server" configuration to automatically launch the debug
server in one debugged process and the test in another.
