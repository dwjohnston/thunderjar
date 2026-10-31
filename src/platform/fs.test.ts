import { afterEach, expect, test } from "bun:test";
import {
  copy,
  exists,
  existsSync,
  isDirectory,
  listDir,
  listEntries,
  makeDir,
  makeTempDir,
  move,
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
