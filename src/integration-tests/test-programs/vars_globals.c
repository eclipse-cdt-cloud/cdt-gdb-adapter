/*** Data Types for testing ***/
typedef struct structWithArray {
    int a;
    int b;
    char char_array[sizeof("char_array")];
} STRUCT_WITH_ARRAY;

typedef struct childStruct {
    int x;
    int y;
} CHILD_STRUCT;

typedef struct parentStruct {
    int m;
    float n;
    CHILD_STRUCT child;
    CHILD_STRUCT children[2];
} PARENT_STRUCT;

/*** Global variables for testing, volatile to avoid optimizing them out ***/

volatile STRUCT_WITH_ARRAY s0 = {
    1,
    2,
    "char_array"
};

volatile STRUCT_WITH_ARRAY *p_s0 = &s0;

volatile PARENT_STRUCT s1 = {
    10,
    3.14f,
    { 4, 5 },
    { { 6, 7 }, { 8, 9 } }
};

volatile PARENT_STRUCT *p_s1 = &s1;

volatile int global_int = 42;

static int file_static_int = 17;

static STRUCT_WITH_ARRAY file_static_s0 = {
    3,
    4,
    "static_char"
};

static STRUCT_WITH_ARRAY *p_file_static_s0 = &file_static_s0;

static PARENT_STRUCT file_static_s1 = {
    20,
    5.14f,
    { 11, 12 },
    { { 13, 14 }, { 15, 16 } }
};

static PARENT_STRUCT *p_file_static_s1 = &file_static_s1;

int main()
{
    // Struct with array
    volatile STRUCT_WITH_ARRAY *p_s0_local = &s0;
    unsigned long long s0_address = (unsigned long long)&s0;
    s0.a *= 10;  // INITIAL_STOP
    s0.b *= 2;
    p_s0_local->a += 12;
    p_s0_local->b--;
    // Parent-child struct
    volatile PARENT_STRUCT *p_s1_local = &s1;
    unsigned long long s1_address = (unsigned long long)&s1;
    s1.m += 5;
    s1.n *= 2.0f;
    s1.child.x += 10;
    s1.child.y += 20;
    s1.children[0].x += 30;
    s1.children[0].y += 40;
    s1.children[1].x += 50;
    s1.children[1].y += 60;
    // Static
    static int function_static_int = 1;
    function_static_int += 10;
    file_static_int += 5;
    file_static_s0.a += 10;
    file_static_s0.b += 15;
    file_static_s1.m += 20;
    file_static_s1.n *= 3.0f;
    file_static_s1.child.x += 25;
    file_static_s1.child.y += 30;
    file_static_s1.children[0].x += 35;
    file_static_s1.children[0].y += 40;
    file_static_s1.children[1].x += 45;
    file_static_s1.children[1].y += 50;
    return 0;    // RETURN
}
