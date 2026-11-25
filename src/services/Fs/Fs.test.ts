import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { createFsService } from "./Fs";

describe(createFsService, () => {
    const fs = createFsService();
    const dir = $`mktemp -d`.text().then((out) => out.trim());
    afterAll(async () => void (await $`rm -rf ${await dir}`.quiet()));

    test("It writes, reads, and deletes files on disk, making missing folders", async () => {
        const root = await dir;
        await fs.write(`${root}/a/b/note.txt`, "hello");
        await fs.write(`${root}/a/bytes.bin`, new Uint8Array([1, 2, 3]));

        expect(await fs.readText(`${root}/a/b/note.txt`)).toBe("hello");
        expect([...(await fs.readBytes(`${root}/a/bytes.bin`))]).toEqual([1, 2, 3]);
        expect([await fs.exists(`${root}/a/b/note.txt`), await fs.isDirectory(`${root}/a/b`), await fs.isDirectory(`${root}/a/b/note.txt`)]).toEqual([true, true, false]);

        await fs.remove(`${root}/a/b/note.txt`);
        expect([await fs.exists(`${root}/a/b/note.txt`), await fs.exists(`${root}/a/b`)]).toEqual([false, false]);
    });

    test("mkdir makes a folder and its parents, and glob lists matches sorted, relative to cwd", async () => {
        const root = await dir;
        await fs.mkdir(`${root}/g/empty/deep`);
        await fs.write(`${root}/g/z.ts`, "");
        await fs.write(`${root}/g/sub/y.ts`, "");
        await fs.write(`${root}/g/.hidden.ts`, "");

        expect(await fs.isDirectory(`${root}/g/empty/deep`)).toBe(true);
        expect(fs.glob("**/*.ts", { cwd: `${root}/g` })).toEqual(["sub/y.ts", "z.ts"]);
        expect(fs.glob("**/*.ts", { cwd: `${root}/g`, dot: true })).toEqual([".hidden.ts", "sub/y.ts", "z.ts"]);
        expect(fs.glob("*", { cwd: `${root}/g`, onlyFiles: false })).toEqual(["empty", "sub", "z.ts"]);
    });

    test("Reading a missing file rejects", async () => {
        await expect(fs.readText(`${await dir}/missing`)).rejects.toThrow();
    });
});
