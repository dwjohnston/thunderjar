import { describe, expect, test } from "bun:test";
import type { Env } from "./Env";
import { FakeEnv } from "./FakeEnv";

/** Says where it's running and who for, as a command's banner might. */
function greeting(env: Env): string {
    const user = env.variables.USER ?? "stranger";
    return `Hello ${user}, you're in ${env.cwd}`;
}

describe(greeting, () => {
    test("A test sets only the variables it cares about", () => {
        const env = FakeEnv({ cwd: "/projects/demo", variables: { USER: "ada" } });

        expect(greeting(env)).toBe("Hello ada, you're in /projects/demo");
    });

    test("Variables the test doesn't set are unset, not taken from the machine", () => {
        expect(greeting(FakeEnv())).toBe("Hello stranger, you're in /fake/cwd");
    });
});
