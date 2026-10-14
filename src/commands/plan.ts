// `thunderjar plan <test case>` — spec/100-cli-reference.md#plan,
// spec/055-declaring-test-cases.md#declaration. This first pass lists the parameters
// a test case names; expanding the matrix and showing hashes are later stories.

import { findThunderjarRoot, loadTestCase } from "../config.ts";
import type { TestCaseDeclaration } from "../declarations.ts";

const ROWS: Array<[label: string, select: (testCase: TestCaseDeclaration) => string]> = [
  ["baseImage", (t) => t.baseImage.join(", ")],
  ["codeState", (t) => t.codeState.join(", ")],
  ["promptSet", (t) => t.promptSet.join(", ")],
  ["harnessModel", (t) => t.harnessModel.join(", ")],
  ["task", (t) => t.task],
  ["initialPrompt", (t) => t.initialPrompt.join(", ")],
];

const LABEL_WIDTH = Math.max(...ROWS.map(([label]) => label.length)) + 2; // + ":" + one space

export async function plan(name: string, cwd: string = process.cwd()): Promise<string> {
  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  return ROWS.map(([label, select]) => `${(label + ":").padEnd(LABEL_WIDTH)}${select(testCase)}`).join("\n");
}
