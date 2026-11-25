import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import type { Random } from "./Random";
import { FakeRandom } from "./FakeRandom";

/** Names an execution of a test case, as `run` might. */
function getRandomString(random: Random): string {
    return random.ulid()
}

describe(getRandomString, () => {
    test("A test pins the ULID it expects", () => {
        const random = new FakeRandom();
        random.setUlids("0000000000000g40r40m30e209");

        expect(getRandomString(random)).toBe("0000000000000g40r40m30e209")
        expect(getRandomString(random)).toBe("0000000000000g40r40m30e209")
    });

    test("Or lets the fake make one, from its clock and a predictable sequence", () => {
        const random = new FakeRandom(new FakeClock(1_700_000_000_000));

        expect(getRandomString(random)).toMatchInlineSnapshot(`"01hf7yat00000g40r40m30e209"`);
        expect(getRandomString(random)).toMatchInlineSnapshot(`"01hf7yat00185gr38e1w8124gk"`);

    });
});
