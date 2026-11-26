/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLhzk1BgPsDT4k7aD6J
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { describe, expect, test } from "bun:test";
import { filesRead, resolvePath, shellReads } from "./fileRead.ts";

describe(resolvePath, () => {
  test("resolves a relative path from the folder, and . and ..", () => {
    expect(resolvePath("/home", "recipes/soup.txt")).toBe("/home/recipes/soup.txt");
    expect(resolvePath("/home/recipes", "../shopping/./list.txt")).toBe("/home/shopping/list.txt");
    expect(resolvePath("/home", "/etc/hosts")).toBe("/etc/hosts");
    expect(resolvePath("/home", "~/notes.txt")).toBeUndefined();
  });
});

describe(shellReads, () => {
  test("is each file a reader is given, not its flags", () => {
    expect(shellReads("cat list.txt", "/home")).toEqual(["/home/list.txt"]);
    expect(shellReads("head -n 5 list.txt", "/home")).toEqual(["/home/5", "/home/list.txt"]);
    expect(shellReads("grep -n milk /home/list.txt", "/tmp")).toEqual(["/tmp/milk", "/home/list.txt"]);
  });

  test("reads each part of a pipeline or a list of commands", () => {
    expect(shellReads("ls && cat a.txt | sort; tail b.txt", "/home")).toEqual(["/home/a.txt", "/home/b.txt"]);
  });

  test("follows a cd, and unwraps a command handed to a shell with -c", () => {
    expect(shellReads("cd recipes && cat soup.txt", "/home")).toEqual(["/home/recipes/soup.txt"]);
    expect(shellReads(`/bin/bash -lc "cd recipes && sed -n '1,20p' soup.txt"`, "/home")).toEqual(["/home/recipes/1,20p", "/home/recipes/soup.txt"]);
  });

  test("counts a file redirected in, but not one written to", () => {
    expect(shellReads("wc -l < list.txt", "/home")).toEqual(["/home/list.txt"]);
    expect(shellReads("cat a.txt > b.txt", "/home")).toEqual(["/home/a.txt"]);
    expect(shellReads("echo hi >> b.txt", "/home")).toEqual([]);
  });

  test("doesn't count what no reader is given, a glob, or a variable", () => {
    expect(shellReads("ls list.txt", "/home")).toEqual([]);
    expect(shellReads("cat *.txt", "/home")).toEqual([]);
    expect(shellReads("cat $FILE", "/home")).toEqual([]);
    expect(shellReads(`python3 -c "print(open('list.txt').read())"`, "/home")).toEqual([]);
  });
});

describe(filesRead, () => {
  test("is the paths of read and search calls, and what shell calls read, in the folder each ran in", () => {
    expect(
      filesRead(
        [
          { tool: "open", kind: "read", paths: ["list.txt"] },
          { tool: "find", kind: "search", paths: ["/home/recipes/soup.txt"] },
          { tool: "run", kind: "shell", paths: [], command: "cat a.txt" },
          { tool: "run", kind: "shell", paths: [], command: "cat b.txt", cwd: "recipes" },
          { tool: "save", kind: "edit", paths: ["c.txt"] },
        ],
        "/home",
      ),
    ).toEqual(["/home/list.txt", "/home/recipes/soup.txt", "/home/a.txt", "/home/recipes/b.txt"]);
  });
});
