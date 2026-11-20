/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// `thunderjar checkout`, through the CLI, on a copy of 0203's project, whose run data store it reads.
import { afterEach, describe, expect, test } from "bun:test";
import { abbreviateHash } from "../../../config/permutations.ts";
import { type ContainerRunRecord, sqliteStore } from "../../../store/runDataStore.ts";
import { copyScenarioProject, type ProjectCopy, thunderjar } from "../../../testing/cli.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";

/** Two-harnesses: 2 container runs, 1-1 and 2-1. */
const TWO_HARNESSES = "01m3ygz4g89aqh8yey8em0twpq";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function project(): Promise<ProjectCopy> {
  const copy = await copyScenarioProject("0203");
  cleanups.push(copy.remove);
  return copy;
}

const storeOf = (copy: ProjectCopy) => sqliteStore(`${copy.dir}/.thunderjar/.data/runs.sqlite`);

/** A container run's ID: its execution's, its permutation's abbreviated hash, and its iteration's index. */
const runId = (run: ContainerRunRecord) => `${run.executionId}-h${abbreviateHash(run.permutationHash)}-i${String(run.iteration - 1).padStart(2, "0")}`;

describe("checkout", () => {
  test("a run whose postrun image was purged fails, with that reason", async () => {
    const copy = await project();
    const [run] = await storeOf(copy).markPostrunsPurged(TWO_HARNESSES, { purgedAt: "2026-10-03T00:00:00.000Z", from: "daemon" }, [{ permutation: 1, iteration: 1 }]);
    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["checkout", runId(run!)]);
    expect({ stdout, stderr, exitCode }).toEqual({
      stdout: "",
      stderr: `Error: Can't check out ${runId(run!).replace(TWO_HARNESSES, "<ULID>")}: its postrun image was purged.\n`,
      exitCode: 1,
    });
  });

  test("--shell runs an interactive shell in the run's postrun image, removed when it ends", async () => {
    const copy = await project();
    const [run] = await storeOf(copy).containerRunsOf(TWO_HARNESSES);
    const fake = await fakeDocker({ images: [run!.postrunImage] });
    cleanups.push(fake.remove);
    await thunderjar(copy.dir, ["checkout", runId(run!), "--shell"], { env: fake.env });
    expect(await fake.commands()).toContain(
      `docker run --rm --interactive --tty --pull missing --entrypoint sh ${run!.postrunImage} -c command -v bash >/dev/null && exec bash || exec sh`,
    );
  });
});
