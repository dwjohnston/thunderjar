import { expect, test } from "bun:test";
import { add } from "./smoke.ts";

test("tooling runs tests", () => {
  expect(add(1, 2)).toBe(3);
});
