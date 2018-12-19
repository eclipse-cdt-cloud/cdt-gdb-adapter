
struct bar {
    int a;
    int b;
};

struct foo {
    int x;
    int y;
    struct bar z;
};

int main()
{
    int a = 1;
    int b = 2;
    int c = a + b;
    return 0;
}
