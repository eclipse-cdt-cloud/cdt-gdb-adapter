#include <stdio.h>
#include "Sleep.h"
int main()
{
    fprintf(stderr, "STDERR Here I am\n");
    fflush(stderr);

    // Sleep for a while so that there is no other
    // noise, such as process termination, while
    // looking for above output
    SLEEP(2);
    return 0;
}
