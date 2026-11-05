#!/bin/sh
# Writes a correct isPrime.ts, and a result file at $1 whose reply says where it ran from.
printf '%s\n' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts
echo '{"reply":"Ran from /opt/fake-scripted."}' > "$1"
