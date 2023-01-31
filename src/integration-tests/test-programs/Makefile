BINS = empty empty\ space evaluate vars vars_cpp mem segv count disassemble functions loopforever MultiThread MultiThreadRunControl stderr

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

empty: empty.o
	$(LINK)

evaluate: evaluate.o
	$(LINK)

mem: mem.o
	$(LINK)

disassemble: disassemble.o
	$(LINK)

vars: vars.o
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
