BINS = empty

.PHONY: all
all: $(BINS)

CC = gcc
LINK = $(CC) -o $@ $^

empty: empty.o
	$(LINK)

%.o: %.c
	$(CC) -c $< -g3 -Og

.PHONY: clean
clean:
	rm -f $(BINS) *.o