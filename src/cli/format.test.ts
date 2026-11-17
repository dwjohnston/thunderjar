import { describe, expect, test } from "bun:test";
import { dollars } from "./format.ts";

describe("dollars", () => {
  test("shows dollars to three places", () => {
    expect(dollars(0.061)).toBe("$0.061");
    expect(dollars(0)).toBe("$0.000");
    expect(dollars(0.001)).toBe("$0.001");
  });

  test("shows anything above nothing but below a tenth of a cent as <$0.001", () => {
    expect(dollars(0.0001)).toBe("<$0.001");
    expect(dollars(0.0007)).toBe("<$0.001");
    expect(dollars(0.00099)).toBe("<$0.001");
  });
});
