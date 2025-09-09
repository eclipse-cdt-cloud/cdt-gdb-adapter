volatile int incrementAnother = 0xDEADBEEF; 
int main() {
    int count = 0, another = 0;
    while (1) {
        count ++; 
        // line with no code
        if(incrementAnother == 0xDEADBEEF) {
            another ++;
        }
    }    
    return 0;
}
