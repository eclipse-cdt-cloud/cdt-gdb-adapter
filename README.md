# CDT GDB Debug Adapter

This is an implementation of the Debug Adapter Protocol for gdb.
It is loosely based on the Eclipse CDT MI layer.
We are at least learning from it.

The source code can be found in the following repository: https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter

## Prerequisites

- Install **Node.js®** on your machine and ensure it is on your path.
    - The currently minimum required version is 20.x (LTS).
- Install **Yarn** which is used to build and execute scripts in this repository:
    ```sh
    > npm install -g yarn
    ```
- You need the following tools to run [`node-gyp`](https://github.com/nodejs/node-gyp)
  as part of the `nativebuild` script. This is optional during development and enables
  the use of the `openGdbConsole` configuration option on Linux.
    - Install **Python** version 3.8 or later.
    - Install a valid C++ toolchain for your host OS.
    - See the `node-gyp`
      [installation manual](https://github.com/nodejs/node-gyp?tab=readme-ov-file#installation)
      for more details.

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
See [Integration Tests readme](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/blob/main/src/integration-tests/README.md) for more details

## Debugging

To debug the adapter there are multiple options depending on how this module is integrated. For example,
if being used as a VS Code extension, see https://github.com/eclipse-cdt-cloud/cdt-gdb-vscode#building.

However, if you are writing tests and developing this module independently you can use the launch
configurations in the launch.json with VS Code. For example, if you open a \*.spec.ts file in VS Code
you can use the "Mocha Current File & launch Server" configuration to automatically launch the debug
server in one debugged process and the test in another.

## Releasing

### Prepare a release with a Pull Request

- Check if security scans require dependency updates in [package.json](./package.json).
  See [here](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/security/code-scanning).
- Update [CHANGELOG.md](./CHANGELOG.md).
    - Make sure it contains a section with the new version at the top of the file.  
      If individual commits after the last release already added a new section,
      then rename this section accordingly.
    - Review the commit history since the last release and add any user facing changes which
      haven't been added yet.
        - Add references to issues/PRs where possible. Use the format of previous releases.  
          Putting the displayed issue number in backticks is important to avoid that a web
          frontend automatically adds links. For example if referencing an issue/PR outside
          this repository which has the same number like an issue in the cdt-gdb-adapter repository.
        - Prefix issues from the sibling project `cdt-gdb-vscode` with its name if a change was
          made in cdt-gd-adapter to resolve it.
- Update the `version` entry in [package.json](./package.json) to the new version.  
  If the release only introduces defect fixes without significant feature changes,
  then bump the third ("patch") version digit.  
  Bump the second ("minor") version digit when new features have been added.  
  Update the first ("major") version digit if there are changes that remove features
  or significantly change existing behavior.

### Start the publishing

After the PR has been reviewed and merged, go to the GitHub [releases page](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/releases):

- Click `Draft a new release`.
- Click the `Select Tag` dropdown and enter the new version in the form `vX.Y.Z`.
- Click the `Generate release notes` button. This inserts a release name based on the
  selected tag. And creates a list of commits since the last release as release notes
  that are shown on GitHub.
- Select whether the release is a pre-release and/or if it is the latest release to show
  on the GitHub repository page. Usually, no change of the defaults is required.
- Click the `Publish release` button. This creates a new release and pushes the defined tag.
  The tag push triggers a GitHub action which builds, tests and finally uploads release
  artifacts. It may take a few minutes for this and the release's asset list to complete.

Note: If CI should fail, you can either try to retrigger the failing GitHub action.
Alternatively, you can manually remove the release and (!) the tag and retry with the same
version after fixing the issues.

Important: Making a CDT GDB Debug Adapter release requires you to be a [committer](https://www.eclipse.org/membership/become-a-member/committer/).
