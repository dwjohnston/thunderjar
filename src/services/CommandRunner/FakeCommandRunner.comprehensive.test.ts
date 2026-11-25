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

import { describe, expect, test } from "bun:test";
import { FakeCommandRunner } from "./FakeCommandRunner";

describe(FakeCommandRunner, () => {
    test("Every command succeeds unless told otherwise, and each call is recorded in order", async () => {
        const commands = new FakeCommandRunner();

        const first = await commands.run(["make", "tea"], { SUGAR: "2" });
        const second = await commands.run(["wash", "up"], {});

        expect([first, second]).toEqual([{ exitCode: 0, stderr: "" }, { exitCode: 0, stderr: "" }]);
        expect(commands.calls).toEqual([
            { command: ["make", "tea"], env: { SUGAR: "2" } },
            { command: ["wash", "up"], env: {} },
        ]);
    });

    test("fail makes the commands starting with a prefix fail, and leaves the rest", async () => {
        const commands = new FakeCommandRunner();
        commands.fail(["make", "tea"], { exitCode: 2, stderr: "no milk" });

        expect(await commands.run(["make", "tea", "--strong"], {})).toEqual({ exitCode: 2, stderr: "no milk" });
        expect(await commands.run(["make", "tea"], {})).toEqual({ exitCode: 2, stderr: "no milk" });
        expect(await commands.run(["make", "toast"], {})).toEqual({ exitCode: 0, stderr: "" });
        expect(await commands.run(["make"], {})).toEqual({ exitCode: 0, stderr: "" });
    });

    test("fail fills in what isn't given: exit code 1 and no stderr", async () => {
        const commands = new FakeCommandRunner();
        commands.fail(["boil"]);

        expect(await commands.run(["boil", "kettle"], {})).toEqual({ exitCode: 1, stderr: "" });
    });

    test("The latest fail to match wins", async () => {
        const commands = new FakeCommandRunner();
        commands.fail(["make"], { exitCode: 1, stderr: "general" });
        commands.fail(["make", "tea"], { exitCode: 2, stderr: "specific" });

        expect((await commands.run(["make", "tea"], {})).stderr).toBe("specific");
        expect((await commands.run(["make", "toast"], {})).stderr).toBe("general");
    });

    test("What's recorded is a copy: changing the arguments afterwards doesn't change it", async () => {
        const commands = new FakeCommandRunner();
        const command = ["make", "tea"];
        const env = { SUGAR: "2" };

        await commands.run(command, env);
        command.push("now");
        env.SUGAR = "3";

        expect(commands.calls).toEqual([{ command: ["make", "tea"], env: { SUGAR: "2" } }]);
    });

    test("A prefix can be written as one string, as the command reads on a command line", async () => {
        const commands = new FakeCommandRunner();
        commands.fail("make tea", { exitCode: 2, stderr: "no milk" });

        expect((await commands.run(["make", "tea", "--strong"], {})).exitCode).toBe(2);
        expect((await commands.run(["make", "toast"], {})).exitCode).toBe(0);
    });
});
