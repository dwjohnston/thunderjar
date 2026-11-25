import { describe, expect, test } from "bun:test";
import { FakeFs } from "./FakeFs";

describe(FakeFs, () => {
    test("It starts with the files it's given, and their folders exist", async () => {
        const fs = new FakeFs({ "/p/.thunderjar/test-cases/a.ts": "export default 1" });

        expect(await fs.readText("/p/.thunderjar/test-cases/a.ts")).toBe("export default 1");
        expect([await fs.isDirectory("/p/.thunderjar"), await fs.isDirectory("/p/.thunderjar/test-cases/a.ts"), await fs.exists("/p/.thunderjar")]).toEqual([true, false, false]);
    });

    test("write keeps text and bytes, replacing what was there", async () => {
        const fs = new FakeFs({ "/a.txt": "old" });

        await fs.write("/a.txt", "new");
        await fs.write("/b.bin", new Uint8Array([1, 2]));

        expect(await fs.readText("/a.txt")).toBe("new");
        expect([...(await fs.readBytes("/b.bin"))]).toEqual([1, 2]);
        expect(await fs.readText("/b.bin")).toBe("\u0001\u0002");
    });

    test("Paths are normalised: double slashes, ./ and trailing slashes", async () => {
        const fs = new FakeFs({ "/p//x/./y.txt": "y" });

        expect(await fs.readText("/p/x/y.txt")).toBe("y");
        expect(await fs.isDirectory("/p/x/")).toBe(true);
    });

    test("Reading a missing file, or a folder, rejects", async () => {
        const fs = new FakeFs({ "/d/f": "" });

        await expect(fs.readText("/nope")).rejects.toThrow("no such file: /nope");
        await expect(fs.readBytes("/d")).rejects.toThrow("no such file: /d");
    });

    test("mkdir makes empty folders, and remove deletes a file but leaves mkdir's folders", async () => {
        const fs = new FakeFs({ "/d/f": "" });

        await fs.mkdir("/e/deep");
        await fs.remove("/d/f");
        await fs.remove("/never");

        expect([await fs.isDirectory("/e"), await fs.isDirectory("/e/deep"), await fs.exists("/d/f"), await fs.isDirectory("/d")]).toEqual([true, true, false, false]);
    });

    test("glob matches under cwd, sorted, skipping dotfiles unless asked, and folders only when asked", async () => {
        const fs = new FakeFs({ "/r/z.ts": "", "/r/sub/y.ts": "", "/r/.hidden.ts": "", "/other/x.ts": "" });
        await fs.mkdir("/r/empty");

        expect(fs.glob("**/*.ts", { cwd: "/r" })).toEqual(["sub/y.ts", "z.ts"]);
        expect(fs.glob("**/*.ts", { cwd: "/r", dot: true })).toEqual([".hidden.ts", "sub/y.ts", "z.ts"]);
        expect(fs.glob("*", { cwd: "/r", onlyFiles: false })).toEqual(["empty", "sub", "z.ts"]);
        expect(fs.glob("**", { cwd: "/missing" })).toEqual([]);
    });

    test("files() shows what's on disk, for asserting on what was written", async () => {
        const fs = new FakeFs({ "/a": "1" });

        await fs.write("/logs/run.log", "done");

        expect(fs.files()).toEqual({ "/a": "1", "/logs/run.log": "done" });
    });

    test("copyDir copies a folder's contents, and its empty folders, into a folder it makes", async () => {
        const fs = new FakeFs({ "/from/a.txt": "a", "/from/sub/.hidden": "h", "/from-other/x": "x" });
        await fs.mkdir("/from/empty");

        await fs.copyDir("/from", "/to/deep");

        expect(fs.files()).toEqual({ "/from-other/x": "x", "/from/a.txt": "a", "/from/sub/.hidden": "h", "/to/deep/a.txt": "a", "/to/deep/sub/.hidden": "h" });
        expect(await fs.isDirectory("/to/deep/empty")).toBe(true);
    });

    test("copyDir of an empty folder still makes the destination, and adds to one that's there", async () => {
        const fs = new FakeFs({ "/to/b.txt": "kept", "/to/a.txt": "old", "/from/a.txt": "new" });
        await fs.mkdir("/nothing");

        await fs.copyDir("/nothing", "/made");
        await fs.copyDir("/from", "/to");

        expect(await fs.isDirectory("/made")).toBe(true);
        expect([await fs.readText("/to/a.txt"), await fs.readText("/to/b.txt")]).toEqual(["new", "kept"]);
    });

    test("copyDir from a missing folder does nothing, not even making the folder", async () => {
        const fs = new FakeFs();

        await fs.copyDir("/nowhere", "/untouched");

        expect(await fs.isDirectory("/untouched")).toBe(false);
    });

    test("A copy is its own: changing it leaves the original alone", async () => {
        const fs = new FakeFs({ "/from/a.txt": "a" });

        await fs.copyDir("/from", "/to");
        await fs.write("/to/a.txt", "changed");

        expect(await fs.readText("/from/a.txt")).toBe("a");
    });

    test("removeDir deletes a folder, its files and its folders, and a missing one is fine", async () => {
        const fs = new FakeFs({ "/r/a/b.txt": "b", "/r-sibling/kept.txt": "kept" });
        await fs.mkdir("/r/empty");

        await fs.removeDir("/r");
        await fs.removeDir("/never-there");

        expect(fs.files()).toEqual({ "/r-sibling/kept.txt": "kept" });
        expect([await fs.isDirectory("/r"), await fs.isDirectory("/r/empty")]).toEqual([false, false]);
    });
});
