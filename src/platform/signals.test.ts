import { expect, test } from "bun:test";
import { signalNumber } from "./signals.ts";

test("signalNumber gives the number of a signal by name", () => {
  expect(signalNumber("SIGKILL")).toBe(9);
  expect(signalNumber("SIGTERM")).toBe(15);
  expect(signalNumber("SIGINT")).toBe(2);
  expect(signalNumber(9)).toBe(9);
  expect(() => signalNumber("SIGNOPE")).toThrow("unknown signal");
});

test("signalNumber agrees with the shell's `kill -l`", () => {
  for (let number = 1; number <= 31; number++) {
    const name = Bun.spawnSync(["sh", "-c", 'kill -l "$1"', "sh", String(number)]).stdout.toString().trim();
    if (!/^[A-Z]/.test(name)) continue;
    expect(signalNumber(`SIG${name}`)).toBe(number);
  }
});

test("a child killed by a signal reports the signal's name, which signalNumber maps", async () => {
  const proc = Bun.spawn(["sh", "-c", "kill -TERM $$"]);
  await proc.exited;
  expect(proc.exitCode).toBeNull();
  expect(signalNumber(proc.signalCode!)).toBe(15);
});
