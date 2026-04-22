matrix = [
    [1, 2, 3],  # [!code highlight]
    [4, 5, 6],
]  # [!annotate label="inputs" note="2x3 行列 A を入れ子のリストで表現する"]
vector = [7, 8, 9]  # [!code info]
# [!annotate label="vector" note="3 次元ベクトル x を一次元リストで表現する"]

for row in matrix:  # [!code focus:4]
    total = row[0] * vector[0]  # [!code warning]
    # [!annotate:3 label="dot product" note="各行 row と vector の内積を 3 項の和として計算する"]
    total += row[1] * vector[1]
    total += row[2] * vector[2]  # [!code error]
    print(total)
