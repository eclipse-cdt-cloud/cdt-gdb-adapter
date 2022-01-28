extern int other(void);
static int staticfunc1(void) 
{   return 2; // make the line of code the same as opening brace to account for different gdb/gcc combinations
}
static int staticfunc2(void) 
{   return 2; // make the line of code the same as opening brace to account for different gdb/gcc combinations
}

int sub(void) 
{   return 0; // make the line of code the same as opening brace to account for different gdb/gcc combinations
}

int main(void) 
{   staticfunc1(); // make the line of code the same as opening brace to account for different gdb/gcc combinations
    staticfunc2();
    sub();
    other();
    return 0;
}
