# Change Log

## 1.6.0

- Fixes [`#421`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/421): Using "commands" command for breakpoints locks up debugger.
- Fixes [`#469`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/469): Issue with setting Program Counter ($PC$) register on Windows via GDB 12.1 using -var-assign.
- Fixes [`#473`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/473): Confusing error pop-ups without additional user value in some corner cases.
- chore [`#474`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/474): Patch yarn.lock to resolve to newer glob v10.5.0.
- Notable code changes:
    - New features:
        - Adds `frameRef` argument to `sendVarCreate`.
        - Adds `GDBBackend` specific error classes.
        - New protected methods on `GDBDebugSessionBase` that can be used to check if requests can proceed and if errors shall be reported:
          `canRequestProceed`, `shouldReportError`.

## 1.5.0

- Fixes [`#463`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/463): Cannot use custom reset while CPU is running.
- Fixes [`#465`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/465): UTF-8 'Failed to decode cstring' errors for GDB with CP1252 support only.
- Fixes [`#467`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/467): Skip pausing target at startup if request has no breakpoints
- Notable code changes:
    - New Features:
        - Adds `MIParser.hostCharset` getter/setter methods to configure host character set for decode of non-ASCII characters in c-strings.
        - Adds `sendCommandToGdb` and `sendCommandToOtherGdbs` to `GDBDebugSessionBase` to refactor GDB CLI command processing, and to synchronize use of selected GDB CLI commands between main and auxiliary GDB.
        - Adds `GDBDebugSessionBase.pauseIfRunning` to pause a running target without expectation of a subsequent continue operation.

## 1.4.1

- Fixes [`#400`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/400): Evaluation of variables to support RTOS Views extension.

## 1.4.0

- Implements [`#442`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/442): Support auxiliary GDB connections to allow selected operations while CPU running.
- Completes [`#422`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/422): Support data breakpoints for complex data types.
- Fixes [`#439`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/439): Missing thread names when attaching to targets that don’t stop on attach.
- Fixes [`#440`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/440): Automatically disable async mode in adapter if debug target does not support it.
- Notable code changes:
    - API changes:
        - `GDBTargetDebugSession.startGDBAndAttachToTarget` and `GDBDebugSessionBase.attachOrLaunchRequest`
          now call new protected methods `IGDBBackend.confirmAsyncMode`,`GDBDebugSessionBase.warnAsyncDisabled`, and
          `GDBDebugSessionBase.validateRequestArguments` to validate launch/attach arguments.
        - `GDBDebugSessionBase` has methods with changed signatures: `evaluateRequestGdbCommand`, `getFullPathExpression`, and
          `getAddr`.
    - New features:
        - New `NamedLogger` class which adds a prefix to log messages. Used in `MIParser` and `GDBBackend`.
        - Optional `name` argument for `IGDBBackendFactory.createBackend` that is passed through to `NamedLogger`
          instances.
        - New protected members on `GDBDebugSessionBase` that can be set/used by derived debug session classes:
          `auxGdb`, `isRemote`, `missingThreadNames`.

## 1.3.0

- Implements [`#422`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/422): Initial support for data breakpoints.
  **Note**: Initially supports global symbols with simple datatypes.
- Fixes [`#402`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/402): Better handle setting too many breakpoints.
- Fixes [`#407`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/407): Getting stuck on concurrent breakpoint setup on targets that don’t stop on attach.
- Fixes [`#408`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/408): Avoid unnecessary ThreadInfoRequests.
- Fixes [`#420`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/420): Disabling evaluate request error messages when hovering over comments.
- Fixes [`#427`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/427): Breakpoint source code reference to module disappears when breakpoint is hit.
- Fixes [`#428`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/issues/428): User experience issues in step operations on slow sessions.
- Fixes [`#437`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/437): `detach` request getting stuck on exited program.
- Fixes [`#444`](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/pull/444): Adding more robustness to warning messages of the evaluateRequest.

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
