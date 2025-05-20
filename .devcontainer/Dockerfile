# Use a base image
FROM node:20

# Install GCC
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    g++ \
    gdb \
    gdbserver \
    socat

#RUN gdb --version
#RUN gcc --version
#RUN gdbserver --version
#RUN sysctl kernel.yama.ptrace_scope=0

CMD ["/bin/bash"]

## Build the project
RUN yarn

## Build test programs
#RUN make -C src/integration-tests/test-programs

## Run tests
#RUN yarn test:integration
