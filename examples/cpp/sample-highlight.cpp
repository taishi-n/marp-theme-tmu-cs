#include <iostream>

int main() {
  const int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}}; // [!code highlight]
  const int vector[3] = {7, 8, 9};                 // [!code info]
  // [!annotate:2 label="inputs" note="int 型の 2x3 行列 A と 3 次元ベクトル x を静的配列で表現する"]

  for (int row = 0; row < 2; ++row) {                            // [!code focus:4]
    const int sum = matrix[row][0] * vector[0]                   // [!code warning]
      + matrix[row][1] * vector[1]
      + matrix[row][2] * vector[2];                              // [!code error]
    // [!annotate:3 label="dot product" note="matrix[row] の各要素と vector の対応成分を掛けて足し合わせる"]
    std::cout << sum << '\n';
  }
}
