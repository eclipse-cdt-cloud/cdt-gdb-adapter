
struct bar
{
    int a;
    int b;
};

struct foo
{
    int x;
    int y;
    struct bar z;
};

int main()
{
    int a = 1;
    int b = 2;
    int c = a + b; // STOP HERE
    struct foo r = {1, 2, {3, 4}};
    int d = r.x + r.y;
    int e = r.z.a + r.z.b;
    int f[] = {1, 2, 3};
    int g = f[0] + f[1] + f[2];
    return 0;
}
