import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { findScenario, listScenarios, type ScenarioInfo } from "./scenario.ts";

const info = (group: string, name: string): ScenarioInfo => ({
  id: name.slice(0, 4),
  group,
  name,
  folder: `/f/${group}/${name}`,
  project: `/f/${group}/${name}/project`,
});

const scenarios = [info("01_unitialised", "0101_empty_project"), info("02_regular", "0201_minimal_existing_setup")];

describe("findScenario", () => {
  test("finds a scenario by its ID", () => {
    expect(findScenario("0201", scenarios).project).toBe("/f/02_regular/0201_minimal_existing_setup/project");
  });

  test("fails loudly for an unknown ID, listing the scenarios", () => {
    expect(() => findScenario("0999", scenarios)).toThrow(/Unknown scenario "0999"[\s\S]*0201_minimal_existing_setup/);
    expect(() => findScenario("0201", [])).toThrow(/Unknown scenario "0201"[\s\S]*\(none\)/);
  });

  test("fails for an ID that isn't 4 digits", () => {
    expect(() => findScenario("2", scenarios)).toThrow(/Invalid scenario ID "2"/);
    expect(() => findScenario("0201_minimal_existing_setup", scenarios)).toThrow(/Invalid scenario ID/);
  });

  test("fails for an ambiguous ID", () => {
    const twice = [...scenarios, info("02_regular", "0201_other")];
    expect(() => findScenario("0201", twice)).toThrow(/Ambiguous scenario "0201"/);
  });
});

describe("listScenarios", () => {
  test("finds the folders with a project/ in each group, sorted by ID, and nothing else", async () => {
    const dir = `${import.meta.dir}/.listScenarios-test-${crypto.randomUUID()}`;
    try {
      await $`mkdir -p ${dir}/02_regular/0201_b/project ${dir}/01_unitialised/0101_a/project ${dir}/node_modules/x ${dir}/.tmp/0101-copy ${dir}/02_regular/notes ${dir}/02_regular/0202_no_project`;
      await Bun.write(`${dir}/01_unitialised/0102_file`, "not a folder");
      expect(listScenarios(dir).map((s) => `${s.id} ${s.group}/${s.name}`)).toEqual([
        "0101 01_unitialised/0101_a",
        "0201 02_regular/0201_b",
      ]);
    } finally {
      await $`rm -rf ${dir}`.quiet();
    }
  });

  test("finds none in a missing folder", () => {
    expect(listScenarios(`${import.meta.dir}/does-not-exist`)).toEqual([]);
  });
});
