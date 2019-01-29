BINS = empty evaluate vars vars_cpp mem

.PHONY: all
all: $(BINS)

CC = gcc
CXX = g++
LINK = $(CC) -o $@ $^
LINK_CXX = $(CXX) -o $@ $^

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

%.o: %.c
	$(CC) -c $< -g3 -O0

%.o: %.cpp
	$(CXX) -c $< -g3 -O0

.PHONY: clean
clean:
	rm -f $(BINS) *.o
