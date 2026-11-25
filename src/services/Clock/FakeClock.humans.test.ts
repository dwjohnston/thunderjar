import type { Clock } from "./Clock";
import { FakeClock } from "./FakeClock";
import { peek } from "bun";
import { describe, expect, it } from "bun:test";



async function sampleFunction(clock: Clock, numberOfLetters: number): Promise<string> {

    await clock.sleep(1000);

    return Array.from({ length: numberOfLetters }).fill('a').join('')
}


describe(sampleFunction, () => {
    it("returns a length n string after waiting 1 second", async () => {

        const clock = new FakeClock();
        const promise = sampleFunction(clock, 10);

        expect(peek.status(promise)).toBe("pending");

        await clock.advance(100);
        expect(peek.status(promise)).toBe("pending");

        await clock.advance(1000)
        expect(peek.status(promise)).toBe("fulfilled");

        const result = await promise;
        expect(result).toBe("aaaaaaaaaa")
    });
})