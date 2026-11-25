/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { FakeEnv } from "../Env/FakeEnv";
import { createCommandRunnerService } from "./CommandRunner";

describe(createCommandRunnerService, () => {
    const dir = $`mktemp -d`.text().then((out) => out.trim());
    afterAll(async () => void (await $`rm -rf ${await dir}`.quiet()));
    const PATH = Bun.env.PATH;

    test("It runs the command and gives its exit code and what it wrote to stderr", async () => {
        const commands = createCommandRunnerService(FakeEnv({ variables: { PATH } }));

        expect(await commands.run(["sh", "-c", "echo out; echo oops >&2; exit 3"], {})).toEqual({ exitCode: 3, stderr: "oops\n" });
        expect(await commands.run(["true"], {})).toEqual({ exitCode: 0, stderr: "" });
    });

    test("The command sees the service's variables and the ones given, which win; not this process's", async () => {
        const out = `${await dir}/seen.txt`;
        const commands = createCommandRunnerService(FakeEnv({ variables: { PATH, GREETING: "hello", NAME: "nobody" } }));
        Bun.env.COMMAND_RUNNER_TEST_LEAK = "leaked";

        const result = await commands.run(["sh", "-c", 'echo "$GREETING $NAME ${COMMAND_RUNNER_TEST_LEAK:-unset}" > "$0"', out], { NAME: "ada" });
        delete Bun.env.COMMAND_RUNNER_TEST_LEAK;

        expect(result.exitCode).toBe(0);
        expect(await Bun.file(out).text()).toBe("hello ada unset\n");
    });

    test("A command that can't be started is exit code 127, with the reason", async () => {
        const commands = createCommandRunnerService(FakeEnv({ variables: { PATH } }));

        const result = await commands.run(["/no/such/command-here"], {});

        expect(result.exitCode).toBe(127);
        expect(result.stderr).not.toBe("");
        expect(await commands.run([], {})).toEqual({ exitCode: 127, stderr: "no command given" });
    });
});
