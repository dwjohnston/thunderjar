import { describe, expect, test } from "bun:test";
import { copyScenarioProject } from "../testing/cli.ts";
import { scenario } from "../testing/scenario.ts";
import { ConfigError } from "./loader.ts";
import { instruments } from "../instruments/instruments.ts";
import { loadMeasurements } from "./measurements.ts";

const MEASUREMENTS = "parameters/tasks/is-prime/measurements";

describe("loadMeasurements", () => {
  const root = `${scenario("0202")}/.thunderjar`;

  test("loads each measurement of the task, named by its file, sorted, leaving out the files that come with them", async () => {
    const measurements = await loadMeasurements(root, "is-prime");

    expect(measurements.map(({ name }) => name)).toEqual(["isPrimeShape", "isPrimeTests", "isPrimeTsExists", "saysArr", "tsIgnoreCount"]);
    expect(measurements[2]).toEqual({
      name: "isPrimeTsExists",
      declaration: { instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, metrics: { exists: { stat: "rate" } } },
      config: { glob: "**/isPrime.ts" },
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test("gives a test as an absolute path", async () => {
    const isPrimeTests = (await loadMeasurements(root, "is-prime")).find(({ name }) => name === "isPrimeTests");

    expect(isPrimeTests?.config).toEqual({ subject: "**/isPrime.ts", test: `${root}/${MEASUREMENTS}/isPrime.test.ts` });
  });

  test("a task without a measurements folder has none", async () => {
    expect(await loadMeasurements(`${scenario("0402")}/.thunderjar`, "fizz-buzz")).toEqual([]);
  });

  test("a measurement's content hash is of its instrument, config and test, not its name, how its values combine, or the test's reference implementation", async () => {
    const hashes = async (change?: (dir: string) => Promise<void>) => {
      await using copy = await copyScenarioProject("0202");
      await change?.(`${copy.dir}/.thunderjar/${MEASUREMENTS}`);
      const measurements = await loadMeasurements(`${copy.dir}/.thunderjar`, "is-prime");
      return Object.fromEntries(measurements.map(({ name, contentHash }) => [name, contentHash]));
    };
    const edit = (file: string, from: string, to: string) => async (dir: string) => {
      await Bun.write(`${dir}/${file}`, (await Bun.file(`${dir}/${file}`).text()).replace(from, to));
    };
    const before = await hashes();

    expect(await hashes()).toEqual(before);
    expect(await hashes(edit("tsIgnoreCount.ts", '["mean", "max"]', '["sum"]'))).toEqual(before);
    const renamed = await hashes(async (dir) => {
      await Bun.$`mv ${dir}/tsIgnoreCount.ts ${dir}/ignores.ts`.quiet();
    });
    expect(renamed.ignores).toBe(before.tsIgnoreCount as string);

    const configChanged = await hashes(edit("tsIgnoreCount.ts", '"@ts-ignore"', '"@ts-expect-error"'));
    expect(configChanged.tsIgnoreCount).not.toBe(before.tsIgnoreCount as string);
    expect(configChanged.isPrimeTsExists).toBe(before.isPrimeTsExists as string);
    const testChanged = await hashes(edit("isPrime.test.ts", "17", "19"));
    expect(testChanged.isPrimeTests).not.toBe(before.isPrimeTests as string);
    expect(testChanged.tsIgnoreCount).toBe(before.tsIgnoreCount as string);
    // The reference implementation is only for running the test on the host: the test doesn't
    // import it when measured.
    expect(await hashes(edit("isPrime.reference.ts", "n < 2", "n <= 1"))).toEqual(before);
  });

  test("fails, naming every problem, for measurements that don't fit their instrument", async () => {
    await using copy = await copyScenarioProject("0202");
    const dir = `${copy.dir}/.thunderjar/${MEASUREMENTS}`;
    await Bun.write(
      `${dir}/broken.ts`,
      'import { declareMeasurement } from "thunderjar";\n\nexport default declareMeasurement({ instrument: "grep", config: { glob: "*.ts" }, metrics: { count: { stat: "rate" } } } as never);\n',
    );

    await expect(loadMeasurements(`${copy.dir}/.thunderjar`, "is-prime")).rejects.toThrow(
      new ConfigError(
        `.thunderjar/${MEASUREMENTS}/broken.ts: config.pattern: must be a JavaScript regular expression, got undefined`,
        `.thunderjar/${MEASUREMENTS}/broken.ts: metrics.count.stat: "rate" doesn't combine grep's default score, a number. Use one of: mean, median, min, max, sum, or give the metric a score`,
      ),
    );
  });

  test("fails, naming every problem, for metrics that are wrong", async () => {
    const problems = async (metrics: string, rest = "") => {
      await using copy = await copyScenarioProject("0202");
      const file = `${copy.dir}/.thunderjar/${MEASUREMENTS}/broken.ts`;
      await Bun.write(
        file,
        `import { declareMeasurement } from "thunderjar";\n\nexport default declareMeasurement({ instrument: "fileCreated", config: { glob: "*.ts" }${metrics}${rest} } as never);\n`,
      );
      try {
        await loadMeasurements(`${copy.dir}/.thunderjar`, "is-prime");
        return [];
      } catch (error) {
        return (error as ConfigError).message.split("\n").map((line) => line.replace(`.thunderjar/${MEASUREMENTS}/broken.ts: `, ""));
      }
    };

    expect(await problems("")).toEqual(["metrics: must be an object of metrics by name, got undefined"]);
    expect(await problems(", metrics: {}")).toEqual(["metrics: must have at least one metric"]);
    expect(await problems("", ', aggregate: ["rate"]')).toEqual(['aggregate: is no longer supported: use metrics, e.g. metrics: { passes: { stat: "rate" } }']);
    expect(await problems(', metrics: { "is-there": { stat: "rate" } }')).toEqual(['metrics.is-there: "is-there" is not a metric name: use an identifier, e.g. passRate']);
    expect(await problems(', metrics: { exists: { stat: "average" } }')).toEqual([
      'metrics.exists.stat: "average" is not a statistic. Use one of: rate, count, mean, median, min, max, sum',
    ]);
    expect(await problems(', metrics: { exists: { stat: "rate", better: "more" } }')).toEqual(['metrics.exists.better: must be "higher" or "lower", got "more"']);
    expect(await problems(', metrics: { exists: { stat: "rate", score: true } }')).toEqual(["metrics.exists.score: must be a function of fileCreated's value, got true"]);
    // A score of its own decides what it scores, so its stat isn't checked until it's read.
    expect(await problems(", metrics: { files: { stat: \"mean\", score: (v) => (v ? 1 : 0) } }")).toEqual([]);
  });

  test("includes the instrument's version in the content hash", async () => {
    const hashOf = async () => (await loadMeasurements(root, "is-prime")).find(({ name }) => name === "isPrimeTests")?.contentHash;
    const before = await hashOf();
    const { version } = instruments.bunTestFile;
    instruments.bunTestFile.version = version + 1;
    try {
      expect(await hashOf()).not.toBe(before as string);
    } finally {
      instruments.bunTestFile.version = version;
    }
  });
});
