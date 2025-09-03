
struct bar
{
    int a;
    int b;
};

struct baz
{
    float w;
    double v;
};

struct foo
{
    int x;
    int y;
    struct bar z;
    struct baz aa;
};
int global_a = 10;

int main()
{
    int a = 1;
    int b = 2;
    int c = a + b; // STOP HERE
    struct foo r = {1, 2, {3, 4}, {3.1415, 1234.5678}};
    int d = r.x + r.y;
    int e = r.z.a + r.z.b;
    int f[] = {1, 2, 3};
    int g = f[0] + f[1] + f[2]; // After array init
    int rax = 1;
    const unsigned char h[] = {0x01, 0x10, 0x20};
    const unsigned char k[] = "hello"; // char string setup
    return 0;
}
