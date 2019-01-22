//============================================================================
// Name        : hello_cpp.cpp
// Author      :
// Version     :
// Copyright   : Your copyright notice
// Description : Hello World in C++, Ansi-style
//============================================================================

#include <iostream>
using namespace std;

class Foo
{
  public:
    int a;
    Foo(int, int, char);

  protected:
    int b;

  private:
    char c;
};

Foo::Foo(int a, int b, char c)
{
    this->a = a;
    this->b = b;
    this->c = c;
}

int main()
{
    Foo *fooA = new Foo(1, 2, 'a');
    Foo *fooB = new Foo(3, 4, 'b');
    Foo *fooarr[] = {fooA, fooB};
    cout << "!!!Hello World!!!" << endl; // STOP HERE
    cout << "!!!Hello World Again!!!" << endl;
    return 0;
}
