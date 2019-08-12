BINS = empty empty\ space evaluate vars vars_cpp mem segv count

.PHONY: all
all: $(BINS)

CC = gcc
CXX = g++
LINK = $(CC) -o $@ $^
LINK_CXX = $(CXX) -o $@ $^

count: count.o
	$(LINK)

empty: empty.o
	$(LINK)

evaluate: evaluate.o
	$(LINK)

mem: mem.o
	$(LINK)

vars: vars.o
	$(LINK)

vars_cpp: vars_cpp.o
	$(LINK_CXX)

segv: segv.o
	$(LINK)

%.o: %.c
	$(CC) -c $< -g3 -O0

%.o: %.cpp
	$(CXX) -c $< -g3 -O0

empty\ space: empty\ space.o
	$(CC) -o "empty space" "empty space.o"

empty\ space.o: empty\ space.c
	$(CC) -c "empty space.c" -g3 -O0

.PHONY: clean
clean:
	rm -f $(BINS) *.o
