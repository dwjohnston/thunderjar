// `thunderjar run --dry-run`, through the CLI. It only reads the project, so it runs on the scenarios
// unchanged. Any of these can be run by hand, e.g. `bun run fixture 0202 run is-prime-baseline --dry-run`.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";
const TERSE = "isPrime.ts: export a primality test.";

const ALPHA = (prompt: string) =>
  `printf '%s\\n' '// ${prompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts && echo '{"model":"fake-model-small-001"}' > /thunderjar/result.json`;
const BETA = (prompt: string) =>
  `printf '%s\\n' '// ${prompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts && echo '{"model":"fake-model-large-001"}' > /thunderjar/result.json`;

/** The dry run's lines for permutation `n`, with its `iterations`, each running `command`. */
const permutation = (n: number, hash: string, iterations: number, command: string) =>
  [
    `Permutation ${n}: prerun image thunderjar-prerun:${hash}`,
    ...Array.from({ length: iterations }, (_, i) => [
      `  Iteration ${i + 1}: postrun image thunderjar-postrun:<ULID>-${n}-${i + 1}`,
      `    ${command}`,
    ]).flat(),
  ].join("\n");

const filesIn = (dir: string) => [...new Glob("**").scanSync({ cwd: dir, dot: true })].sort();

describe("0202 typical project", () => {
  test("example: the execution's ID, then its one permutation's prerun image, and its iteration's postrun image and harness command", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "45bcf0be", 1, ALPHA(PLAIN))}
`);
  });

  test("is-prime-baseline: every permutation in plan's order, with its hash, and every iteration inside it", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "45bcf0be", 5, ALPHA(PLAIN))}

${permutation(2, "fc556cc9", 5, ALPHA(TERSE))}

${permutation(3, "90abcb0a", 5, BETA(PLAIN))}

${permutation(4, "775c8f66", 5, BETA(TERSE))}

${permutation(5, "cda1818b", 5, ALPHA(PLAIN))}

${permutation(6, "67844e9a", 5, ALPHA(TERSE))}

${permutation(7, "df1934bd", 5, BETA(PLAIN))}

${permutation(8, "f4979542", 5, BETA(TERSE))}
`);
  });

  test("the prerun images carry the hashes plan shows", async () => {
    const run = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"]);
    const plan = await thunderjar(scenario("0202"), ["plan", "is-prime-baseline"]);

    const hashes = plan.stdout.match(/\b[0-9a-f]{8}$/gm);
    expect(run.stdout.match(/(?<=thunderjar-prerun:)[0-9a-f]{8}/g)).toEqual(hashes);
  });

  test("writes nothing", async () => {
    const before = filesIn(scenario("0202"));

    await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"]);

    expect(filesIn(scenario("0202"))).toEqual(before);
  });

  test("an unknown test case is a configuration error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "missing", "--dry-run"]);

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: No test case named "missing": expected .thunderjar/test-cases/missing.ts.\n');
    expect(exitCode).toBe(1);
  });

  test("without --dry-run, it says only a dry run is possible so far", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example"]);

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: Running a test case is not implemented yet; use --dry-run.\n");
    expect(exitCode).toBe(1);
  });
});

describe("0201 minimal existing setup", () => {
  test("example: one permutation, one iteration", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["run", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "e943919c", 1, ALPHA(PLAIN))}
`);
  });
});
