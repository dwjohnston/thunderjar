import { expect, test } from "bun:test";
import { postrunTag, prerunTag } from "./tags.ts";

const hash = "4f9a21c8" + "0".repeat(56);

// spec/081-docker-tagging.md#tag-formats
test("a prerun tag carries the abbreviated permutation hash", () => {
  expect(prerunTag(hash)).toBe("prerun-h4f9a21c8");
});

test("a postrun tag carries the full execution ID, the abbreviated hash and a zero-padded iteration index", () => {
  expect(postrunTag("01k4x9j2e8mqz3", hash, 0)).toBe("postrun-e01k4x9j2e8mqz3-h4f9a21c8-i00");
  expect(postrunTag("01k4x9j2e8mqz3", hash, 1)).toBe("postrun-e01k4x9j2e8mqz3-h4f9a21c8-i01");
  expect(postrunTag("01k4x9j2e8mqz3", hash, 123)).toBe("postrun-e01k4x9j2e8mqz3-h4f9a21c8-i123");
});
