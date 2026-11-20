/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

// `thunderjar purge image`, through the CLI, with the fake Docker. Commands that only refuse or
// print run on 0203 unchanged; those that purge run on a copy of its project, whose own run data
// store they mark. An image store is a fake registry served in this process, never a real one.
import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { sqliteStore } from "../../../store/runDataStore.ts";
import { copyScenarioProject, type ProjectCopy, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";
import { fakeRegistry } from "../../../testing/fakeRegistry.ts";
import { scenario } from "../../../testing/scenario.ts";

/** Is-prime-baseline: 40 container runs, started 2026-10-01. */
const BASELINE = "01m3vf68s54p5eyn5s3t1ygkdj";
/** Two-harnesses: 2 container runs, 1-1 and 2-1, started 2026-10-02. */
const TWO_HARNESSES = "01m3ygz4g89aqh8yey8em0twpq";
const local = (id: string, run: string) => `thunderjar-postrun:${id}-${run}`;

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** An empty Docker config folder, so no login of the machine's is read. */
async function dockerConfig(): Promise<string> {
  const dir = `${TMP_DIR}/docker-config-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  cleanups.push(async () => void (await $`rm -rf ${dir}`.quiet()));
  return dir;
}

async function docker(options: Parameters<typeof fakeDocker>[0] = {}): Promise<FakeDocker> {
  const fake = await fakeDocker(options);
  cleanups.push(fake.remove);
  return fake;
}

/** A copy of 0203's project, its config's imageStore `imageStore` if given. */
async function project(imageStore?: string): Promise<ProjectCopy> {
  const copy = await copyScenarioProject("0203");
  cleanups.push(copy.remove);
  if (imageStore !== undefined) {
    await Bun.write(
      `${copy.dir}/.thunderjar/thunderjar.config.ts`,
      `import { declareConfig, sqliteStore } from "thunderjar";\n\nexport default declareConfig({\n  imageStore: ${imageStore},\n  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),\n});\n`,
    );
  }
  return copy;
}

const storeOf = (copy: ProjectCopy) => sqliteStore(`${copy.dir}/.thunderjar/.data/runs.sqlite`);
const purgesOf = async (copy: ProjectCopy, id: string) => (await storeOf(copy).containerRunsOf(id)).map((run) => run.postrunPurge);

async function purge(cwd: string, args: string[], fake?: FakeDocker, paths: Record<string, string> = {}) {
  return thunderjar(cwd, ["purge", "image", ...args], { env: { ...(fake ?? (await docker())).env, DOCKER_CONFIG: await dockerConfig() }, paths });
}

describe("refusals, on 0203 unchanged", () => {
  test.each([
    [[], "Say which images to purge: execution IDs, --test-case <name>, or --all."],
    [["--older-than", "30d"], "Say which images to purge: execution IDs, --test-case <name>, or --all."],
    [[TWO_HARNESSES, "--all"], "Give execution IDs, --test-case or --all: only one of them."],
    [[TWO_HARNESSES, "--kind", "prerun"], "Prerun images are shared between executions, so --kind prerun needs --test-case or --all, not execution IDs."],
    [["--all", "--kind", "prerun", "--older-than", "1d"], "--older-than picks executions by when they started, and prerun images have no such date: use it with --kind postrun."],
    [["--all", "--kind", "all", "--record-only"], "--record-only marks postrun images in the run data store, and prerun images aren't recorded there: use it with --kind postrun."],
    [["--all", "--from", "store"], "There's no image store to purge from: the config's imageStore is null."],
    [["nope"], "No execution nope recorded. List them with `thunderjar executions`."],
  ])("%p", async (args, message) => {
    expect(await purge(scenario("0203"), args)).toEqual({ stdout: "", stderr: `Error: ${message}\n`, exitCode: 1 });
  });

  test("--older-than that isn't an age", async () => {
    const { stderr, exitCode } = await purge(scenario("0203"), ["--all", "--older-than", "a month"]);

    expect(stderr).toContain('"a month" is not an age: give a whole number and a unit, m, h, d or w, e.g. 30d or 12h');
    expect(exitCode).toBe(1);
  });

  test("without a terminal to ask on, and without --yes, it says what it would purge, and purges nothing", async () => {
    const fake = await docker({ images: [local(TWO_HARNESSES, "1-1")] });

    const { stdout, stderr, exitCode } = await purge(scenario("0203"), [TWO_HARNESSES], fake);

    expect(stdout).toBe(`Purging 2 postrun images of 1 execution, from the local daemon:
  <ULID>  two-harnesses  2026-10-02 14:40  2 postrun images
`);
    expect(stderr).toBe("Error: Not purging without asking, and there's no terminal to ask on. Pass --yes to purge, or --dry-run to see what would be.\n");
    expect(exitCode).toBe(1);
    expect(await fake.images()).toEqual([local(TWO_HARNESSES, "1-1")]);
  });
});

describe("--dry-run, on 0203 unchanged", () => {
  test("--test-case with --older-than: only its executions that started before then", async () => {
    // Between the two two-harnesses executions: 2026-10-02 is older, 2026-10-04 isn't.
    const hours = Math.floor((Date.now() - Date.parse("2026-10-03T12:00:00Z")) / 3_600_000);

    expect(await purge(scenario("0203"), ["--test-case", "two-harnesses", "--older-than", `${hours}h`, "--dry-run"])).toEqual({
      stdout: `Would purge 2 postrun images of 1 execution, from the local daemon:
  <ULID>  two-harnesses  2026-10-02 14:40  2 postrun images
Dry run: nothing was purged.
`,
      stderr: "",
      exitCode: 0,
    });
  });

  test("--all leaves out an execution still running, and says so", async () => {
    const { stdout, stderr, exitCode } = await purge(scenario("0203"), ["--all", "--dry-run"]);

    expect(stderr).toBe("Warning: Leaving out <ULID>: it's still running.\n");
    expect(stdout).toBe(`Would purge 44 postrun images of 3 executions, from the local daemon:
  <ULID>  is-prime-baseline  2026-10-01 10:12  40 postrun images
  <ULID>  two-harnesses      2026-10-02 14:40  2 postrun images
  <ULID>  two-harnesses      2026-10-04 08:30  2 postrun images
Dry run: nothing was purged.
`);
    expect(exitCode).toBe(0);
  });

  test("--kind prerun --test-case: the prerun images the test case builds now", async () => {
    const { stdout, exitCode } = await purge(scenario("0203"), ["--test-case", "two-harnesses", "--kind", "prerun", "--dry-run"]);

    expect(stdout).toBe(`Would purge 2 prerun images, from the local daemon:
  prerun  thunderjar-prerun:9ee415ba
  prerun  thunderjar-prerun:81306645
Dry run: nothing was purged.
`);
    expect(exitCode).toBe(0);
  });

  test("--json: what would be purged, and nothing else on stdout", async () => {
    const { stdout, stderr, exitCode } = await purge(scenario("0203"), [TWO_HARNESSES, "--dry-run", "--json"]);

    expect(exitCode).toBe(0);
    expect(stderr).toStartWith("Would purge 2 postrun images");
    expect(JSON.parse(stdout)).toEqual({
      dryRun: true,
      recordOnly: false,
      places: { local: true, store: null },
      running: [],
      postrun: [
        { executionId: "<ULID>", run: "1-1", permutation: 1, iteration: 1, local: [local("<ULID>", "1-1")] },
        { executionId: "<ULID>", run: "2-1", permutation: 2, iteration: 1, local: [local("<ULID>", "2-1")] },
      ],
      prerun: [],
    });
  });

  test("nothing selected is nothing to purge", async () => {
    expect((await purge(scenario("0203"), ["--all", "--older-than", "100000d", "--dry-run"])).stdout).toBe("Nothing to purge.\n");
  });
});

describe("purging, on a copy of 0203", () => {
  test("--yes from the local daemon: removes the images there, counts one already gone as purged, and marks both runs, with the reason", async () => {
    const copy = await project();
    const fake = await docker({ images: [local(TWO_HARNESSES, "1-1"), local(BASELINE, "1-1")] });

    const { stdout, stderr, exitCode } = await purge(copy.dir, [TWO_HARNESSES, "--yes", "--reason", "held leaked keys"], fake);

    expect(stderr).toBe("");
    expect(stdout).toEndWith("<ULID>  2 runs marked purged\nPurged 2 postrun images.\n");
    expect(exitCode).toBe(0);
    expect(await fake.images()).toEqual([local(BASELINE, "1-1")]);
    expect((await fake.commands()).filter((command) => command.startsWith("docker image rm"))).toEqual([`docker image rm ${local(TWO_HARNESSES, "1-1")}`]);
    expect(await purgesOf(copy, TWO_HARNESSES)).toEqual([1, 2].map(() => ({ purgedAt: expect.any(String), from: "daemon", reason: "held leaked keys" })));
    expect((await purgesOf(copy, BASELINE)).every((purged) => purged === undefined)).toBe(true);
  });

  test("an image Docker won't remove isn't marked, and the exit code says so", async () => {
    const copy = await project();
    const fake = await docker({ images: [local(TWO_HARNESSES, "1-1")], failing: [local(TWO_HARNESSES, "1-1")] });

    const { stdout, stderr, exitCode } = await purge(copy.dir, [TWO_HARNESSES, "--yes"], fake);

    expect(stdout).toContain(`Purged 1 postrun image; 1 image not purged.\n  ${local("<ULID>", "1-1")}  local  failed  (`);
    expect(stderr).toBe("Error: 1 image couldn't be purged: see above, and the log.\n");
    expect(exitCode).toBe(1);
    expect(await purgesOf(copy, TWO_HARNESSES)).toEqual([undefined, expect.objectContaining({ from: "daemon" })]);
  });

  test("--record-only deletes nothing, and marks the runs", async () => {
    const copy = await project();
    const fake = await docker({ images: [local(TWO_HARNESSES, "1-1")] });

    const { stdout, exitCode } = await purge(copy.dir, [TWO_HARNESSES, "--record-only", "--yes", "--reason", "removed by hand"], fake);

    expect(stdout).toStartWith("Recording as purged, deleting nothing, 2 postrun images of 1 execution, from the local daemon:\n");
    expect(stdout).toEndWith("Recorded 2 postrun images.\n");
    expect(exitCode).toBe(0);
    expect(await fake.images()).toEqual([local(TWO_HARNESSES, "1-1")]);
    expect(await purgesOf(copy, TWO_HARNESSES)).toEqual([1, 2].map(() => ({ purgedAt: expect.any(String), from: "daemon", reason: "removed by hand" })));
  });

  test("running it again is harmless: the runs stay marked", async () => {
    const copy = await project();
    const fake = await docker({ images: [local(TWO_HARNESSES, "1-1")] });

    await purge(copy.dir, [TWO_HARNESSES, "--yes"], fake);
    const again = await purge(copy.dir, [TWO_HARNESSES, "--yes"], fake);

    expect(again.exitCode).toBe(0);
    expect(await purgesOf(copy, TWO_HARNESSES)).toEqual([1, 2].map(() => ({ purgedAt: expect.any(String), from: "daemon" })));
  });

  test("--kind prerun --all --from local: every prerun image in the daemon, and no run marked", async () => {
    const copy = await project();
    const fake = await docker({ images: ["thunderjar-prerun:aaaa1111", "thunderjar-prerun:bbbb2222", local(TWO_HARNESSES, "1-1")] });

    const { stdout, exitCode } = await purge(copy.dir, ["--all", "--kind", "prerun", "--from", "local", "--yes"], fake);

    expect(stdout).toBe(`Purging 2 prerun images, from the local daemon:
  prerun  thunderjar-prerun:aaaa1111
  prerun  thunderjar-prerun:bbbb2222
Purged 0 postrun images and 2 prerun images.
`);
    expect(exitCode).toBe(0);
    expect(await fake.images()).toEqual([local(TWO_HARNESSES, "1-1")]);
    expect((await purgesOf(copy, TWO_HARNESSES)).every((purged) => purged === undefined)).toBe(true);
  });
});

describe("purging from an image store, a fake registry", () => {
  /** A copy of 0203 whose image store is `registry`'s acme/images, with two-harnesses' 2026-10-02 runs recorded as pushed there. */
  async function pushedProject(host: string, deleteCommand?: string[]) {
    const repository = `${host}/acme/images`;
    const copy = await project(`{ repository: ${JSON.stringify(repository)}${deleteCommand ? `, deleteCommand: ${JSON.stringify(deleteCommand)}` : ""} }`);
    const db = new Database(`${copy.dir}/.thunderjar/.data/runs.sqlite`, { strict: true });
    db.query("UPDATE container_runs SET record = json_set(record, '$.postrunImage', $repository || ':postrun-' || permutation || '-' || iteration) WHERE execution_id = $id").run({
      repository,
      id: TWO_HARNESSES,
    });
    db.close();
    return { copy, repository };
  }

  test("deletes each through the registry's API, and from the daemon, and marks them purged from both", async () => {
    await using registry = fakeRegistry();
    for (const tag of ["postrun-1-1", "postrun-2-1", "postrun-other"]) registry.add("acme/images", tag);
    const { copy } = await pushedProject(registry.host);
    const fake = await docker({ loggedIn: [registry.host] });

    const { stdout, stderr, exitCode } = await purge(copy.dir, [TWO_HARNESSES, "--yes"], fake, { "<HOST>": registry.host });

    expect(stderr).toBe("");
    expect(stdout).toStartWith("Purging 2 postrun images of 1 execution, from the local daemon and <HOST>/acme/images:\n");
    expect(stdout).toEndWith("Purged 2 postrun images.\n");
    expect(exitCode).toBe(0);
    expect(registry.tags("acme/images")).toEqual(["postrun-other"]);
    expect(await purgesOf(copy, TWO_HARNESSES)).toEqual([1, 2].map(() => ({ purgedAt: expect.any(String), from: "both" })));
  });

  test("without a login for the store's registry, nothing is purged", async () => {
    await using registry = fakeRegistry();
    registry.add("acme/images", "postrun-1-1");
    const { copy } = await pushedProject(registry.host);
    const fake = await docker({ images: [local(TWO_HARNESSES, "1-1")] });

    const { stderr, exitCode } = await purge(copy.dir, [TWO_HARNESSES, "--yes"], fake, { "<HOST>": registry.host });

    expect(stderr).toStartWith("Error: Can't purge from <HOST>/acme/images: no valid Docker login for <HOST> (");
    expect(exitCode).toBe(1);
    expect(await fake.images()).toEqual([local(TWO_HARNESSES, "1-1")]);
    expect(registry.tags("acme/images")).toEqual(["postrun-1-1"]);
  });

  test("a registry that refuses deletes, with no deleteCommand: asked once, those stay, marked purged from the daemon only, and it fails", async () => {
    await using registry = fakeRegistry({ deletes: false });
    for (const tag of ["postrun-1-1", "postrun-2-1"]) registry.add("acme/images", tag);
    const { copy } = await pushedProject(registry.host);
    const fake = await docker({ loggedIn: [registry.host] });

    const { stderr, exitCode } = await purge(copy.dir, [TWO_HARNESSES, "--yes"], fake, { "<HOST>": registry.host });

    expect(stderr).toBe(
      "Error: <HOST> refused to delete images (405 UNSUPPORTED: The operation is unsupported.), and the image store has no deleteCommand to delete them another way. They're still in <HOST>/acme/images, and their runs aren't marked as purged from it.\n",
    );
    expect(exitCode).toBe(1);
    expect(registry.requests.filter((request) => request.startsWith("DELETE"))).toHaveLength(1);
    expect(registry.tags("acme/images")).toEqual(["postrun-1-1", "postrun-2-1"]);
    expect(await purgesOf(copy, TWO_HARNESSES)).toEqual([1, 2].map(() => ({ purgedAt: expect.any(String), from: "daemon" })));
  });

  test("a registry that refuses deletes, with a deleteCommand: the command deletes each, given its reference", async () => {
    await using registry = fakeRegistry({ deletes: false });
    for (const tag of ["postrun-1-1", "postrun-2-1"]) registry.add("acme/images", tag);
    const { copy, repository } = await pushedProject(registry.host, ["sh", "-c", 'echo "$1" >> deleted.txt', "delete-image"]);
    const fake = await docker({ loggedIn: [registry.host] });

    const { stdout, exitCode } = await purge(copy.dir, [TWO_HARNESSES, "--yes", "--json"], fake);

    expect(exitCode).toBe(0);
    expect(await Bun.file(`${copy.dir}/deleted.txt`).text()).toBe(`${repository}:postrun-1-1\n${repository}:postrun-2-1\n`);
    expect(registry.requests.filter((request) => request.startsWith("DELETE"))).toHaveLength(1);
    const { postrun } = JSON.parse(stdout) as { postrun: { storeOutcome: unknown; recorded: unknown }[] };
    expect(postrun.map(({ storeOutcome, recorded }) => [storeOutcome, recorded])).toEqual(
      [1, 2].map(() => [{ outcome: "deleted", by: "deleteCommand" }, { purgedAt: expect.any(String), from: "both" }]),
    );
  });

  test("--from store leaves the daemon alone, and marks the runs purged from the image store", async () => {
    await using registry = fakeRegistry();
    for (const tag of ["postrun-1-1", "postrun-2-1"]) registry.add("acme/images", tag);
    const { copy } = await pushedProject(registry.host);
    const fake = await docker({ loggedIn: [registry.host], images: [local(TWO_HARNESSES, "1-1")] });

    const { exitCode } = await purge(copy.dir, [TWO_HARNESSES, "--from", "store", "--yes"], fake);

    expect(exitCode).toBe(0);
    expect(await fake.images()).toEqual([local(TWO_HARNESSES, "1-1")]);
    expect(registry.tags("acme/images")).toEqual([]);
    expect(await purgesOf(copy, TWO_HARNESSES)).toEqual([1, 2].map(() => ({ purgedAt: expect.any(String), from: "imageStore" })));
  });

  test("--kind prerun --all: every prerun-h tag in the store, and every prerun image in the daemon", async () => {
    await using registry = fakeRegistry();
    for (const tag of ["prerun-haaaa1111", "prerun-hcccc3333", "postrun-1-1"]) registry.add("acme/images", tag);
    const { copy } = await pushedProject(registry.host);
    const fake = await docker({ loggedIn: [registry.host], images: ["thunderjar-prerun:aaaa1111", "thunderjar-prerun:bbbb2222"] });

    const { stdout, exitCode } = await purge(copy.dir, ["--all", "--kind", "prerun", "--dry-run"], fake, { "<HOST>": registry.host });

    expect(stdout).toBe(`Would purge 3 prerun images, from the local daemon and <HOST>/acme/images:
  prerun  thunderjar-prerun:aaaa1111  <HOST>/acme/images:prerun-haaaa1111
  prerun  thunderjar-prerun:bbbb2222
  prerun  <HOST>/acme/images:prerun-hcccc3333
Dry run: nothing was purged.
`);
    expect(exitCode).toBe(0);
    expect(registry.tags("acme/images")).toEqual(["postrun-1-1", "prerun-haaaa1111", "prerun-hcccc3333"]);
  });
});
