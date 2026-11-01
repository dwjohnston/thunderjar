import { expect, test } from "bun:test";
import { containerName, imagePrefixProblem, postrunImage, prerunImage } from "./images.ts";

test("a prerun image is tagged with the permutation's abbreviated hash", () => {
  expect(prerunImage("e943919c".padEnd(64, "0"))).toBe("thunderjar-prerun:e943919c");
});

test("a postrun image is tagged with the execution, permutation and iteration", () => {
  expect(postrunImage("01aryz6s410000000000000000", 3, 2)).toBe("thunderjar-postrun:01aryz6s410000000000000000-3-2");
});

test("a container is named, under the prefix, by the execution, permutation and iteration", () => {
  expect(containerName("01aryz6s410000000000000000", 3, 2)).toBe("thunderjar-run-01aryz6s410000000000000000-3-2");
  expect(containerName("01aryz6s410000000000000000", 3, 2, "throwaway")).toBe("throwaway-run-01aryz6s410000000000000000-3-2");
});

test("--image-prefix replaces thunderjar in every image name", () => {
  expect(prerunImage("e943919c".padEnd(64, "0"), "throwaway")).toBe("throwaway-prerun:e943919c");
  expect(postrunImage("01aryz6s410000000000000000", 3, 2, "throwaway")).toBe(
    "throwaway-postrun:01aryz6s410000000000000000-3-2",
  );
});

test.each(["thunderjar", "tj-test", "a.b_c__d--e", "x1"])("%s is a legal image prefix", (prefix) => {
  expect(imagePrefixProblem(prefix)).toBeUndefined();
});

test.each(["", "Thunderjar", "-tj", "tj-", "tj..x", "tj/x", "tj:x", "tj x"])("%p is not a legal image prefix", (prefix) => {
  expect(imagePrefixProblem(prefix)).toBeString();
});
