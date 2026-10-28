#!/usr/bin/env bun
// AI-generated template: copy and adapt. Review before relying on it.

const DIVISOR = 2;

function help() {
  console.log(`
Check whether every given integer is even (divisible by ${DIVISOR}). Prints "true" if all are, otherwise "false".

Usage:
  bun template_basic.ts <number...>

Arguments:
  <number...>    One or more integers

Options:
  -h, --help     Show this message

Example:
  bun template_basic.ts 2 4 6   # true
  bun template_basic.ts 2 3     # false
`);
}

if (import.meta.main) {
  // Bun.argv is [bun executable, script path, ...user args]
  const args = Bun.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    help();
    process.exit(0);
  }

  if (args.length === 0) {
    console.error("Missing <number...> arguments.");
    help();
    process.exit(1);
  }

  const numbers = args.map((arg) => {
    const n = Number(arg);
    if (arg.trim() === "" || !Number.isInteger(n)) {
      console.error(`Not an integer: "${arg}"`);
      help();
      process.exit(1);
    }
    return n;
  });

  console.log(main(numbers));
}

export function main(numbers: number[]): boolean {
  return numbers.every(isEven);
}

export function isEven(n: number): boolean {
  return n % DIVISOR === 0;
}
