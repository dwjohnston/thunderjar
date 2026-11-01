/** `n` and `noun`, plural unless `n` is 1, e.g. `2 permutations`. */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** `iso` in UTC, to the minute, e.g. `2026-10-01 10:12`. */
export const minute = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");
