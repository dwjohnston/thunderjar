import { expect, test } from "bun:test";
import { ulid } from "./ulid.ts";

test("encodes the time in the first 10 characters and the randomness in the last 16", () => {
  // The example from the ULID specification, in lower case.
  expect(ulid(1469918176385, new Uint8Array(10)).slice(0, 10)).toBe("01aryz6s41");
  expect(ulid(0, new Uint8Array(10))).toBe("0".repeat(26));
  expect(ulid(0, new Uint8Array(10).fill(255))).toBe("0".repeat(10) + "z".repeat(16));
  expect(ulid(2 ** 48 - 1, new Uint8Array(10))).toBe("7zzzzzzzzz" + "0".repeat(16));
});

test("is 26 lower-case Crockford base32 characters, and differs between calls", () => {
  const a = ulid();
  const b = ulid();
  expect(a).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
  expect(a).not.toBe(b);
});

test("sorts by time", () => {
  const earlier = ulid(1_000, new Uint8Array(10).fill(255));
  const later = ulid(1_001, new Uint8Array(10));
  expect(earlier < later).toBe(true);
});

test("rejects times a ULID cannot hold", () => {
  expect(() => ulid(-1)).toThrow(RangeError);
  expect(() => ulid(2 ** 48)).toThrow(RangeError);
});
