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

// Parameter overrides: lists given on the command line, each replacing one of a test case's lists
// for one execution, without editing its file.
import type { TestCaseDeclaration } from "../api/declarations.ts";
import type { Axis } from "./permutations.ts";

/**
 * The fields an override can replace, each with its flag and what its names are, in the order
 * `showOverrides` lists them.
 */
export const OVERRIDES = {
  baseImage: { flag: "--base-image", what: "base images" },
  promptSet: { flag: "--prompt-set", what: "prompt sets" },
} as const satisfies Partial<Record<Axis | "iterations", { flag: string; what: string }>>;

export type OverridableField = keyof typeof OVERRIDES;

/** What each override replaces its field with. A field not given is the test case's own. */
export type Overrides = Partial<Pick<TestCaseDeclaration, OverridableField>>;

export const OVERRIDABLE = Object.keys(OVERRIDES) as OverridableField[];

/** The overrides given, in flag order, without those left unset. */
export const givenOverrides = (overrides: Overrides): Overrides =>
  Object.fromEntries(OVERRIDABLE.flatMap((field) => (overrides[field] === undefined ? [] : [[field, overrides[field]]])));

/** Whether any override is given. */
export const hasOverrides = (overrides: Overrides | undefined): overrides is Overrides =>
  overrides !== undefined && Object.keys(givenOverrides(overrides)).length > 0;

/** `testCase`, each list `overrides` gives in place of its own. */
export const withOverrides = (testCase: Record<string, unknown>, overrides: Overrides): Record<string, unknown> => ({
  ...testCase,
  ...givenOverrides(overrides),
});

/** The overrides as they'd be given on the command line, e.g. `--prompt-set glurk,snerk --iterations 3`. */
export const showOverrides = (overrides: Overrides): string =>
  Object.entries(givenOverrides(overrides))
    .map(([field, value]) => `${OVERRIDES[field as OverridableField].flag} ${Array.isArray(value) ? value.join(",") : String(value)}`)
    .join(" ");
