BINS = empty empty\ space evaluate vars vars_cpp vars_env mem segv count disassemble functions loopforever MultiThread MultiThreadRunControl stderr bug275-测试 cwd.exe stepping

.PHONY: all
all: $(BINS)

CC = gcc
CXX = g++
LINK = $(CC) -o $@ $^
LINK_CXX = $(CXX) -o $@ $^

# Don't try to use pthread on Windows
# The OS environment variable exists on Windows
ifneq ($(OS),Windows_NT)
	CC += -pthread
	CXX += -pthread
	LINK += -pthread
	LINK_CXX += -pthread
endif

functions: functions.o functions_other.o
	$(LINK)

count: count.o count_other.o count\ space.o
	$(CC) -o "count" count.o count_other.o "count space.o"

count\ space.o: count\ space.c
	$(CC) -c "count space.c" -g3 -O0

# the cwd tests need to move around source and binary
# in ways that mean gdb cannot find the source automatically
# in the normal $cdir:$cwd and needs additional information
# to be provided
# debug-prefix-map used like this is to put an "incorrect"
# DW_AT_comp_dir in the debug info
cwd.o: cwd.c
	$(CC) -fdebug-prefix-map=$(CURDIR)=.  -c $< -g3 -O0

cwd.exe: cwd.o
	$(LINK) -fdebug-prefix-map=$(CURDIR)=.
	mkdir -p Debug
	cp cwd.exe Debug
	mkdir -p EmptyDir

empty: empty.o
	$(LINK)

# This is a workaround because make on Windows (on GitHub actions?) doesn't like
# it otherwise
bug275-测试.o: empty.c
	cp empty.c bug275-测试.c
	$(CC) -c bug275-测试.c -g3 -O0

bug275-测试: bug275-测试.o
	$(LINK)

evaluate: evaluate.o
	$(LINK)

mem: mem.o
	$(LINK)

disassemble: disassemble.o
	$(LINK)

vars: vars.o
	$(LINK)

vars_env: vars_env.o
	$(LINK)

vars_cpp: vars_cpp.o
	$(LINK_CXX)

segv: segv.o
	$(LINK)

loopforever: loopforever.o
	$(LINK)

MultiThread: MultiThread.o
	$(LINK_CXX)

MultiThreadRunControl: MultiThreadRunControl.o
	$(LINK_CXX)

stderr: stderr.o
	$(LINK)

stepping: stepping.o
	$(LINK)

%.o: %.c
	$(CC) -c $< -g3 -O0

%.o: %.cpp
	$(CXX) -c $< -g3 -O0

%.o: %.cc
	$(CXX) -c $< -g3 -O0

empty\ space: empty\ space.o
	$(CC) -o "empty space" "empty space.o"

empty\ space.o: empty\ space.c
	$(CC) -c "empty space.c" -g3 -O0

.PHONY: clean
clean:
	rm -f $(BINS) *.o
