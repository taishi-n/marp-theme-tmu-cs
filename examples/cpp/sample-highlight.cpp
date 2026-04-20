#include <iomanip>
#include <iostream>

int main() {
  for (int row = 1; row <= 9; ++row) {       // [!code focus:6]
    // [!annotate:6 label="outer loop" note="外側の for ループが 1 段ずつ九九の行を進める"]
    for (int col = 1; col <= 9; ++col) {     // [!code highlight]
      // [!annotate:2 label="inner loop" note="内側の for ループで各列の積を計算し、整形して出力する"]
      std::cout << std::setw(3) << row * col; // [!code info]
    }
    std::cout << '\n';
  }
}
