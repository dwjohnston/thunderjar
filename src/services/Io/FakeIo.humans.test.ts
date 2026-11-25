import { describe, expect, test } from "bun:test";
import type { Io } from "./Io";
import { FakeIo } from "./FakeIo";
import type { Clock } from "../Clock/Clock";
import { FakeClock } from "../Clock/FakeClock";

/** Asks before deleting, as `purge` does, and says so if it's stopped while it waits. */
async function askToDelete(io: Io, what: string): Promise<boolean> {
    const stopListening = io.onStop((signal) => io.stderr.write(`Stopped (${signal})\n`));
    io.stdout.write(`Delete ${what}? [y/N] `);
    const answer = await io.stdin.readLine();
    stopListening();
    return /^y(es)?$/i.test(answer?.trim() ?? "");
}

describe(askToDelete, () => {
    test("A test answers the question by typing", async () => {
        const io = new FakeIo();

        const deleting = askToDelete(io, "3 images");
        io.stdin.type("y\n");

        expect(await deleting).toBe(true);
        expect(io.stdout.text()).toBe("Delete 3 images? [y/N] ");
    });

    test("Ctrl-C while it waits", async () => {
        const io = new FakeIo({ stdout: "terminal", columns: 120 });

        const deleting = askToDelete(io, "3 images");
        io.interrupt();
        io.stdin.end();

        expect(await deleting).toBe(false);
        expect(io.stderr.text()).toBe("Stopped (SIGINT)\n");
    });
});

/** Prints a line, waits a second, then prints another. */
async function greetSlowly(io: Io, clock: Clock): Promise<void> {
    io.stdout.write("Hello\n");
    await clock.sleep(1000);
    io.stdout.write("Goodbye\n");
}

describe(greetSlowly, () => {
    test("The second line comes a second after the first", async () => {
        const io = new FakeIo();
        const clock = new FakeClock();

        const greeting = greetSlowly(io, clock);
        expect(io.stdout.text()).toBe("Hello\n");

        await clock.advance(999);
        expect(io.stdout.text()).toBe("Hello\n");

        await clock.advance(1);
        await greeting;
        expect(io.stdout.text()).toBe("Hello\nGoodbye\n");
    });
});
