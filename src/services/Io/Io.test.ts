import { describe, expect, test } from "bun:test";
import { lineReader, createIoService } from "./Io";

describe("createIoService", () => {
    test("onStop calls the handler for SIGINT and SIGTERM until it stops listening", () => {
        const io = createIoService();
        const signals: string[] = [];
        const stopListening = io.onStop((signal) => signals.push(signal));

        process.emit("SIGINT");
        process.emit("SIGTERM");
        stopListening();
        process.emit("SIGINT");

        expect(signals).toEqual(["SIGINT", "SIGTERM"]);
    });

    test("Its outputs say whether they're terminals, and how wide only if they are", () => {
        const { stdout, stderr } = createIoService();

        expect(stdout.isTTY).toBe(process.stdout.isTTY === true);
        expect(stderr.columns).toBe(process.stderr.isTTY ? process.stderr.columns : undefined);
    });
});

describe(lineReader, () => {
    test("It splits chunks into lines, across chunk boundaries, and readAll takes the rest", async () => {
        const chunks = ["a\nb", "c\nd", "e"];
        const reader = lineReader(async () => chunks.shift() ?? null);

        expect(await reader.readLine()).toBe("a");
        expect(await reader.readLine()).toBe("bc");
        expect(await reader.readAll()).toBe("de");
        expect(await reader.readLine()).toBeNull();
    });
});
