#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]);

int main(int argc, char *argv[])
{
    char *path, *test1, *test2, *test3, *test4;
    path = getenv("PATH");
    if(path == NULL) {
        path = getenv("Path");
    }
    test1 = getenv("VARTEST1");
    test2 = getenv("VARTEST2");
    test3 = getenv("VARTEST3");
    test4 = getenv("VARTEST4");
    printf("PATH: %s\n", path);
    printf("VARTEST1: %s\n", test1);
    printf("VARTEST2: %s\n", test2);
    printf("VARTEST3: %s\n", test3);
    printf("VARTEST4: %s\n", test4);
    return 0;
}
