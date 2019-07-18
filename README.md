# CDT GDB Debug Adapter

This is an implementation of the Debug Adapter Protocol for gdb.
It is loosely based on the Eclipse CDT MI layer.
We are at least learning from it.

## Building

Build is pretty simple.

```sh
yarn install
yarn build
```

The entry point for the adapter is `out/debugAdapter.js` for local debugging
and `out/debugTargetAdapter.js` for target (remote) debugging.g

## Testing

Testing of the adapter can be run with `yarn test`.

## Debugging

To debug the adapter there are multiple options depending on how this module is integrated. For example,
if being used as a VS Code extension, see https://github.com/eclipse-cdt/cdt-gdb-vscode/wiki/Building.

However, if you are writing tests and developing this module independently you can use the launch
configurations in the launch.json with VS Code. For example, if you open a *.spec.ts file in VS Code
you can use the "Mocha Current File & launch Server" configuration to automatically launch the debug
server in one debugged process and the test in another.
