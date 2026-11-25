import { describe, expect, test } from "bun:test";
import { createEnvService, readEnv } from "./Env";

describe(createEnvService, () => {
    test("It is this process's folder and variables, copied, so changing them later doesn't change it", () => {
        const env = createEnvService();

        expect(env.cwd).toBe(process.cwd());
        expect(env.variables.PATH).toBe(Bun.env.PATH);
        expect(env.variables).not.toBe(Bun.env);
    });
});

describe(readEnv, () => {
    test("With nothing set: no concurrency, a backlog cap of 4, and /tmp", () => {
        const env = readEnv("/work", {});

        expect(env).toEqual({ cwd: "/work", variables: {}, concurrency: undefined, uploadBacklogCap: 4, tmpDir: "/tmp" });
    });

    test("It reads the settings from their variables", () => {
        const env = readEnv("/work", { THUNDERJAR_CONCURRENCY: "8", THUNDERJAR_UPLOAD_BACKLOG_CAP: "2", TMPDIR: "/var/tmp" });

        expect([env.concurrency, env.uploadBacklogCap, env.tmpDir]).toEqual([8, 2, "/var/tmp"]);
    });

    test.each(["0", "-1", "1.5", "many", "", "3 "])("A concurrency of %p isn't a whole number from 1, so there is none", (value) => {
        expect(readEnv("/work", { THUNDERJAR_CONCURRENCY: value }).concurrency).toBeUndefined();
    });

    test.each(["-1", "1.5", "lots", ""])("A backlog cap of %p isn't a whole number, so it's the default", (value) => {
        expect(readEnv("/work", { THUNDERJAR_UPLOAD_BACKLOG_CAP: value }).uploadBacklogCap).toBe(4);
    });

    test("A backlog cap of 0 is kept: runs wait for every upload", () => {
        expect(readEnv("/work", { THUNDERJAR_UPLOAD_BACKLOG_CAP: "0" }).uploadBacklogCap).toBe(0);
    });

    test("The temporary folder has no trailing slash, and an empty TMPDIR is /tmp", () => {
        expect(readEnv("/work", { TMPDIR: "/var/folders/x/T/" }).tmpDir).toBe("/var/folders/x/T");
        expect(readEnv("/work", { TMPDIR: "" }).tmpDir).toBe("/tmp");
        expect(readEnv("/work", { TMPDIR: "/" }).tmpDir).toBe("/");
    });
});
