import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import type { Random } from "./Random";
import { FakeRandom } from "./FakeRandom";

/** Names an execution of a test case, as `run` might. */
function executionTag(random: Random, testCase: string): string {
    return `thunderjar-postrun:${random.ulid()}-${testCase}`;
}

describe(executionTag, () => {
    test("A test pins the ULID it expects", () => {
        const random = new FakeRandom();
        random.setUlids("01hf7yat00aaaaaaaaaaaaaaaa");

        expect(executionTag(random, "2-1")).toBe("thunderjar-postrun:01hf7yat00aaaaaaaaaaaaaaaa-2-1");
    });

    test("Or lets the fake make one, from its clock and a predictable sequence", () => {
        const random = new FakeRandom(new FakeClock(1_700_000_000_000));

        expect(executionTag(random, "2-1")).toMatchInlineSnapshot(`"thunderjar-postrun:01hf7yat00000g40r40m30e209-2-1"`);
    });
});
