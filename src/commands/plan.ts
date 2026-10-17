// `thunderjar plan <test case>` — spec/100-cli-reference.md#plan,
// spec/055-declaring-test-cases.md#declaration. Lists the parameters a test case names with
// their parameter hashes, then its matrix shape, container run count, and each permutation
// with its prerun image and whether that image exists (and would be reused) or would be built.
// Without Docker, plan still works, and says the images' status is unknown.

import { dockerCli, type Docker } from "../adapters/docker/docker.ts";
import { findThunderjarRoot, loadTestCase } from "../config.ts";
import { abbreviateHash } from "../hashing.ts";
import { matrixShape, permutationRows } from "../permutations.ts";
import { LOCAL_REPOSITORY, prerunStatuses, showPrerunStatus, unreachableNote } from "../prerun.ts";
import { resolveTestCase } from "../resolve.ts";
import { prerunTag } from "../tags.ts";
import { count } from "./format.ts";

export interface PlanOptions {
  docker?: Docker;
  /** The image repository prerun images are looked up in. */
  repository?: string;
}

/** The parameter lines, in declaration field order. `task` has no hash of its own. */
const LABELS = ["baseImage", "codeState", "promptSet", "harnessModel", "task", "initialPrompt"] as const;

const LABEL_WIDTH = Math.max(...LABELS.map((label) => label.length)) + 2; // + ":" + one space

export async function plan(name: string, cwd: string = process.cwd(), options: PlanOptions = {}): Promise<string> {
  const { docker = dockerCli(), repository = LOCAL_REPOSITORY } = options;
  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const { hashes, permutations } = await resolveTestCase(root, testCase);
  const found = await prerunStatuses(docker, repository, permutations);
  const status = (hash: string) => ("statuses" in found ? showPrerunStatus(found.statuses.get(hash)) : "");

  const parameterLines = LABELS.map((label) => {
    const value =
      label === "task"
        ? testCase.task
        : testCase[label].map((n) => `${n} (${abbreviateHash(hashes[label].get(n)!)})`).join(", ");
    return `${(label + ":").padEnd(LABEL_WIDTH)}${value}`;
  });

  const runs = permutations.length * testCase.iterations;
  const summary =
    `Matrix shape: ${matrixShape(testCase).join("/")} ` +
    `(${count(permutations.length, "permutation")} × ${count(testCase.iterations, "iteration")} = ${count(runs, "container run")})`;

  // Each permutation: a right-aligned number, then the five names as columns; below, its
  // prerun image, which carries the permutation hash.
  const rows = permutationRows(permutations);
  const numberWidth = Math.max(2, String(permutations.length).length);
  const entries = permutations.map(
    (permutation, n) =>
      `${String(n + 1).padStart(numberWidth)}  ${rows[n]}\n` +
      `${" ".repeat(numberWidth + 2)}${prerunTag(permutation.hash)}${status(permutation.hash)}`,
  );

  const note = "unreachable" in found ? ["", unreachableNote(found.unreachable)] : [];
  return [...parameterLines, "", summary, "", entries.join("\n\n"), ...note].join("\n");
}
