#include <iostream>

int main() {
  const int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}}; // input matrix [!step 1 highlight]
  const int vector[3] = {7, 8, 9};                 // input vector [!step 2 info]

  for (int row = 0; row < 2; ++row) {                            // loop over rows [!step 3 focus:4]
    const int sum = matrix[row][0] * vector[0]                   // first term [!step 4 warning]
      + matrix[row][1] * vector[1]
      + matrix[row][2] * vector[2];                              // final term [!step 5 error]
    std::cout << sum << '\n';                                    // output result [!step 6 info]
  }
}
