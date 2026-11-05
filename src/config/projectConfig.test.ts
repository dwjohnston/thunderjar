import { describe, expect, test } from "bun:test";
import { copyScenarioProject, thunderjar } from "../testing/cli.ts";
import { scenario } from "../testing/scenario.ts";
import { ConfigError, findThunderjarRoot } from "./loader.ts";
import { imageStoreProblem, loadProjectConfig, registryHost, repositoryProblem } from "./projectConfig.ts";

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

describe("loadProjectConfig", () => {
  test("0201's imageStore is null", async () => {
    expect(await loadProjectConfig(await findThunderjarRoot(scenario("0201")))).toEqual({ imageStore: null });
  });

  test("0207's imageStore names its repository", async () => {
    expect(await loadProjectConfig(await findThunderjarRoot(scenario("0207")))).toEqual({
      imageStore: { repository: "ghcr.io/acme/thunderjar-images" },
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
});
