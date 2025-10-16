
typedef struct myStruct
{
    int a;
    int b;
    char char_array[sizeof("char_array")];
} MY_STRUCT;

volatile MY_STRUCT s0 = {
    1,
    2,
    "char_array"
};

int main()
{
    s0.a *= 10;  // INITIAL_STOP
    s0.b *= 2;
    return 0;    // RETURN
}
