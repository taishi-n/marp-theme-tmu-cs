matrix = [
    [1, 2, 3],  # [!code highlight]
    [4, 5, 6],
]  # [!annotate label="inputs" note="Represent the 2x3 matrix A as a nested list."]
vector = [7, 8, 9]  # [!code info]
# [!annotate label="vector" note="Represent the 3D vector x as a one-dimensional list."]

for row in matrix:  # [!code focus:4]
    total = row[0] * vector[0]  # [!code warning]
    # [!annotate:3 label="dot product" note="Compute the dot product of each row and the vector as the sum of three terms."]
    total += row[1] * vector[1]
    total += row[2] * vector[2]  # [!code error]
    print(total)
