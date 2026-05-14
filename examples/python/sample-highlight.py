matrix = [
    [1, 2, 3],  # first row [!step 1 highlight]
    [4, 5, 6],
]  # matrix operand
vector = [7, 8, 9]  # vector operand [!step 2 info]

for row in matrix:  # loop over rows [!step 3 focus:4]
    total = row[0] * vector[0]  # first term [!step 4 warning]
    total += row[1] * vector[1]
    total += row[2] * vector[2]  # final term [!step 5 error]
    print(total)  # output result [!step 6 info]
