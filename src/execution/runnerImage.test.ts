/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { findThunderjarRoot } from "../config/loader.ts";
import { copyScenarioProject } from "../testing/cli.ts";
import { runnerContext, runnerDockerfile, storedRunnerImage, thunderjarNames } from "./runnerImage.ts";

describe("the runner image", () => {
  test("its Dockerfile installs Thunderjar, links it by each name the project imports it by, and runs the runner", () => {
    expect(runnerDockerfile("src/cli/index.ts", ["thunderjar", "thunderjar-published"], "1.3.14")).toBe(`FROM docker:cli AS docker
FROM oven/bun:1.3.14
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY thunderjar/package.json /opt/thunderjar/package.json
RUN cd /opt/thunderjar && bun install --production
COPY thunderjar/ /opt/thunderjar/
COPY project/ /project/
RUN mkdir -p /project/node_modules && ln -s /opt/thunderjar /project/node_modules/thunderjar && ln -s /opt/thunderjar /project/node_modules/thunderjar-published
WORKDIR /project
ENV DOCKER_CONFIG=/run/thunderjar/docker
ENTRYPOINT ["bun", "/opt/thunderjar/src/cli/index.ts", "--log-file", "/var/log/thunderjar-runner.log", "runner", "--submission", "/run/thunderjar/submission.json"]
`);
  });

  test("a project imports Thunderjar as thunderjar, and by any alias of it in its package.json", async () => {
    await using copy = await copyScenarioProject("0211");
    await Bun.write(`${copy.dir}/package.json`, JSON.stringify({ devDependencies: { typescript: "^5" } }));
    expect(await thunderjarNames(copy.dir)).toEqual(["thunderjar"]);

    await Bun.write(`${copy.dir}/package.json`, JSON.stringify({ devDependencies: { "thunderjar-published": "npm:thunderjar@0.3.0", typescript: "^5" } }));
    expect(await thunderjarNames(copy.dir)).toEqual(["thunderjar", "thunderjar-published"]);
  });

  test("its context holds Thunderjar's source without its tests, and the project's declarations without its run data and logs", async () => {
    await using copy = await copyScenarioProject("0211");
    await Bun.write(`${copy.dir}/.thunderjar/.data/runs.sqlite`, "data");
    await Bun.write(`${copy.dir}/.thunderjar/logs/run.log`, "log");
    const root = await findThunderjarRoot(copy.dir);

    const { files, hash } = await runnerContext(root);

    const paths = files.map(({ path }) => path);
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain("thunderjar/package.json");
    expect(paths).toContain("thunderjar/src/cli/index.ts");
    expect(paths).toContain("thunderjar/src/api/index.ts");
    expect(paths).toContain("project/.thunderjar/thunderjar.config.ts");
    expect(paths).toContain("project/.thunderjar/test-cases/example.ts");
    expect(paths.filter((path) => /^thunderjar\/.*\.test\.ts$|src\/gauntlet\/|\.data\/|\/logs\//.test(path))).toEqual([]);
    expect(storedRunnerImage("ghcr.io/acme/images", hash)).toBe(`ghcr.io/acme/images:runner-h${hash.slice(0, 8)}`);

    // The same contents, the same image: run data and logs don't change it. A declaration does.
    await Bun.write(`${copy.dir}/.thunderjar/logs/another.log`, "log");
    expect((await runnerContext(root)).hash).toBe(hash);
    await Bun.write(`${copy.dir}/.thunderjar/test-cases/example.ts`, `${await Bun.file(`${copy.dir}/.thunderjar/test-cases/example.ts`).text()}\n// changed\n`);
    expect((await runnerContext(root)).hash).not.toBe(hash);
  });
});
