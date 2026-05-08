// watch_local_scope_transition.c
// This program is intentionally minimal and designed to trigger
// GDB MI var-object invalidation when stepping, even though the
// variable remains lexically in scope.

#include <stdio.h>

int main(void)
{
    {
        int x = 1;
        printf("%d\n", x);   // FIRST_SCOPE
    }

    {
        int x = 2;
        printf("%d\n", x);   // SECOND_SCOPE
    }

    return 0;
}
