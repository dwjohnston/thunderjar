import { expect, test } from "bun:test";
import { postrunImage, prerunImage } from "./images.ts";

test("a prerun image is tagged with the permutation's abbreviated hash", () => {
  expect(prerunImage("e943919c".padEnd(64, "0"))).toBe("thunderjar-prerun:e943919c");
});

test("a postrun image is tagged with the execution, permutation and iteration", () => {
  expect(postrunImage("01aryz6s410000000000000000", 3, 2)).toBe("thunderjar-postrun:01aryz6s410000000000000000-3-2");
});
