# Use a base image
FROM node:20

# Create app directory
WORKDIR /work

# Install GCC
RUN apt-get update
RUN apt-get -y install build-essential gcc g++ gdb gdbserver socat
RUN gdb --version
RUN gcc --version
RUN gdbserver --version
#RUN sysctl kernel.yama.ptrace_scope=0

# Copy your app's source code
#COPY . .

## Build the project
#RUN yarn
#
## Build test programs
#RUN make -C src/integration-tests/test-programs
#
## Run tests
#RUN yarn test:integration
#
## Expose a port
#EXPOSE 3000

CMD ["/bin/bash"]