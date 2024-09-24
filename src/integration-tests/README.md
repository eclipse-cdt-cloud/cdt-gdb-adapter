# Integration tests

This directory contains integration tests of the debug adapter. Theses tests
spawn a debug adapter process and, using a "fake" client, drive a debug
session. It uses the `gdb` in your `PATH`.

## Running the tests

1. Build the test programs: run `make` in the `test-programs` directory
2. Build the package as usual: run `yarn` in the top-level directory
3. Run the tests: run `yarn test:integration` in the top-level directory

## Test coverage

There are many scripts to run test, see the `test:*` scripts in package.json.
To run test coverage, run the test script with nyc, e.g.:

```sh
# run all the tests with nyc
yarn run nyc yarn test
# or run the main subset
yarn run nyc yarn test:integration
# or run any specific subset
yarn run nyc yarn test:integration-gdb-async-off-remote-target
```

When the test run is complete, see the report in the `coverage` directory.

## Running the tests using Docker

The tests can be run on a docker container. This is useful to run the testsuite
in the same environment as it is run on the CI machine.

To do this, simply prefix the desired command (such as `yarn`) with this
command to run it in docker.

`docker run --rm -it -v $(git rev-parse --show-toplevel):/work -w /work/$(git rev-parse --show-prefix) --cap-add=SYS_PTRACE --security-opt seccomp=unconfined quay.io/eclipse-cdt/cdt-infra-plus-node:latest`

For example, to build and test:

```
docker run --rm -it -v $(git rev-parse --show-toplevel):/work -w /work/$(git rev-parse --show-prefix) --cap-add=SYS_PTRACE --security-opt seccomp=unconfined quay.io/eclipse-cdt/cdt-infra-plus-node:latest yarn
docker run --rm -it -v $(git rev-parse --show-toplevel):/work -w /work/$(git rev-parse --show-prefix) --cap-add=SYS_PTRACE --security-opt seccomp=unconfined quay.io/eclipse-cdt/cdt-infra-plus-node:latest yarn test
```

## "Error: No source file name /work/..."

This error can occur if the compiled test programs have had their path changed, such as when running in a container vs running on the host.

If you have already built the plug-in on your host system, you may need to clean before running yarn again in the container to ensure that the all compiled paths are correct. A full clean can be done with git, for example `git clean -dnx` (change the `n` to `f` to actually do the clean).

## Debugging tips

To debug, use the included launch configurations in the launch.json file for this vscode project.

'Mocha All' will run all compiled spec.js files in the {workspace}/dist/integration-tests/ directory.
'Mocha Current File' will run the currently open spec.js file in the editor window. You can find the corresponding spec.js file for a given spec.ts file in the directory listed above.

Breakpoints can be set in the corresponding spec.ts file and will work as expected, though stepping
may take you into compiled or framework .js files.
It may be possible with some additional configuration to run the spec.ts files directly.

When debugging a test case, you will likely want to run just this one. You can
do so by changing the test declaration:

    it('should do something', ...)

to

    it.only('should do something', ...)

## Setting up test environmnt on Windows host

When using Windows to test the adapter the flow is somewhat complicated by the myriad of choices of
gcc/gdb/make distributions. Some like Mingw are rarely updated, including old versions of GDB and GCC,
others like Cygwin have their own environment they work in to provide a Posix like environment. Below
is a recommended development flow that can be followed based on the popular msys2 distribution.

1. Get Msys2 from http://www.msys2.org/) and follow short install instructions on that page. The brief instructions are:

-   Run `pacman -Syu` twice
-   Install the development packages `pacman -S --needed base-devel mingw-w64-x86_64-toolchain`

2. Start _MSYS2 MinGW 64-bit_ (from start menu) -- this is the shell to build from

```sh
gcc --version # show details about compiler being used
gdb --version # show details about gdb being used
```

3. The _MSYS2 MinGW 64-bit_ terminal does [not include your normal tools](https://www.msys2.org/wiki/MSYS2-introduction/#path)
   on the `PATH`. To start the shell with the normal tools, add `-use-full-path` to the command line.
   e.g. press Start+R and use command `C:\msys64\msys2_shell.cmd -mingw64 -use-full-path`

### Integrate Shell into VS Code

The _MSYS2 MinGW 64-bit_ shell can be integrated into VSCode.

1. In VS Code: Ctrl+Shift+P then select `Preferences: Open Settings (JSON)`
2. In the `"terminal.integrated.profiles.windows"` section add:

```json
    "terminal.integrated.profiles.windows": {
        "MSYS2 MinGW 64-bit": {
            "path": "C:\\msys64\\usr\\bin\\bash.exe",
            "args": ["--login", "-i"],
            "env": {
                "MSYSTEM": "MINGW64",
                "CHERE_INVOKING": "1",
                "MSYS2_PATH_TYPE": "inherit"
            }
        }
    }
```

3. (Optional) Make the above the defualt with this setting:

```json
"terminal.integrated.defaultProfile.windows": "MSYS2 MinGW 64-bit",
```
