// spec/055-declaring-test-cases.md#typed-names: a declaration naming a parameter absent from the
// generated types, or whose config or aggregate doesn't fit its instrument, is a compile error,
// and one that fits compiles cleanly.
//
// In the checked-in fixtureTests/scenario_11_type_errors, in place: `thunderjar generate` writes
// its gitignored types, then real `tsc` checks the project with its own tsconfig, once. Each test
// asserts on what `tsc` reported for one declaration. By hand:
//
//   bun run fixture 11 generate
//   cd fixtureTests/scenario_11_type_errors/fixtures && bunx tsc -p .thunderjar

import { beforeAll, describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { scenario, thunderjar } from "../testing/cli.ts";

const tsc = resolve(import.meta.dir, "..", "..", "node_modules", ".bin", "tsc");
const fixtures = scenario("scenario_11_type_errors");

let exitCode: number;
/** Each diagnostic `tsc` printed, with its indented elaboration, keyed by its file. */
const reported = new Map<string, string[]>();

beforeAll(async () => {
  const generated = await thunderjar(fixtures, ["generate"]);
  expect(generated.exitCode).toBe(0);

  const proc = Bun.spawn([tsc, "--noEmit", "-p", join(fixtures, ".thunderjar")], {
    cwd: fixtures,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([proc.stdout.text(), proc.stderr.text()]);
  exitCode = await proc.exited;
  for (const diagnostic of (stdout + stderr).trimEnd().split(/\n(?=\S)/)) {
    const file = diagnostic.slice(0, diagnostic.indexOf("("));
    reported.set(file, [...(reported.get(file) ?? []), diagnostic.slice(file.length)]);
  }
}, 30000);

/** What `tsc` reported in `.thunderjar/<file>`, each diagnostic without its file name. */
const errorsIn = (file: string) => reported.get(`.thunderjar/${file}`);

test("only the declarations that don't fit fail to compile", () => {
  expect(exitCode).not.toBe(0);
  expect([...reported.keys()].sort()).toEqual(
    [
      "test-cases/prompt-of-another-task.ts",
      "test-cases/unknown-model.ts",
      "test-cases/unknown-prompt-set.ts",
      "test-case-parameters/codeStates/reads-missing-config/index.ts",
      "test-case-parameters/codeStates/top-level-commit/index.ts",
      ...[
        "fileCreatedByMean",
        "grepByRate",
        "grepWithoutPattern",
        "misfitConfig",
        "templateTestByMax",
        "templateTestWithoutTemplate",
        "unknownInstrument",
        "withoutAggregate",
      ].map((name) => `test-case-parameters/tasks/badly-measured/measurements/${name}.ts`),
    ]
      .map((file) => `.thunderjar/${file}`)
      .sort(),
  );
});

describe("a test case", () => {
  test("naming only generated names compiles cleanly", () => {
    expect(errorsIn("test-cases/sound.ts")).toBeUndefined();
  });

  test("naming an unknown prompt set fails to compile", () => {
    expect(errorsIn("test-cases/unknown-prompt-set.ts")).toEqual([
      `(6,15): error TS2322: Type '"snirk"' is not assignable to type '"snerk"'.`,
    ]);
  });

  test("naming a model absent from its family fails to compile", () => {
    expect(errorsIn("test-cases/unknown-model.ts")).toEqual([
      `(7,18): error TS2322: Type '"fake-harness-alpha@1.0.0/fake-model-huge"' is not assignable to type '"fake-harness-alpha@1.0.0/fake-model-small"'.`,
    ]);
  });

  test("naming an initial prompt that belongs to a different task fails to compile", () => {
    expect(errorsIn("test-cases/prompt-of-another-task.ts")).toEqual([
      `(9,19): error TS2322: Type '"fizzy"' is not assignable to type '"plain"'.`,
    ]);
  });
});

describe("a measurement", () => {
  const measurement = (task: string, name: string) => errorsIn(`test-case-parameters/tasks/${task}/measurements/${name}.ts`);
  const bad = (name: string) => measurement("badly-measured", name);

  test("whose config and aggregate fit fileCreated, grep or templateTest compiles cleanly", () => {
    expect(measurement("is-prime", "isPrimeTsExists")).toBeUndefined();
    expect(measurement("is-prime", "tsIgnoreCount")).toBeUndefined();
    expect(measurement("is-prime", "isPrimeTemplateTest")).toBeUndefined();
  });

  test("whose config doesn't fit its instrument fails to compile", () => {
    expect(bad("misfitConfig")).toEqual([
      `(3,74): error TS2353: Object literal may only specify known properties, and 'path' does not exist in type '{ glob: string; } | { glob: string; pattern: string; } | { subject: string; template: string; }'.`,
    ]);
  });

  test("naming an unknown instrument fails to compile", () => {
    expect(bad("unknownInstrument")).toEqual([
      `(3,37): error TS2820: Type '"fileCraeted"' is not assignable to type '"fileCreated" | "grep" | "templateTest"'. Did you mean '"fileCreated"'?`,
    ]);
  });

  test("without an aggregate fails to compile", () => {
    expect(bad("withoutAggregate")).toEqual([
      `(3,35): error TS2345: Argument of type '{ instrument: "fileCreated"; config: { glob: string; }; }' is not assignable to parameter of type 'MeasurementDeclaration'.
  Property 'aggregate' is missing in type '{ instrument: "fileCreated"; config: { glob: string; }; }' but required in type '{ instrument: "fileCreated"; config: { glob: string; }; aggregate: ("count" | "rate")[]; }'.`,
    ]);
  });

  test("with an aggregate that doesn't fit its instrument's value type fails to compile", () => {
    expect(bad("fileCreatedByMean")).toEqual([
      `(3,35): error TS2345: Argument of type '{ instrument: "fileCreated"; config: { glob: string; }; aggregate: "mean"[]; }' is not assignable to parameter of type 'MeasurementDeclaration'.
  Types of property 'aggregate' are incompatible.
    Type '"mean"[]' is not assignable to type '("count" | "rate")[]'.
      Type '"mean"' is not assignable to type '"count" | "rate"'.`,
    ]);
    expect(bad("grepByRate")).toEqual([
      `(3,35): error TS2345: Argument of type '{ instrument: "grep"; config: { glob: string; pattern: string; }; aggregate: "rate"[]; }' is not assignable to parameter of type 'MeasurementDeclaration'.
  Types of property 'aggregate' are incompatible.
    Type '"rate"[]' is not assignable to type '("max" | "mean" | "median" | "min" | "sum")[]'.
      Type '"rate"' is not assignable to type '"max" | "mean" | "median" | "min" | "sum"'.`,
    ]);
    expect(bad("templateTestByMax")).toEqual([
      `(3,35): error TS2345: Argument of type '{ instrument: "templateTest"; config: { subject: string; template: string; }; aggregate: "max"[]; }' is not assignable to parameter of type 'MeasurementDeclaration'.
  Types of property 'aggregate' are incompatible.
    Type '"max"[]' is not assignable to type '("mean" | "sum")[]'.
      Type '"max"' is not assignable to type '"mean" | "sum"'.`,
    ]);
  });

  test("whose config is missing a field fails to compile", () => {
    expect(bad("grepWithoutPattern")).toEqual([
      `(3,35): error TS2345: Argument of type '{ instrument: "grep"; config: { glob: string; }; aggregate: "max"[]; }' is not assignable to parameter of type 'MeasurementDeclaration'.
  Types of property 'config' are incompatible.
    Property 'pattern' is missing in type '{ glob: string; }' but required in type '{ glob: string; pattern: string; }'.`,
    ]);
    expect(bad("templateTestWithoutTemplate")).toEqual([
      `(3,65): error TS2322: Type '{ subject: string; }' is not assignable to type '{ glob: string; } | { glob: string; pattern: string; } | { subject: string; template: string; }'.
  Property 'template' is missing in type '{ subject: string; }' but required in type '{ subject: string; template: string; }'.`,
    ]);
  });
});

describe("a code state", () => {
  const codeState = (name: string) => errorsIn(`test-case-parameters/codeStates/${name}/index.ts`);

  test("whose config reaches its applyParameter typed, and whose checkoutCommit takes its ctx, compiles cleanly", () => {
    expect(codeState("pinned")).toBeUndefined();
  });

  test("reading a property its config doesn't have fails to compile", () => {
    expect(codeState("reads-missing-config")).toEqual([
      `(5,58): error TS2339: Property 'sha' does not exist on type '{ commit: string; }'.`,
    ]);
  });

  test("with the old top-level commit fails to compile: it belongs in config", () => {
    expect(codeState("top-level-commit")).toEqual([
      `(4,3): error TS2353: Object literal may only specify known properties, and 'commit' does not exist in type 'CodeStateDeclaration<undefined>'.`,
    ]);
  });
});
