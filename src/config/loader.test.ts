import { describe, expect, test } from "bun:test";
import { scenario } from "../testing/scenario.ts";
import { ConfigError, findThunderjarRoot } from "./loader.ts";

describe("findThunderjarRoot", () => {
  test("finds .thunderjar/ in the folder it starts from", async () => {
    expect(await findThunderjarRoot(scenario("0201"))).toBe(`${scenario("0201")}/.thunderjar`);
  });

  test("finds .thunderjar/ in a folder above it", async () => {
    expect(await findThunderjarRoot(`${scenario("0201")}/.thunderjar/test-cases/`)).toBe(`${scenario("0201")}/.thunderjar`);
  });

  test("fails when no folder up to / has one", async () => {
    const promise = findThunderjarRoot(scenario("0101"));
    await expect(promise).rejects.toBeInstanceOf(ConfigError);
    await expect(promise).rejects.toThrow(`No .thunderjar/ folder in ${scenario("0101")} or any folder above it.`);
  });
});
