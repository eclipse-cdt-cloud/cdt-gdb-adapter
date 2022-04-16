static int staticfunc1(void) {
    return 2;
}
static int staticfunc2(void) {
    return 2;
}

int other_space(void)
{    staticfunc1(); // make the line of code the same as opening brace to account for different gdb/gcc combinations
    staticfunc2();
    return 0;
}
