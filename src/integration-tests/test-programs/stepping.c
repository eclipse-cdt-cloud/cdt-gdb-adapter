#include <stdio.h>

extern int getFromElsewhere(int start);

int main (int argc, char *argv[]) 
{   char knownLocally = 10;
    int i;
    for (i = 0; i < 3; i++) { // main for
        knownLocally += 1;
        int gottenFromElsewhere = getFromElsewhere(knownLocally); // main getFromElsewhere call
        printf("Saw it here first: %d", knownLocally); // main printf call
    }
    return 0;
}

// make the line of code the same as opening brace to account for different gdb/gcc combinations
int getFromElsewhere(int start)
{   int result = start; int i; // getFromElsewhere entry
    for (i = 1; i <= 5; i++) {  // getFromElsewhere for
        result += i;
        printf("Eventually, I'll return something like... %d", result);
    }
    return result;
}
