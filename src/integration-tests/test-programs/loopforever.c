#include <time.h>

volatile int var1 = 0;
volatile int var2 = 0;
volatile int stop = 0;


int inner1(void) {
    return var1++;
}
int inner2(void) {
    return var2++;
}

int main(int argc, char *argv[])
{
    time_t start_time = time(NULL);
    while (stop == 0) {
        if (time(NULL) > start_time + 10) {
            // Don't actually loop forever as that can hang tests
            // run for about 10 seconds, about twice as long as the test timeout's worst case
            // especially on Windows where pause does not work (yet)
            return 1;
        }
        inner1();
        inner2();
    }
    return 0;
}
