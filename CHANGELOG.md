# Change Log

## 1.1.0

- Fixes [#361](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/361): Fixes and robustness around remote target GDB connect, disconnect, and unexpected connection loss/termination of gdb and gdbserver.
- Enhancement [PR #384](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/384): Error handling for missing remote configuration like port.
- Implements [#381](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/381): Update NPM dependencies, Node and Python requirements, and Typescript version. Code changes as required for this.

## 1.0.11

- Feature Request [#388](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/388): Adding Instruction Breakpoints Support for the debug adapter. This enables breakpoints in Disassembly View.

## 1.0.10

- Refactor [#362](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/362): Cannot execute CLI commands like > interrupt from Debug Console while CPU is running
- Feature Request [#385](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/385): Setting a warning for enable/disable breakpoint commands

## 1.0.9

- Implements [#360](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/360): Support GDB/MI breakpoint notifications.
