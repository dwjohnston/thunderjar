import { describe, expect, test } from "bun:test";
import { copyScenarioProject, thunderjar } from "../testing/cli.ts";
import { scenario } from "../testing/scenario.ts";
import { ConfigError, findThunderjarRoot } from "./loader.ts";
import { buildOptionsProblem, checkBuildSecrets, imageStoreProblem, loadProjectConfig, registryHost, repositoryProblem, runDataStoreProblem, runtimeProblem } from "./projectConfig.ts";

describe("registryHost", () => {
  test.each([
    ["ghcr.io/acme/thunderjar-images", "ghcr.io"],
    ["localhost:5000/images", "localhost:5000"],
    ["localhost/images", "localhost"],
    ["registry.example.com:443/a/b/c", "registry.example.com:443"],
    ["acme/thunderjar-images", "docker.io"],
    ["thunderjar-images", "docker.io"],
  ])("%s is in %s", (repository, host) => {
    expect(registryHost(repository)).toBe(host);
  });
});

describe("repositoryProblem", () => {
  test.each(["ghcr.io/acme/thunderjar-images", "localhost:5000/images", "acme/images", "images", "ghcr.io/a.b/c_d/e--f"])(
    "%s is a repository",
    (repository) => {
      expect(repositoryProblem(repository)).toBeUndefined();
    },
  );

  test.each(["", "ghcr.io/acme/images:latest", "ghcr.io/Acme/images", "ghcr.io/acme//images", "ghcr.io/", "-bad.io/images", "acme/images@sha256:abc"])(
    "%p is not",
    (repository) => {
      expect(repositoryProblem(repository)).toBeString();
    },
  );
});

describe("imageStoreProblem", () => {
  test("null and { repository } are fine", () => {
    expect(imageStoreProblem(null)).toBeUndefined();
    expect(imageStoreProblem({ repository: "ghcr.io/acme/images" })).toBeUndefined();
  });

  test.each([[undefined], ["ghcr.io/acme/images"], [[]], [{}], [{ repository: 1 }]])("%p is not", (imageStore: unknown) => {
    expect(imageStoreProblem(imageStore)).toBeString();
  });
});

describe("buildOptionsProblem", () => {
  test.each([[undefined], [{}], [{ ssh: true }], [{ secrets: [] }], [{ concurrency: 4 }], [{ secrets: [{ id: "github", env: "GITHUB_TOKEN" }, { id: "npm.rc", env: "NPM_TOKEN" }], ssh: false }]])(
    "%p is build options",
    (build: unknown) => {
      expect(buildOptionsProblem(build)).toBeUndefined();
    },
  );

  test.each([
    [null, "must be { secrets: [{ id, env }], ssh: true, concurrency: 2 }, any of them left out, got null"],
    [{ ssh: "yes" }, 'ssh must be true or false, got "yes"'],
    [{ concurrency: 0 }, "concurrency must be a whole number, 1 or more, got 0"],
    [{ concurrency: 1.5 }, "concurrency must be a whole number, 1 or more, got 1.5"],
    [{ secrets: { id: "github" } }, 'secrets must be a list of { id, env }, got {"id":"github"}'],
    [{ secrets: [{ id: "git hub", env: "GITHUB_TOKEN" }] }, 'secrets: "git hub" is not a secret ID: letters, digits, ".", "_" and "-"'],
    [{ secrets: [{ id: "github", env: "GITHUB TOKEN" }] }, 'secrets: "GITHUB TOKEN", secret "github"\'s env, is not an environment variable name'],
    [{ secrets: [{ id: "github", env: "A" }, { id: "github", env: "B" }] }, 'secrets: "github" is given twice'],
  ])("%p is not: %s", (build: unknown, problem: string) => {
    expect(buildOptionsProblem(build)).toBe(problem);
  });
});

describe("checkBuildSecrets", () => {
  const build = { secrets: [{ id: "github", env: "GITHUB_TOKEN" }, { id: "npm", env: "NPM_TOKEN" }], ssh: false, concurrency: 1 };

  test("passes when every secret's variable is set", () => {
    expect(() => checkBuildSecrets(build, { GITHUB_TOKEN: "x", NPM_TOKEN: "y" })).not.toThrow();
  });

  test("names each unset or empty variable, and the secret that needs it", () => {
    expect(() => checkBuildSecrets(build, { NPM_TOKEN: "" })).toThrow(
      'Build secret "github" needs GITHUB_TOKEN, which is not set.\nBuild secret "npm" needs NPM_TOKEN, which is not set.\nExport them in the shell that runs thunderjar.',
    );
  });
});

describe("loadProjectConfig", () => {
  test("0201's imageStore is null", async () => {
    expect(await loadProjectConfig(await findThunderjarRoot(scenario("0201")))).toEqual({
      imageStore: null,
      runDataStore: { kind: "sqlite", path: "./.thunderjar/.data/runs.sqlite" },
      runtime: null,
      build: { secrets: [], ssh: false, concurrency: 1 },
      deprecations: [],
    });
  });

  test("0207's imageStore names its repository", async () => {
    expect(await loadProjectConfig(await findThunderjarRoot(scenario("0207")))).toEqual({
      imageStore: { repository: "ghcr.io/acme/thunderjar-images" },
      runtime: null,
      runDataStore: { kind: "sqlite", path: "./.thunderjar/.data/runs.sqlite" },
      build: { secrets: [], ssh: false, concurrency: 1 },
      deprecations: [],
    });
  });

  test("0210's build gives a secret and the SSH agent", async () => {
    expect((await loadProjectConfig(await findThunderjarRoot(scenario("0210")))).build).toEqual({
      secrets: [{ id: "github", env: "GITHUB_TOKEN" }],
      ssh: true,
      concurrency: 1,
    });
  });

  test("a repository with a tag is a config error, so run stops before Docker is asked anything", async () => {
    await using copy = await copyScenarioProject("0207");
    await Bun.write(
      `${copy.dir}/.thunderjar/thunderjar.config.ts`,
      `import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/acme/images:latest" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`,
    );

    await expect(loadProjectConfig(`${copy.dir}/.thunderjar`)).rejects.toBeInstanceOf(ConfigError);
    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"]);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      'Error: .thunderjar/thunderjar.config.ts: imageStore: "ghcr.io/acme/images:latest" is not a Docker repository name. Expected e.g. "ghcr.io/acme/thunderjar-images", without a tag.\n',
    );
    expect(exitCode).toBe(1);
  });

  test("0211's runtime is the command containers run with", async () => {
    const env = Bun.env.THUNDERJAR_DOCKER;
    expect((await loadProjectConfig(await findThunderjarRoot(scenario("0211")))).runtime).toEqual({
      command: [env ?? "docker", "--context", "cloud"],
      concurrency: 1,
    });
  });

  test("a runtime's hooks given by their old names load by their new ones, with a deprecation for each", async () => {
    await using copy = await copyScenarioProject("0211");
    const path = `${copy.dir}/.thunderjar/thunderjar.config.ts`;
    const config = await Bun.file(path).text();
    await Bun.write(path, config.replace('"cloud"]', '"cloud"], beforeRun: ["./up.sh"], afterRun: ["./down.sh"]'));

    const { runtime, deprecations } = await loadProjectConfig(`${copy.dir}/.thunderjar`);
    expect(runtime).toMatchObject({ beforeExecution: ["./up.sh"], afterExecution: ["./down.sh"] });
    expect(runtime).not.toContainKeys(["beforeRun", "afterRun"]);
    expect(deprecations).toEqual([
      "thunderjar.config.ts: runtime.beforeRun is deprecated, rename it beforeExecution. It runs once per execution, not once per run.",
      "thunderjar.config.ts: runtime.afterRun is deprecated, rename it afterExecution. It runs once per execution, not once per run.",
    ]);
  });

  test("a runtime without an image store is a config error, so run stops before Docker is asked anything", async () => {
    await using copy = await copyScenarioProject("0207");
    await Bun.write(
      `${copy.dir}/.thunderjar/thunderjar.config.ts`,
      `import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: null,
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
  runtime: { command: ["docker", "--context", "cloud"] },
});
`,
    );

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"]);
    expect(stdout).toBe("");
    expect(stderr).toBe("Error: .thunderjar/thunderjar.config.ts: runtime: needs an imageStore: the runtime pulls the images it runs from it\n");
    expect(exitCode).toBe(1);
  });
});

describe("runtimeProblem", () => {
  const STORE = { repository: "ghcr.io/acme/images" };

  test("no runtime, or a command with an image store, is fine", () => {
    expect(runtimeProblem(undefined, null)).toBeUndefined();
    expect(runtimeProblem({ command: ["docker", "--context", "cloud"] }, STORE)).toBeUndefined();
    expect(runtimeProblem({ command: ["docker"], concurrency: 4 }, STORE)).toBeUndefined();
  });

  test("a runner is an object of env names, a registry login's variables, and run options", () => {
    expect(runtimeProblem({ command: ["docker"], runner: {} }, STORE)).toBeUndefined();
    expect(
      runtimeProblem({ command: ["docker"], runner: { env: ["EXTRA"], registryLogin: { usernameEnv: "GHCR_USER", passwordEnv: "GHCR_TOKEN" }, runOptions: ["-v", "/a:/b"] } }, STORE),
    ).toBeUndefined();
    expect(runtimeProblem({ command: ["docker"], runner: true }, STORE)).toBe("runner must be an object, e.g. {}, got true");
    expect(runtimeProblem({ command: ["docker"], runner: { env: ["NOT A NAME"] } }, STORE)).toBe('runner.env must be a list of environment variable names, got ["NOT A NAME"]');
    expect(runtimeProblem({ command: ["docker"], runner: { registryLogin: { usernameEnv: "GHCR_USER" } } }, STORE)).toBe(
      'runner.registryLogin must be { usernameEnv, passwordEnv }, each an environment variable name, got {"usernameEnv":"GHCR_USER"}',
    );
    expect(runtimeProblem({ command: ["docker"], runner: { runOptions: [""] } }, STORE)).toBe('runner.runOptions must be a list of non-empty strings, got [""]');
  });

  test.each([["beforeExecution"], ["afterExecution"], ["beforeRun"], ["afterRun"]])("%s can't be given with a runner", (hook) => {
    expect(runtimeProblem({ command: ["docker"], runner: {}, [hook]: ["./up.sh"] }, STORE)).toBe(
      `${hook} can't be given with a runner: its execution carries on after \`run\` ends, so start and stop the runtime yourself`,
    );
  });

  test.each([[0], [-1], [1.5], ["4"], [null]])("concurrency %p is not a number of containers", (concurrency) => {
    expect(runtimeProblem({ command: ["docker"], concurrency }, STORE)).toBe(`concurrency must be a whole number, 1 or more, got ${JSON.stringify(concurrency)}`);
  });

  test.each([[null], ["docker"], [{}], [{ command: [] }], [{ command: "docker" }], [{ command: ["docker", ""] }], [{ command: [1] }]])(
    "%p is not a runtime",
    (runtime) => {
      expect(runtimeProblem(runtime, STORE)).toBeString();
    },
  );

  test("beforeExecution and afterExecution are commands", () => {
    expect(runtimeProblem({ command: ["docker"], beforeExecution: ["./up.sh"], afterExecution: ["./down.sh", "now"] }, STORE)).toBeUndefined();
    expect(runtimeProblem({ command: ["docker"], beforeExecution: "./up.sh" }, STORE)).toBe(
      'beforeExecution must be a non-empty list of non-empty strings, e.g. ["./scripts/start-runtime.sh"], got "./up.sh"',
    );
    expect(runtimeProblem({ command: ["docker"], afterExecution: [] }, STORE)).toBe(
      'afterExecution must be a non-empty list of non-empty strings, e.g. ["./scripts/start-runtime.sh"], got []',
    );
  });

  test("beforeRun and afterRun, their deprecated old names, are still commands", () => {
    expect(runtimeProblem({ command: ["docker"], beforeRun: ["./up.sh"], afterRun: ["./down.sh", "now"] }, STORE)).toBeUndefined();
    expect(runtimeProblem({ command: ["docker"], afterRun: [] }, STORE)).toBe(
      'afterRun must be a non-empty list of non-empty strings, e.g. ["./scripts/start-runtime.sh"], got []',
    );
  });

  test("a hook given by both its name and its old name is an error", () => {
    expect(runtimeProblem({ command: ["docker"], beforeExecution: ["./up.sh"], beforeRun: ["./up.sh"] }, STORE)).toBe(
      "give beforeExecution or beforeRun, its old name, not both",
    );
    expect(runtimeProblem({ command: ["docker"], afterExecution: ["./down.sh"], afterRun: ["./down.sh"] }, STORE)).toBe(
      "give afterExecution or afterRun, its old name, not both",
    );
  });

  test("a runtime needs an image store", () => {
    expect(runtimeProblem({ command: ["docker"] }, null)).toBe("needs an imageStore: the runtime pulls the images it runs from it");
  });
});

describe("runDataStore", () => {
  test("a runDataStore that isn't a store is a config error", async () => {
    await using copy = await copyScenarioProject("0201");
    await Bun.write(
      `${copy.dir}/.thunderjar/thunderjar.config.ts`,
      `import { declareConfig } from "thunderjar";

export default declareConfig({
  imageStore: null,
  // @ts-expect-error: not a store
  runDataStore: "./runs.sqlite",
});
`,
    );

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["executions"]);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      'Error: .thunderjar/thunderjar.config.ts: runDataStore: must be a store, e.g. sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }) or postgresStore({ urlEnv: "THUNDERJAR_DB_URL" })\n',
    );
    expect(exitCode).toBe(1);
  });
});

describe("runDataStoreProblem", () => {
  test("a sqliteStore with a path, or a postgresStore naming a variable, is fine", () => {
    expect(runDataStoreProblem({ kind: "sqlite", path: "./runs.sqlite" })).toBeUndefined();
    expect(runDataStoreProblem({ kind: "postgres", urlEnv: "THUNDERJAR_DB_URL" })).toBeUndefined();
  });

  test.each([[undefined], ["./runs.sqlite"], [{ kind: "sqlite" }], [{ kind: "sqlite", path: "" }], [{ kind: "postgres" }], [{ kind: "postgres", urlEnv: "postgres://u:p@host/db" }], [{ kind: "mysql" }]])(
    "%p is not a store",
    (store) => {
      expect(runDataStoreProblem(store)).toBeString();
    },
  );
});
