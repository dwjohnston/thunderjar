import type { Fs } from "./Fs";
import { FakeFs } from "./FakeFs";
import { describe, expect, it } from "bun:test";

async function readTodo(fs: Fs, path: string): Promise<string> {
    return fs.readText(path);
}

describe(readTodo, () => {
    it("reads the todo list", async () => {
        const fs = new FakeFs({ "/todo.txt": "buy milk" });

        expect(await readTodo(fs, "/todo.txt")).toBe("buy milk");
    });
});
