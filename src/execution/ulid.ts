// Execution IDs are ULIDs: 26 characters of Crockford base32, a 48-bit millisecond timestamp
// (10 characters) then 80 random bits (16 characters), so they sort by time. Lower case, because
// they go into Docker image tags; ULIDs are case-insensitive.

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** A new ULID for the time `now` (ms since the epoch), with 80 bits from `random`. */
export function ulid(now: number = Date.now(), random: Uint8Array = crypto.getRandomValues(new Uint8Array(10))): string {
  if (!Number.isInteger(now) || now < 0 || now >= 2 ** 48) throw new RangeError(`ULID time out of range: ${now}`);
  if (random.length !== 10) throw new RangeError(`ULID randomness must be 10 bytes, got ${random.length}`);

  let time = "";
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = ALPHABET[t % 32] + time;

  let bits = 0n;
  for (const byte of random) bits = (bits << 8n) | BigInt(byte);
  let rest = "";
  for (let i = 0; i < 16; i++, bits >>= 5n) rest = ALPHABET[Number(bits & 31n)] + rest;

  return time + rest;
}
