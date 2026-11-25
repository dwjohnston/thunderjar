/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { type Command, InvalidArgumentError, Option } from "commander";
import { OVERRIDABLE, OVERRIDES, type Overrides } from "../config/overrides.ts";

/** A comma-separated list of names, e.g. `snerk,glurk`. */
const names = (value: string): string[] => {
  const list = value.split(",").map((name) => name.trim());
  if (list.some((name) => name === "")) throw new InvalidArgumentError("It must be a comma-separated list of names, e.g. a,b.");
  return list;
};

/** A whole number, 1 or more. */
const count = (value: string): number => {
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new InvalidArgumentError("It must be a whole number, 1 or more.");
  return Number(value);
};

/** One flag per field of the test case an override can replace: `run` takes them all. */
export function overrideOptions(): Option[] {
  return OVERRIDABLE.map((field) => {
    const { flag, what } = OVERRIDES[field];
    if (field === "iterations") return new Option(`${flag} <n>`, "run <n> iterations of each permutation, instead of the test case's iterations").argParser(count);
    return new Option(`${flag} <names>`, `use these ${what}, comma-separated, instead of the test case's`).argParser(names);
  });
}

/** The overrides among a command's parsed options. */
export const overridesOf = (options: Overrides): Overrides => Object.fromEntries(OVERRIDABLE.map((field) => [field, options[field]]));

/** `command`, with every override flag. */
export function withOverrideOptions(command: Command): Command {
  for (const option of overrideOptions()) command.addOption(option);
  return command;
}
