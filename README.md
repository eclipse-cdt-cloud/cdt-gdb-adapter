# CDT GDB Debug Adapter

This is an implementation of the Debug Adapter Protocol for gdb.
It is loosely based on the Eclipse CDT MI layer.
We are at least learning from it.

## Building

Build is pretty simple. It uses webpack to bundle the adapter into a single gdbDebugAdapter.js file in the out directory.

```
npm install
npm run build
```
