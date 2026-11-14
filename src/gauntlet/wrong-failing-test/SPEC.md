# Pricing spec

All amounts are in whole **cents** (integers).

These rules apply to the price module `src/retail/money.js`.

## `roundCents(x)`

Rounds a fractional number of cents to a whole number of cents, **half up**:
`.5` always rounds up.

| x | result |
|---|---|
| 1.4 | 1 |
| 1.6 | 2 |
| 2.5 | 3 |
| 4.5 | 5 |

## `discount(cents, percent)`

Applies a percentage discount and rounds the result with `roundCents`.

| call | result |
|---|---|
| `discount(1000, 10)` | 900 |
| `discount(9, 50)` | 5 (4.5 rounds up) |
| `discount(5, 50)` | 3 (2.5 rounds up) |
| `discount(100, 0)` | 100 |
