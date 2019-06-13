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

The entry point for the adapter is `out/debugAdapter.js`.
