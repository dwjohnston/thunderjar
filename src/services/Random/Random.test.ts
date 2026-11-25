import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { createRandomService } from "./Random";

describe(createRandomService, () => {
    test("Its ULIDs take their time from the clock and their rest from real randomness", () => {
        const random = createRandomService(new FakeClock(1_700_000_000_000));

        const [a, b] = [random.ulid(), random.ulid()];

        expect(a).toMatch(/^01hf7yat00[0-9a-hjkmnp-tv-z]{16}$/);
        expect(b.slice(0, 10)).toBe(a.slice(0, 10));
        expect(b).not.toBe(a);
    });

    test("Its bytes and UUIDs differ each call", () => {
        const random = createRandomService(new FakeClock());

        expect(random.bytes(16)).toHaveLength(16);
        expect(random.bytes(16)).not.toEqual(random.bytes(16));
        expect(random.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
});
