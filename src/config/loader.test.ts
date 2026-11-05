import { describe, expect, test } from "bun:test";
import { copyScenarioProject } from "../testing/cli.ts";
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
    // Outside the repo, whose own .thunderjar/ would otherwise be found above it.
    await using copy = await copyScenarioProject("0101", { outsideRepo: true });
    const promise = findThunderjarRoot(copy.dir);
    await expect(promise).rejects.toBeInstanceOf(ConfigError);
    await expect(promise).rejects.toThrow(`No .thunderjar/ folder in ${copy.dir} or any folder above it.`);
  });
});
