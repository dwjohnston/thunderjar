import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeRandom } from "./FakeRandom";

describe(FakeRandom, () => {
    test("Without set values, bytes count up across calls, from 0", () => {
        const random = new FakeRandom();

        expect([...random.bytes(3), ...random.bytes(2)]).toEqual([0, 1, 2, 3, 4]);
    });

    test("Two fakes give the same sequence", () => {
        const [a, b] = [new FakeRandom(), new FakeRandom()];

        expect([a.ulid(), a.uuid()]).toEqual([b.ulid(), b.uuid()]);
    });

    test("Set bytes come out first, in order, then counting carries on", () => {
        const random = new FakeRandom();
        random.setBytes([9, 9], [7]);

        expect([...random.bytes(2), ...random.bytes(1), ...random.bytes(1)]).toEqual([9, 9, 7, 0]);
    });

    test("A set value of the wrong length is an error, not a silent pad", () => {
        const random = new FakeRandom();
        random.setBytes([1, 2]);

        expect(() => random.bytes(3)).toThrow("FakeRandom: set 2 bytes, asked for 3");
    });

    test("ulid encodes the clock's time and 10 bytes", () => {
        const clock = new FakeClock(1);
        const random = new FakeRandom(clock);
        random.setBytes(new Uint8Array(10).fill(255));

        expect(random.ulid()).toBe("0000000001zzzzzzzzzzzzzzzz");
    });

    test("ulid rejects a time it can't encode", () => {
        expect(() => new FakeRandom(new FakeClock(-1)).ulid()).toThrow("ULID time out of range: -1");
        expect(() => new FakeRandom(new FakeClock(2 ** 48)).ulid()).toThrow(RangeError);
    });

    test("Set ULIDs come out as given, ahead of generated ones", () => {
        const random = new FakeRandom(new FakeClock(0));
        random.setUlids("01hf7yat00aaaaaaaaaaaaaaaa");

        expect([random.ulid(), random.ulid()]).toEqual(["01hf7yat00aaaaaaaaaaaaaaaa", "0000000000000g40r40m30e209"]);
    });

    test("uuid is a version 4 UUID built from the next 16 bytes", () => {
        expect(new FakeRandom().uuid()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    });
});
