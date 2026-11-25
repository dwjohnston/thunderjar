import { describe, expect, test } from "bun:test";
import { processEnv } from "./Env";

describe(processEnv, () => {
    test("It is this process's folder and variables, copied, so changing them later doesn't change it", () => {
        const env = processEnv();

        expect(env.cwd).toBe(process.cwd());
        expect(env.variables.PATH).toBe(Bun.env.PATH);
        expect(env.variables).not.toBe(Bun.env);
    });
});
