/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
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

/** One flag per field of the test case an override can replace: `run`, `plan` and `build` take them all. */
export function overrideOptions(): Option[] {
  return OVERRIDABLE.map((field) => {
    const { flag, what } = OVERRIDES[field];
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
