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
import { foldersIn, PARAMETERS, tsFilesIn } from "./folders.ts";
import { ConfigError } from "./loader.ts";
import { type Axis, parsePair } from "./permutations.ts";

/**
 * The fields an override can replace, each with its flag, what its names are, plural and singular,
 * and the folder its names are in, in the order `showOverrides` lists them.
 */
export const OVERRIDES = {
  baseImage: { flag: "--base-image", what: "base images", one: "base image", folder: "baseImages" },
  codeState: { flag: "--code-state", what: "code states", one: "code state", folder: "codeStates" },
  promptSet: { flag: "--prompt-set", what: "prompt sets", one: "prompt set", folder: "promptSets" },
  harnessModel: { flag: "--harness-model", what: "harness model pairs", one: "harness", folder: "harnessModels" },
  initialPrompt: { flag: "--initial-prompt", what: "initial prompts", one: "initial prompt", folder: "initial-prompts" },
  iterations: { flag: "--iterations", what: "iterations", one: "iteration", folder: undefined },
} as const satisfies Partial<Record<Axis | "iterations", { flag: string; what: string; one: string; folder?: string }>>;

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

/** The names `field`'s override can give: the folders of its parameter folder, or `task`'s initial prompts. */
function knownNames(root: string, field: Exclude<OverridableField, "iterations">, task: unknown): Promise<string[]> {
  if (field !== "initialPrompt") return foldersIn(root, `${PARAMETERS}/${OVERRIDES[field].folder}`);
  return typeof task === "string" ? tsFilesIn(root, `${PARAMETERS}/tasks/${task}/initial-prompts`) : Promise.resolve([]);
}

/**
 * Fails if an override names a parameter `root` (the `.thunderjar/` folder) doesn't declare, or,
 * for initial prompts, one test case task `task` doesn't have, listing those it does.
 */
export async function checkOverrides(root: string, overrides: Overrides, task: unknown): Promise<void> {
  const problems: string[] = [];
  for (const field of OVERRIDABLE) {
    const given = overrides[field];
    if (field === "iterations" || !Array.isArray(given)) continue;
    const known = await knownNames(root, field, task);
    for (const name of given) {
      const declared = field === "harnessModel" ? parsePair(name).harness : name;
      if (!known.includes(declared)) problems.push(`Unknown ${OVERRIDES[field].one} ${JSON.stringify(declared)}. Known: ${known.join(", ")}.`);
    }
  }
  if (problems.length > 0) throw new ConfigError(...problems);
}
