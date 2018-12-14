//============================================================================
// Name        : hello_cpp.cpp
// Author      : 
// Version     :
// Copyright   : Your copyright notice
// Description : Hello World in C++, Ansi-style
//============================================================================

#include <iostream>
using namespace std;

class Foo {
	public:
		int a;
		Foo(int, int, char);
	protected:
		int b;
	private:
		char c;
		
};

Foo::Foo(int a, int b, char c) {
	this->a = a;
	this->b = b;
	this->c = c;
}

int main() {
	Foo *fooA = new Foo(1, 2, 'a');
	Foo *fooB = new Foo(3, 4, 'b');
	Foo *fooarr[] = {fooA, fooB};
	// operator= on dereferenced objects is bad practice
	Foo foo0 = *fooarr[0];
	Foo foo1 = *fooarr[1];
	if (foo0.a || foo1.a)
		cout << "!!!Hello World!!!" << endl;
	return 0;
}
