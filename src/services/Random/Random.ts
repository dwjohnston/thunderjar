import type { Clock } from "../Clock/Clock";

/** Where randomness comes from, so a test can pass a FakeRandom in its place. */
export interface Random {
  /** `length` random bytes. */
  bytes(length: number): Uint8Array;
  /** A version 4 UUID, lower case. */
  uuid(): string;
  /** A ULID, lower case, its time part from the clock: an execution ID. */
  ulid(): string;
}

/** Real randomness, ULID times from `clock`. Built only at an entry point. */
export function createRandomService(clock: Clock): Random {
  return new SystemRandom(clock);
}

/** The ULID and UUID encodings, on top of a `bytes` that a subclass supplies. */
export abstract class RandomBase implements Random {
  constructor(protected readonly clock: Clock) {}

  abstract bytes(length: number): Uint8Array;

  uuid(): string {
    const b = this.bytes(16);
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const hex = [...b].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  ulid(): string {
    return encodeUlid(this.clock.now(), this.bytes(10));
  }
}

class SystemRandom extends RandomBase {
  bytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }
}

// ULIDs: 26 characters of Crockford base32, a 48-bit millisecond timestamp (10 characters) then
// 80 random bits (16 characters), so they sort by time. Lower case, because they go into Docker
// image tags; ULIDs are case-insensitive.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function encodeUlid(now: number, random: Uint8Array): string {
  if (!Number.isInteger(now) || now < 0 || now >= 2 ** 48) throw new RangeError(`ULID time out of range: ${now}`);

  let time = "";
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = ALPHABET[t % 32] + time;

  let bits = 0n;
  for (const byte of random) bits = (bits << 8n) | BigInt(byte);
  let rest = "";
  for (let i = 0; i < 16; i++, bits >>= 5n) rest = ALPHABET[Number(bits & 31n)] + rest;

  return time + rest;
}
