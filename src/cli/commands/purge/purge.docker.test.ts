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

// `thunderjar purge image` against real Docker, and a real registry: a throwaway `registry:2`
// container on 127.0.0.1, started here and removed after, never anyone else's registry. Skipped by
// `bun test`; run with `bun run test:docker`. Its images are pushed to that registry and removed
// after. Each test has its own registry, under a name of its own, and its own Docker config folder
// for its login, so the tests can run at once, as CI runs them, with `--concurrent`.
import { $ } from "bun";
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sqliteStore } from "../../../store/runDataStore.ts";
import { copyScenarioProject, type ProjectCopy, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { pullImage } from "../../../testing/pullImage.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const PREFIX = `tj-test-${RUN}`;
const BASE_IMAGE = `${PREFIX}-base:latest`;
/** Two-harnesses in 0203: 2 container runs, 1-1 and 2-1. */
const TWO_HARNESSES = "01m3ygz4g89aqh8yey8em0twpq";

/** A throwaway registry: its container's name, its `localhost:<port>`, and the Docker config folder holding its login. */
type Registry = { name: string; host: string; dockerConfig: string };
const registries: Registry[] = [];
const copies: ProjectCopy[] = [];
const pushed: string[] = [];

/**
 * A registry:2 container on a free port of 127.0.0.1, deletes enabled if `deletes`, removed after
 * the tests. Its name and config folder are its own: a count of those started so far isn't, as
 * tests running at once would read the same count before either had started one.
 */
async function startRegistry(deletes: boolean): Promise<Registry> {
  const id = crypto.randomUUID().slice(0, 8);
  const name = `${PREFIX}-registry-${id}`;
  // Pushed before it's started, so it's removed even if starting it fails part way.
  registries.push({ name, host: "", dockerConfig: `${TMP_DIR}/docker-config-${PREFIX}-${id}` });
  const registry = registries.at(-1)!;
  await pullImage("registry:2");
  await $`docker run --detach --name ${name} -p 127.0.0.1::5000 -e REGISTRY_STORAGE_DELETE_ENABLED=${String(deletes)} registry:2`.quiet();
  registry.host = `localhost:${(await $`docker port ${name} 5000/tcp`.text()).trim().split(":").at(-1)}`;
  for (let i = 0; i < 50 && (await fetch(`http://${registry.host}/v2/`).catch(() => undefined))?.status !== 200; i++) await Bun.sleep(100);
  // Docker keeps no login for a registry without auth until asked: this one only in its own config folder.
  await $`docker --config ${registry.dockerConfig} login ${registry.host} --username test --password-stdin < ${new Response("test")}`.quiet();
  return registry;
}

/** Pushes the base image to `registry` as two-harnesses' runs' postrun images, and returns the repository. */
async function pushRuns({ host }: Registry): Promise<string> {
  const repository = `${host}/acme/images`;
  for (const run of ["1-1", "2-1"]) {
    const reference = `${repository}:postrun-${run}`;
    await $`docker tag ${BASE_IMAGE} ${reference} && docker push --quiet ${reference}`.quiet();
    pushed.push(reference);
  }
  return repository;
}

/** A copy of 0203 whose image store is `repository`, with two-harnesses' runs recorded as pushed there. */
async function project(repository: string, deleteCommand?: string[]): Promise<ProjectCopy> {
  const copy = await copyScenarioProject("0203");
  copies.push(copy);
  const store = `{ repository: ${JSON.stringify(repository)}${deleteCommand ? `, deleteCommand: ${JSON.stringify(deleteCommand)}` : ""} }`;
  await Bun.write(
    `${copy.dir}/.thunderjar/thunderjar.config.ts`,
    `import { declareConfig, sqliteStore } from "thunderjar";\n\nexport default declareConfig({\n  imageStore: ${store},\n  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),\n});\n`,
  );
  const db = new Database(`${copy.dir}/.thunderjar/.data/runs.sqlite`, { strict: true });
  db.query("UPDATE container_runs SET record = json_set(record, '$.postrunImage', $repository || ':postrun-' || permutation || '-' || iteration) WHERE execution_id = $id").run({
    repository,
    id: TWO_HARNESSES,
  });
  db.close();
  return copy;
}

const purge = (copy: ProjectCopy, registry: Registry, args: string[]) =>
  thunderjar(copy.dir, ["purge", "image", TWO_HARNESSES, "--yes", "--image-prefix", PREFIX, ...args], { docker: "real", env: { DOCKER_CONFIG: registry.dockerConfig } });

/** The status of `reference`'s manifest in its registry: 200 if it's there, 404 if not. */
const manifestStatus = async (reference: string) => {
  const colon = reference.lastIndexOf(":");
  const [host, ...name] = reference.slice(0, colon).split("/");
  const response = await fetch(`http://${host}/v2/${name.join("/")}/manifests/${reference.slice(colon + 1)}`, {
    method: "HEAD",
    headers: {
      Accept: [
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.docker.distribution.manifest.v2+json",
      ].join(", "),
    },
  });
  return response.status;
};

const localTags = async (repository: string) => (await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} ${repository}`.text()).split("\n").filter(Boolean).sort();

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("purge image, against real Docker and a throwaway registry", () => {
  beforeAll(async () => {
    const context = `${TMP_DIR}/${PREFIX}-context`;
    await Bun.write(`${context}/Dockerfile`, `FROM scratch\nCOPY marker /marker\n`);
    await Bun.write(`${context}/marker`, `${RUN}\n`);
    await $`docker build --quiet -t ${BASE_IMAGE} ${context}`.quiet();
    await $`rm -rf ${context}`.quiet();
  });

  afterAll(async () => {
    for (const { name, dockerConfig } of registries) {
      await $`docker rm --force ${name}`.quiet().nothrow();
      await $`rm -rf ${dockerConfig}`.quiet();
    }
    const images = [...pushed, BASE_IMAGE];
    await $`docker image rm ${images}`.quiet().nothrow();
    for (const copy of copies) await copy.remove();
  });

  test("deletes the postrun images from the registry, through its API, and their tags from the daemon; marks the runs purged from both", async () => {
    const registry = await startRegistry(true);
    const repository = await pushRuns(registry);
    const copy = await project(repository);

    const { stdout, stderr, exitCode } = await purge(copy, registry, ["--reason", "test"]);

    expect(stderr).toBe("");
    expect(stdout).toEndWith("Purged 2 postrun images.\n");
    expect(exitCode).toBe(0);
    expect(await manifestStatus(`${repository}:postrun-1-1`)).toBe(404);
    expect(await manifestStatus(`${repository}:postrun-2-1`)).toBe(404);
    expect(await localTags(repository)).toEqual([]);
    expect((await sqliteStore(`${copy.dir}/.thunderjar/.data/runs.sqlite`).containerRunsOf(TWO_HARNESSES)).map((run) => run.postrunPurge)).toEqual(
      [1, 2].map(() => ({ purgedAt: expect.any(String), from: "both", reason: "test" })),
    );
  });

  test("a registry with deletes turned off refuses: the image store's deleteCommand is run for each image instead", async () => {
    const registry = await startRegistry(false);
    const repository = await pushRuns(registry);
    const copy = await project(repository, ["sh", "-c", 'echo "$1" >> deleted.txt', "delete-image"]);

    const { stdout, stderr, exitCode } = await purge(copy, registry, ["--from", "store", "--json"]);

    expect(stderr).toContain("Purged 2 postrun images.\n");
    expect(exitCode).toBe(0);
    expect(await Bun.file(`${copy.dir}/deleted.txt`).text()).toBe(`${repository}:postrun-1-1\n${repository}:postrun-2-1\n`);
    // The command only wrote them down: they're still there, and still tagged locally.
    expect(await manifestStatus(`${repository}:postrun-1-1`)).toBe(200);
    expect(await localTags(repository)).toEqual([`${repository}:postrun-1-1`, `${repository}:postrun-2-1`]);
    const { postrun } = JSON.parse(stdout) as { postrun: { storeOutcome: unknown; recorded: unknown }[] };
    expect(postrun.map(({ storeOutcome, recorded }) => [storeOutcome, recorded])).toEqual(
      [1, 2].map(() => [{ outcome: "deleted", by: "deleteCommand" }, { purgedAt: expect.any(String), from: "imageStore" }]),
    );
  });

  test("a registry with deletes turned off, and no deleteCommand: the images stay, and it fails", async () => {
    const registry = await startRegistry(false);
    const repository = await pushRuns(registry);
    const copy = await project(repository);

    const { stderr, exitCode } = await purge(copy, registry, ["--from", "store"]);

    expect(stderr).toStartWith(`Error: ${registry.host} refused to delete images (405 UNSUPPORTED`);
    expect(exitCode).toBe(1);
    expect(await manifestStatus(`${repository}:postrun-1-1`)).toBe(200);
    expect((await sqliteStore(`${copy.dir}/.thunderjar/.data/runs.sqlite`).containerRunsOf(TWO_HARNESSES)).map((run) => run.postrunPurge)).toEqual([undefined, undefined]);
  });
});
