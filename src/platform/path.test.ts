import { expect, test } from "bun:test";
import { basename, dirname, extname, join, normalize, relative, resolve } from "./path.ts";

test("join and normalize resolve . and .., and keep a trailing slash", () => {
  expect(join("a", "b", "../c", "./d")).toBe("a/c/d");
  expect(join("/a/", "/b")).toBe("/a/b");
  expect(join("", "")).toBe(".");
  expect(join("a", "..")).toBe(".");
  expect(join("..", "a")).toBe("../a");
  expect(join("a/")).toBe("a/");
  expect(normalize("/../a")).toBe("/a");
  expect(normalize("a//b/./")).toBe("a/b/");
});

test("resolve works right to left from the current directory", () => {
  expect(resolve("/a", "b", "../c")).toBe("/a/c");
  expect(resolve("/a", "/b", "c/")).toBe("/b/c");
  expect(resolve("x")).toBe(`${process.cwd()}/x`);
  expect(resolve("/")).toBe("/");
});

test("relative", () => {
  expect(relative("/a/b/c", "/a/d")).toBe("../../d");
  expect(relative("/a", "/a/b/c")).toBe("b/c");
  expect(relative("/a", "/a")).toBe("");
});

test("dirname, basename and extname", () => {
  expect(dirname("/a/b/c.ts")).toBe("/a/b");
  expect(dirname("/a/b/")).toBe("/a");
  expect(dirname("/a")).toBe("/");
  expect(dirname("a")).toBe(".");
  expect(basename("/a/b/c.ts")).toBe("c.ts");
  expect(basename("/a/b/c.ts", ".ts")).toBe("c");
  expect(basename("/a/b/")).toBe("b");
  expect(extname("c.test.ts")).toBe(".ts");
  expect(extname(".hidden")).toBe("");
});
