static void leaf_frame(void)
{
    int items[2] = {31, 37};
    int marker = 0;
    marker++; // BREAK HERE
}

static void caller_frame(void)
{
    int items[2] = {11, 13};
    leaf_frame();
    items[0]++;
}

int main(void)
{
    caller_frame();
    return 0;
}
