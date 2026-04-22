#include <iostream>

int main() {
  const int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}}; // [!code highlight]
  // [!annotate:2 label="inputs" note="int 型の 2x3 行列 A と 3 次元ベクトル x を静的配列で表現する"]
  const int vector[3] = {7, 8, 9};                 // [!code info]

  for (int row = 0; row < 2; ++row) {                            // [!code focus:4]
    const int sum = matrix[row][0] * vector[0]                   // [!code warning]
      // [!annotate:3 label="dot product" note="matrix[row] と vector の内積を 3 項の和として計算する"]
      + matrix[row][1] * vector[1]
      + matrix[row][2] * vector[2];                              // [!code error]
    std::cout << sum << '\n';
  }
}
