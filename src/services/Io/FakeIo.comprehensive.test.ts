import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { FakeIo } from "./FakeIo";

describe(FakeIo, () => {
    test("Its streams are pipes by default, and terminals of the given width when asked", () => {
        const piped = new FakeIo();
        const terminal = new FakeIo({ stdout: "terminal", stdin: "terminal", columns: 120 });

        expect([piped.stdout.isTTY, piped.stdout.columns, piped.stderr.isTTY, piped.stdin.isTTY]).toEqual([false, undefined, false, false]);
        expect([terminal.stdout.isTTY, terminal.stdout.columns, terminal.stderr.isTTY, terminal.stdin.isTTY]).toEqual([true, 120, false, true]);
        expect(new FakeIo({ stderr: "terminal" }).stderr.columns).toBe(80);
    });

    test("Each output keeps what's written to it, as written", () => {
        const io = new FakeIo();

        io.stdout.write("one ");
        io.stdout.write("two\n");
        io.stderr.write("oops\n");

        expect(io.stdout.text()).toBe("one two\n");
        expect(io.stderr.text()).toBe("oops\n");
    });

    test("readLine waits for a whole line, and gives what's typed one line at a time", async () => {
        const io = new FakeIo();

        const first = io.stdin.readLine();
        io.stdin.type("ye");
        await Bun.sleep(0);
        expect(peek.status(first)).toBe("pending");

        io.stdin.type("s\nno\n");
        expect(await first).toBe("yes");
        expect(await io.stdin.readLine()).toBe("no");
    });

    test("Once stdin ends, readLine gives the last part line, then null", async () => {
        const io = new FakeIo();

        io.stdin.type("last");
        io.stdin.end();

        expect(await io.stdin.readLine()).toBe("last");
        expect(await io.stdin.readLine()).toBeNull();
    });

    test("readAll gives everything typed, once stdin ends", async () => {
        const io = new FakeIo();

        const all = io.stdin.readAll();
        io.stdin.type("a\n");
        io.stdin.type("b\n");
        await Bun.sleep(0);
        expect(peek.status(all)).toBe("pending");

        io.stdin.end();
        expect(await all).toBe("a\nb\n");
    });

    test("interrupt and terminate call each onStop handler until it stops listening", () => {
        const io = new FakeIo();
        const signals: string[] = [];
        const stopListening = io.onStop((signal) => signals.push(`first ${signal}`));
        io.onStop((signal) => signals.push(`second ${signal}`));

        io.interrupt();
        stopListening();
        io.terminate();

        expect(signals).toEqual(["first SIGINT", "second SIGINT", "second SIGTERM"]);
    });
});
