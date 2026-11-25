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

    test("copyDir copies a folder's contents, dotfiles and what symlinks point to, into a folder it makes", async () => {
        const root = await dir;
        await fs.write(`${root}/c/from/a.txt`, "a");
        await fs.write(`${root}/c/from/sub/.hidden`, "h");
        await fs.write(`${root}/c/elsewhere/target.txt`, "linked");
        await $`ln -s ${root}/c/elsewhere/target.txt ${root}/c/from/link.txt`.quiet();

        await fs.copyDir(`${root}/c/from`, `${root}/c/to/deep`);

        expect(fs.glob("**", { cwd: `${root}/c/to/deep`, dot: true })).toEqual(["a.txt", "link.txt", "sub/.hidden"]);
        expect(await fs.readText(`${root}/c/to/deep/link.txt`)).toBe("linked");
        expect((await $`test -L ${root}/c/to/deep/link.txt`.nothrow().quiet()).exitCode).toBe(1);
    });

    test("copyDir adds to a folder that's already there, replacing files of the same name", async () => {
        const root = await dir;
        await fs.write(`${root}/m/from/a.txt`, "new");
        await fs.write(`${root}/m/to/a.txt`, "old");
        await fs.write(`${root}/m/to/b.txt`, "kept");

        await fs.copyDir(`${root}/m/from`, `${root}/m/to`);

        expect([await fs.readText(`${root}/m/to/a.txt`), await fs.readText(`${root}/m/to/b.txt`)]).toEqual(["new", "kept"]);
    });

    test("copyDir from a missing folder does nothing, not even making the folder", async () => {
        const root = await dir;

        await fs.copyDir(`${root}/nowhere`, `${root}/untouched`);

        expect(await fs.isDirectory(`${root}/untouched`)).toBe(false);
    });

    test("removeDir deletes a folder and everything in it, and a missing one is fine", async () => {
        const root = await dir;
        await fs.write(`${root}/r/a/b.txt`, "b");
        await fs.write(`${root}/r-sibling/kept.txt`, "kept");

        await fs.removeDir(`${root}/r`);
        await fs.removeDir(`${root}/never-there`);

        expect([await fs.isDirectory(`${root}/r`), await fs.exists(`${root}/r-sibling/kept.txt`)]).toEqual([false, true]);
    });
});
