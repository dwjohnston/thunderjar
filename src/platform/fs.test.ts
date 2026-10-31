import { afterEach, expect, test } from "bun:test";
import {
  appendTextSync,
  copy,
  exists,
  existsSync,
  isDirectory,
  listDir,
  listEntries,
  listFilesSync,
  makeDir,
  makeTempDir,
  move,
  readBytesSync,
  readTextSync,
  remove,
  symlink,
  tmpdir,
} from "./fs.ts";

let dir = "";
afterEach(() => remove(dir));

test("makeTempDir makes a new directory under tmpdir()", async () => {
  dir = await makeTempDir("thunderjar-fs-test-");
  expect(dir.startsWith(`${tmpdir()}/thunderjar-fs-test-`)).toBe(true);
  expect(await isDirectory(dir)).toBe(true);
  expect(listDir(dir)).toEqual([]);
});

test("copy copies a directory to the destination, keeping hidden files and symlinks", async () => {
  dir = await makeTempDir("thunderjar-fs-test-");
  await Bun.write(`${dir}/from/.hidden`, "h");
  await Bun.write(`${dir}/from/sub/file.txt`, "f");
  await symlink("sub/file.txt", `${dir}/from/link`);
  await copy(`${dir}/from`, `${dir}/to`);
  expect(listDir(`${dir}/to`, { recursive: true })).toEqual([".hidden", "link", "sub", "sub/file.txt"]);
  expect(listEntries(`${dir}/to`)).toEqual([
    { path: ".hidden", isDirectory: false },
    { path: "link", isDirectory: false },
    { path: "sub", isDirectory: true },
  ]);
  expect(readTextSync(`${dir}/to/link`)).toBe("f");
});

test("move, remove, exists and makeDir", async () => {
  dir = await makeTempDir("thunderjar-fs-test-");
  await makeDir(`${dir}/a/b`);
  await Bun.write(`${dir}/a/b/x`, "x");
  await move(`${dir}/a/b/x`, `${dir}/a/y`);
  expect(existsSync(`${dir}/a/b/x`)).toBe(false);
  expect(await exists(`${dir}/a/y`)).toBe(true);
  await remove(`${dir}/a`);
  expect(await exists(`${dir}/a`)).toBe(false);
  await remove(`${dir}/never-existed`);
});

test("readTextSync throws for a missing file", () => {
  expect(() => readTextSync("/no/such/file")).toThrow("can't read /no/such/file");
});

test("readBytesSync reads bytes as they are, empty files included", async () => {
  dir = await makeTempDir("thunderjar-fs-test-");
  await Bun.write(`${dir}/bin`, new Uint8Array([0, 255, 128, 10]));
  await Bun.write(`${dir}/empty`, "");
  expect(readBytesSync(`${dir}/bin`)).toEqual(new Uint8Array([0, 255, 128, 10]));
  expect(readBytesSync(`${dir}/empty`)).toEqual(new Uint8Array());
  expect(() => readBytesSync(`${dir}/missing`)).toThrow("can't read");
});

test("listFilesSync lists regular files recursively, sorted, without symlinks or directories", async () => {
  dir = await makeTempDir("thunderjar-fs-test-");
  await Bun.write(`${dir}/b.txt`, "b");
  await Bun.write(`${dir}/.hidden/x`, "x");
  await Bun.write(`${dir}/a/z/deep.txt`, "d");
  await makeDir(`${dir}/emptyDir`);
  await symlink("b.txt", `${dir}/link`);
  await symlink("a", `${dir}/dirLink`);
  expect(listFilesSync(dir)).toEqual([".hidden/x", "a/z/deep.txt", "b.txt"]);
  expect(() => listFilesSync(`${dir}/missing`)).toThrow("not a directory");
});

test("appendTextSync appends to a file, creating it if it's missing", async () => {
  dir = await makeTempDir("thunderjar-fs-test-");
  appendTextSync(`${dir}/log`, "one\t$HOME\n");
  appendTextSync(`${dir}/log`, "-n two\n");
  expect(await Bun.file(`${dir}/log`).text()).toBe("one\t$HOME\n-n two\n");
  expect(() => appendTextSync(`${dir}/missing/log`, "x")).toThrow("can't append");
});
