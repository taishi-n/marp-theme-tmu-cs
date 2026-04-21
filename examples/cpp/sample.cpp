#include <iostream>

int main() {
  const int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}};
  const int vector[3] = {7, 8, 9};

  for (int row = 0; row < 2; ++row) {
    const int sum = matrix[row][0] * vector[0]
      + matrix[row][1] * vector[1]
      + matrix[row][2] * vector[2];
    std::cout << sum << '\n';
  }
}
