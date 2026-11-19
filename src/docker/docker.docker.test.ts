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
// commitContainer against real Docker: a committed container's image holds nothing of the
// environment it ran with, and its image's own values, however awkward to quote, come back byte for
// byte. Skipped by `bun test`; run with `bun run test:docker`. Its image and containers are named
// under a throwaway prefix, and removed afterwards.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { TMP_DIR } from "../testing/cli.ts";
import { commitContainer, runContainer } from "./docker.ts";

const PREFIX = `tj-test-${crypto.randomUUID().slice(0, 8)}`;

/** Values a Dockerfile's ENV would mangle, unless quoted and escaped. */
const AWKWARD = `he said "hi" to $HOME and \${USER:-x}, 'quoted', a \\ backslash, \`ls\`, 100% and\ta tab`;

const envOf = async (image: string) => JSON.parse(await $`docker image inspect --format ${"{{json .Config.Env}}"} ${image}`.text()) as string[];

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("commitContainer, against real Docker", () => {
  afterAll(async () => {
    await $`docker rm --force ${`${PREFIX}-base`} ${`${PREFIX}-run`}`.quiet().nothrow();
    await $`docker image rm --force ${`${PREFIX}-prerun:x`} ${`${PREFIX}-postrun:x`}`.quiet().nothrow();
    await $`rm -rf ${TMP_DIR}/${PREFIX}`.quiet();
  });

  test("the postrun image holds no value the container was run with, and the prerun image's own", async () => {
    // The prerun image: busybox, with variables of its own, set awkwardly, by `docker commit`.
    await $`docker create --name ${`${PREFIX}-base`} busybox`.quiet();
    const odd = `"${AWKWARD.replace(/[\\"$]/g, (c) => `\\${c}`)}"`;
    await $`docker commit --change ${`ENV ODD=${odd} OVERRIDDEN=image-value`} ${`${PREFIX}-base`} ${`${PREFIX}-prerun:x`}`.quiet();
    await $`docker rm --force ${`${PREFIX}-base`}`.quiet();
    const prerunEnv = await envOf(`${PREFIX}-prerun:x`);
    expect(prerunEnv).toContain(`ODD=${AWKWARD}`);

    Bun.env.TJ_TEST_REQUIRED = "secret-required";
    Bun.env.TJ_TEST_FROM_FILE = "secret-from-file";
    const envFile = `${TMP_DIR}/${PREFIX}/env`;
    await Bun.write(envFile, "TJ_TEST_FROM_FILE\nTJ_TEST_FILE_VALUE=secret-file-value\n");
    try {
      await runContainer(`${PREFIX}-prerun:x`, `${PREFIX}-run`, 'test "$TJ_TEST_REQUIRED" = secret-required && test "$OVERRIDDEN" = secret-override', {
        env: ["TJ_TEST_REQUIRED"],
        runOptions: ["-e", "TJ_TEST_OPTION=secret-option", "--env", "OVERRIDDEN=secret-override", "--env-file", envFile, "-e", `ODD=secret-odd`],
      });
    } finally {
      delete Bun.env.TJ_TEST_REQUIRED;
      delete Bun.env.TJ_TEST_FROM_FILE;
    }
    // Docker would otherwise have saved every value the container was given.
    expect((await $`docker container inspect --format ${"{{json .Config.Env}}"} ${`${PREFIX}-run`}`.text())).toContain("secret");

    await commitContainer(`${PREFIX}-run`, `${PREFIX}-postrun:x`, `${PREFIX}-prerun:x`);

    const postrunEnv = await envOf(`${PREFIX}-postrun:x`);
    expect(JSON.stringify(postrunEnv)).not.toContain("secret");
    expect(postrunEnv.toSorted()).toEqual(
      [...prerunEnv, "TJ_TEST_REQUIRED=", "TJ_TEST_OPTION=", "TJ_TEST_FROM_FILE=", "TJ_TEST_FILE_VALUE="].toSorted(),
    );
    // And a container from it sees the prerun image's values, byte for byte.
    expect(await $`docker run --rm ${`${PREFIX}-postrun:x`} sh -c ${'printf %s "$ODD"'}`.text()).toBe(AWKWARD);
  }, 600_000);
});
