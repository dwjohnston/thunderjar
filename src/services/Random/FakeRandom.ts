import type { Clock } from "../Clock/Clock";
import { FakeClock } from "../Clock/FakeClock";
import { RandomBase } from "./Random";

/**
 * A Random that gives the same sequence every run: bytes count up from 0, ULID times come from
 * its clock. A test pins values with `setBytes` or `setUlids`, which come out first, in order.
 */
export class FakeRandom extends RandomBase {
  private counter = 0;
  private readonly setByteValues: Uint8Array[] = [];
  private readonly setUlidValues: string[] = [];

  constructor(clock: Clock = new FakeClock()) {
    super(clock);
  }

  /** The next `bytes` calls return these, one each; each must be the length asked for. */
  setBytes(...values: (Uint8Array | number[])[]): void {
    this.setByteValues.push(...values.map((value) => Uint8Array.from(value)));
  }

  /** The next `ulid` calls return these, one each. */
  setUlids(...values: string[]): void {
    this.setUlidValues.push(...values);
  }

  bytes(length: number): Uint8Array {
    const set = this.setByteValues.shift();
    if (set === undefined) return Uint8Array.from({ length }, () => this.counter++ & 0xff);
    if (set.length !== length) throw new RangeError(`FakeRandom: set ${set.length} bytes, asked for ${length}`);
    return set;
  }

  override ulid(): string {
    return this.setUlidValues.shift() ?? super.ulid();
  }
}
