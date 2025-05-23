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

To do this, first build the Dockerfile provided in the repo and then run the tests inside of it using the following commands.

### Build Dockerfile to generate docker image

`docker build -t <prefered_docker_image_name> .devcontainer`

### Run docker container, build cdt-gdb-adapter project, and run the tests

```
# unix based host system
docker run -it -v $(pwd):/shared <prefered_docker_image_name>
# Windows host system
docker run -it -v "%CD%":/shared -w /shared <prefered_docker_image_name>
# Inside the container
yarn
make clean -C src/integration-tests/test-programs
make -C src/integration-tests/test-programs
yarn test &> log.log
cp log.log /shared/
```

The user should find the file log.log with the tests logs in their top level directory.

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

- Run `pacman -Syu` twice
- Install the development packages `pacman -S --needed base-devel mingw-w64-x86_64-toolchain`

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

### Test Logs and Test Reports

Running a test or series of tests can generate a lot of output.
By default, the adapter runs with [verbose on](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/blob/590fea58cfb2ee4984d766cd1b2140738d3ff110/src/integration-tests/utils.ts#L206-L207) and those logs are saved to the `test-logs` directory in the root of the adapter.
Within `test-logs` each test has its own directory (derived from the `describe`d name), and under that is a directory for the set of parameters used to run the tests (see below), and finally under that is a directory for each test (derived from the `it` name).

For example running the [`can launch and hit a breakpoint` test](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/blob/590fea58cfb2ee4984d766cd1b2140738d3ff110/src/integration-tests/launch.spec.ts#L42-L52) with the default settings places the log in `test-logs/launch/defaults/can launch and hit a breakpoint.log`

#### Test Parameters

All the tests are run repeatedly, but with different high level parameters, such as running all tests in remote and local debugging.
These parameters are [automatically prefixed](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/blob/590fea58cfb2ee4984d766cd1b2140738d3ff110/src/integration-tests/utils.ts#L252-L275) onto the name of the test.

#### Test Reports

Running tests also saves the summaries in JUnit style, suitable for integrating with other tools like Jenkins, in the `test-reports` directory.

#### GitHub Actions

The test reports and test logs from all tests [are saved](https://github.com/eclipse-cdt-cloud/cdt-gdb-adapter/blob/93a7ce9721b2510af2350c94f4bfc773dd966a8a/.github/workflows/build-pr.yml#L31-L43) in the GitHub actions as artifacts.
This is useful to help diagnose why a test fails on GitHub actions, but passes on local development.
