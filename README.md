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

## Running

The entry point for the adapter is `cdtDebugAdapter` for local debugging
and `cdtDebugTargetAdapter` for target (remote) debugging.

### Command line arguments

#### `--server=PORT`

Start the adapter listening on the given port instead of on stdin/stdout.

#### `--config=INITIALCONFIG`

Start the adapter using the given configuration as a starting point for the args in `launch` or `attach` request.

For example, the default GDB can be set like this:

```sh
    node debugTargetAdapter.js --config='{"gdb":"arm-none-eabi-gdb"}'
```

The config can be passed on the command line as JSON, or a response file can be used by starting the argument with `@`.
The rest of the argument will be interpreted as a file name to read.
For example, to start the adapter defaulting to a process ID to attach to, create a file containing the JSON and reference it like this:

```sh
    cat >config.json <<END
    {
      "processId": 1234
    }
    END
    node debugAdapter.js --config=@config.json

```

#### `--config-frozen=FROZENCONFIG`

Similar to `--config`, the `--config-frozen` sets the provided configuration fields in the args to the `launch` or `attach` request to the given values, not allowing the user to override them.
Specifying which type of request is allowed (`launch` or `attach`) can be specified with the `request` field.
When freezing the type of request, regardless of which type of request the user requested, the frozen request type will be used.

For example, the adapter can be configured for program to be frozen to a specific value.
This may be useful for starting adapters in a container and exposing the server port.

```sh
    node debugAdapter.js --server=23221 --config-frozen='{"program":"/path/to/my.elf"}'
```

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
