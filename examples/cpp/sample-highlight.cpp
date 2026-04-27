#include <iostream>

int main() {
  const int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}}; // [!code highlight]
  // [!annotate:2 label="inputs" note="Represent the 2x3 matrix A and the 3D vector x as static integer arrays."]
  const int vector[3] = {7, 8, 9};                 // [!code info]

  for (int row = 0; row < 2; ++row) {                            // [!code focus:4]
    const int sum = matrix[row][0] * vector[0]                   // [!code warning]
      // [!annotate:3 label="dot product" note="Compute the dot product of matrix[row] and vector as the sum of three terms."]
      + matrix[row][1] * vector[1]
      + matrix[row][2] * vector[2];                              // [!code error]
    std::cout << sum << '\n';
  }
}
