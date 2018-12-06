BINS = empty vars mem

.PHONY: all
all: $(BINS)

CC = gcc
LINK = $(CC) -o $@ $^

empty: empty.o
	$(LINK)

mem: mem.o
	$(LINK)

vars: vars.o
	$(LINK)

%.o: %.c
	$(CC) -c $< -g3 -O0

.PHONY: clean
clean:
	rm -f $(BINS) *.o
