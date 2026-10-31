// The recording fake Docker supplying a saved postrun image's files, as the Docker measurement
// opener reads them (running/runner.ts): `create`, `cp` its /workspace/. and
// /thunderjar/result.json, then `rm --force`. The fake runs as its own executable, the way
// THUNDERJAR_DOCKER runs it, with only the state each test gives it. Its images are scenario 8's
// saved postrun files, which no test changes:
//
//   fixtureTests/scenario_8_recorded_executions/postrun-files/<execution ID>/<postrun tag>/

import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, listDir, listFilesSync, makeDir, makeTempDir, readBytesSync, remove } from "../platform/fs.ts";
import { join } from "../platform/path.ts";
import { fakeDocker, scenario } from "./cli.ts";
import { FAKE_DOCKER } from "./fake-docker.ts";

const postrunFiles = join(scenario("scenario_8_recorded_executions"), "..", "postrun-files");

/** The behaving agent's first run in the execution whose readmeExists errored. */
const ERRORED_I00 = "postrun-e01k4x9j2e8mqz3abcdefghjkmn-h8ffdda6e-i00";
/** The behaving agent's second run in the oldest execution. */
const OLDEST_I01 = "postrun-e01k4tq3h8r0000000000000000-h8ffdda6e-i01";
/** A recorded run of scenario 8 with no saved files. */
const UNSAVED = "postrun-e01k4x9j2e8mqz3abcdefghjkmn-h42440c48-i00";

const saved = (tag: string) => join(postrunFiles, tag.match(/^postrun-e([0-9a-z]+)-/)![1]!, tag);
const ref = (tag: string) => `thunderjar:${tag}`;

/** What fake-harness-alpha@1.0.0's cli writes for scenario 8's `plain` prompt. */
const BUGGY_IS_PRIME = `// Create a file isPrime.ts exporting a function that tests for primality.
// @ts-ignore
export const isPrime = (n: number) => n > 1 && n % 2 !== 0;
`;

/** Every file under `dir`, relative to it, with its bytes; none if there is no `dir`. */
function contents(dir: string): Record<string, Buffer> {
  if (!existsSync(dir)) return {};
  return Object.fromEntries(listFilesSync(dir).map((file) => [file, Buffer.from(readBytesSync(join(dir, file)))]));
}

type State = Awaited<ReturnType<typeof fakeDocker>>;

/** Runs the fake as `docker <args…>`, in an environment of its own holding only `state`. */
async function docker(state: State, ...args: string[]) {
  const proc = Bun.spawn([FAKE_DOCKER, ...args], {
    env: { PATH: process.env.PATH!, ...state.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("fake docker with saved postrun files", () => {
  let checkedIn: ReturnType<typeof contents>;
  const disposable: string[] = [];
  const states: State[] = [];

  const destination = async () => {
    const dir = await makeTempDir("thunderjar-fake-docker-cp-");
    disposable.push(dir);
    return dir;
  };
  const state = async (postruns: Record<string, string>) => {
    const created = await fakeDocker([], [], postruns);
    states.push(created);
    return created;
  };

  beforeAll(() => {
    checkedIn = contents(postrunFiles);
  });

  afterEach(async () => {
    for (const dir of disposable.splice(0)) await remove(dir);
    for (const created of states.splice(0)) {
      await created.remove();
      expect(existsSync(created.env.FAKE_DOCKER_DIR)).toBe(false);
    }
    expect(contents(postrunFiles)).toEqual(checkedIn);
  });

  test("scenario 8 saves the workspaces of two runs, and nothing else", () => {
    expect(Object.keys(checkedIn)).toEqual([
      `01k4tq3h8r0000000000000000/${OLDEST_I01}/workspace/isPrime.ts`,
      `01k4x9j2e8mqz3abcdefghjkmn/${ERRORED_I00}/workspace/isPrime.ts`,
    ]);
  });

  for (const tag of [ERRORED_I00, OLDEST_I01]) {
    test(`create, cp /workspace/. and rm --force give ${tag}'s saved workspace, byte for byte`, async () => {
      const fake = await state({ [ref(tag)]: saved(tag) });
      const workdir = await destination();

      expect(await docker(fake, "create", "--name", "thunderjar-measure-1a2b3c4d", "--entrypoint", "sh", ref(tag))).toEqual({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });
      expect(fake.containers()).toEqual(["thunderjar-measure-1a2b3c4d"]);
      expect(await docker(fake, "cp", "thunderjar-measure-1a2b3c4d:/workspace/.", workdir)).toEqual({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });
      expect(contents(workdir)).toEqual({ "isPrime.ts": Buffer.from(BUGGY_IS_PRIME) });

      expect(await docker(fake, "rm", "--force", "thunderjar-measure-1a2b3c4d")).toEqual({ stdout: "", stderr: "", exitCode: 0 });
      expect(fake.containers()).toEqual([]);
      expect(fake.commands()).toEqual([
        `docker create --name thunderjar-measure-1a2b3c4d --entrypoint sh ${ref(tag)}`,
        `docker cp thunderjar-measure-1a2b3c4d:/workspace/. ${workdir}`,
        "docker rm --force thunderjar-measure-1a2b3c4d",
      ]);
    });
  }

  test("cp of an absent /thunderjar/result.json fails and writes nothing", async () => {
    const fake = await state({ [ref(ERRORED_I00)]: saved(ERRORED_I00) });
    const scratch = await destination();

    await docker(fake, "create", "--name", "thunderjar-measure-1a2b3c4d", "--entrypoint", "sh", ref(ERRORED_I00));
    expect(await docker(fake, "cp", "thunderjar-measure-1a2b3c4d:/thunderjar/result.json", join(scratch, "result.json"))).toEqual({
      stdout: "",
      stderr: "Error response from daemon: Could not find the file /thunderjar/result.json in container thunderjar-measure-1a2b3c4d\n",
      exitCode: 1,
    });
    expect(listDir(scratch)).toEqual([]);
    expect(fake.commands()).toEqual([
      `docker create --name thunderjar-measure-1a2b3c4d --entrypoint sh ${ref(ERRORED_I00)}`,
      `docker cp thunderjar-measure-1a2b3c4d:/thunderjar/result.json ${join(scratch, "result.json")}`,
    ]);
  });

  test("cp of a saved /thunderjar/result.json copies it to the destination file", async () => {
    // Scenario 8 saves no result file, so this image's files are saved in a folder of the test's own.
    const files = await destination();
    await makeDir(join(files, "workspace"));
    await makeDir(join(files, "thunderjar"));
    await Bun.write(join(files, "thunderjar", "result.json"), '{"model":"fake-model-small-001"}\n');
    const fake = await state({ "throwaway:postrun-with-result": files });
    const scratch = await destination();

    await docker(fake, "create", "--name", "thunderjar-measure-1a2b3c4d", "--entrypoint", "sh", "throwaway:postrun-with-result");
    expect(await docker(fake, "cp", "thunderjar-measure-1a2b3c4d:/thunderjar/result.json", join(scratch, "result.json"))).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    expect(contents(scratch)).toEqual({ "result.json": Buffer.from('{"model":"fake-model-small-001"}\n') });
  });

  test("create from an image with no saved files fails, and creates no container", async () => {
    const fake = await state({ [ref(ERRORED_I00)]: saved(ERRORED_I00) });
    const workdir = await destination();

    expect(await docker(fake, "create", "--name", "thunderjar-measure-1a2b3c4d", "--entrypoint", "sh", ref(UNSAVED))).toEqual({
      stdout: "",
      stderr: `Error: No such image: ${ref(UNSAVED)} (fake docker: no saved postrun files for it)\n`,
      exitCode: 1,
    });
    expect(fake.containers()).toEqual([]);
    expect(await docker(fake, "cp", "thunderjar-measure-1a2b3c4d:/workspace/.", workdir)).toEqual({
      stdout: "",
      stderr: "Error response from daemon: No such container: thunderjar-measure-1a2b3c4d\n",
      exitCode: 1,
    });
    expect(listDir(workdir)).toEqual([]);
  });

  test("after rm --force, the container's files can't be copied, and its name can be used again", async () => {
    const fake = await state({ [ref(ERRORED_I00)]: saved(ERRORED_I00), [ref(OLDEST_I01)]: saved(OLDEST_I01) });
    const workdir = await destination();

    await docker(fake, "create", "--name", "thunderjar-measure-1a2b3c4d", "--entrypoint", "sh", ref(ERRORED_I00));
    expect(await docker(fake, "create", "--name", "thunderjar-measure-1a2b3c4d", "--entrypoint", "sh", ref(OLDEST_I01))).toEqual({
      stdout: "",
      stderr: 'Error response from daemon: Conflict. The container name "/thunderjar-measure-1a2b3c4d" is already in use\n',
      exitCode: 1,
    });
    await docker(fake, "rm", "--force", "thunderjar-measure-1a2b3c4d");
    expect(await docker(fake, "cp", "thunderjar-measure-1a2b3c4d:/workspace/.", workdir)).toEqual({
      stdout: "",
      stderr: "Error response from daemon: No such container: thunderjar-measure-1a2b3c4d\n",
      exitCode: 1,
    });
    expect(await docker(fake, "create", "--name", "thunderjar-measure-1a2b3c4d", "--entrypoint", "sh", ref(OLDEST_I01))).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    expect(fake.containers()).toEqual(["thunderjar-measure-1a2b3c4d"]);
    expect(fake.commands()).toHaveLength(5);
  });
});
