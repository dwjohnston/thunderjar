#!/usr/bin/env bun
// AI-generated template: copy and adapt. Review before relying on it.
// Bun loads .env files automatically, so no dotenv import is needed.
import { Command, InvalidArgumentError } from "commander";
import { cleanEnv, num } from "envalid";

const DEFAULT_DIVISOR = 2;

if (import.meta.main) {
  const env = cleanEnv(process.env, {
    DIVISOR: num({
      default: DEFAULT_DIVISOR,
      desc: "Number each input must be divisible by",
    }),
  });

  new Command()
    // 👇
    .description(
      `Check whether every given integer is divisible by DIVISOR (default ${DEFAULT_DIVISOR}, i.e. even). Prints "true" or "false".`,
    )
    .argument("<numbers...>", "one or more integers", parseInteger)
    .option("--any", "print true if at least one number is divisible, instead of all")
    .addHelpText(
      "after",
      "\nEnvironment:\n  DIVISOR   number to divide by (read from the environment or .env)\n\nExample:\n  bun template_endorsed_tools.ts 2 4 6   # true\n  DIVISOR=3 bun template_endorsed_tools.ts 3 6 7 --any   # true",
    )
    .action((numbers: number[], opts: { any?: boolean }) => {
      console.log(main(numbers, env.DIVISOR, opts.any));
    })
    .parse();
}

export function main(numbers: number[], divisor: number, any = false): boolean {
  const isDivisible = (n: number) => n % divisor === 0;
  return any ? numbers.some(isDivisible) : numbers.every(isDivisible);
}

function parseInteger(value: string, previous: number[] = []): number[] {
  const n = Number(value);
  if (value.trim() === "" || !Number.isInteger(n)) {
    throw new InvalidArgumentError(`"${value}" is not an integer.`);
  }
  return [...previous, n];
}
