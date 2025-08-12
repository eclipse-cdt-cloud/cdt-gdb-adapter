# Change Log

## Unreleased

- Fixes [`#427`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/427): Breakpoint source code reference to module disappears when breakpoint is hit

## 1.2.0

- Fixes [cdt-gdb-vscode `#173`](https://github.com/eclipse-cdt-cloud/cdt-gdb-vscode/issues/173): Add `target`>`watchServerProcess` setting to ignore early exit of `server` executable, e.g. if a launcher for actual gdbserver.
- Fixes [`#330`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/330) / [cdt-gdb-vscode `#151`](https://github.com/eclipse-cdt-cloud/cdt-gdb-vscode/issues/151): Cannot remove breakpoint when debugging (Windows, Theia).
- Fixes [`#362`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/362): Cannot execute CLI commands like `> interrupt` from Debug Console while CPU is running.  
  **Note**: Depends on whether a blocking command was executed from CLI before.
- Fixes [`#367`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/367): Debugging with `gdbtarget` fails if `program` is omitted, despite user doc claiming it's optional.
- Fixes [`#398`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/398): Give gdbserver time to gracefully disconnect before terminating it.
- Enhancement: Improve error message if setting more HW breakpoints than supported by target.
- Enhancement: Improve error message on `-target-select` timeout on Windows.

## 1.1.0

- Fixes [`#361`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/361): Fixes and robustness around remote target GDB connect, disconnect, and unexpected connection loss/termination of gdb and gdbserver.
- Enhancement [PR `#384`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/384): Error handling for missing remote configuration like port.
- Implements [`#381`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/381): Update NPM dependencies, Node and Python requirements, and Typescript version. Code changes as required for this.

## 1.0.11

- Feature Request [`#388`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/388): Adding Instruction Breakpoints Support for the debug adapter. This enables breakpoints in Disassembly View.

## 1.0.10

- Refactor [`#362`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/362): Cannot execute CLI commands like > interrupt from Debug Console while CPU is running
- Feature Request [`#385`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/385): Setting a warning for enable/disable breakpoint commands

## 1.0.9

- Implements [`#360`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/360): Support GDB/MI breakpoint notifications.
