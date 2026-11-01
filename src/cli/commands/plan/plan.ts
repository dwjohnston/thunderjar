import { Command } from "commander";
import type { TestCaseDeclaration } from "../../../api/declarations.ts";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { reportingConfigErrors } from "../../configErrors.ts";

const ROWS: [label: string, values: (testCase: TestCaseDeclaration) => string][] = [
  ["baseImage", (t) => t.baseImage.join(", ")],
  ["codeState", (t) => t.codeState.join(", ")],
  ["promptSet", (t) => t.promptSet.join(", ")],
  ["harnessModel", (t) => t.harnessModel.join(", ")],
  ["task", (t) => t.task],
  ["initialPrompt", (t) => t.initialPrompt.join(", ")],
];

const LABEL_WIDTH = Math.max(...ROWS.map(([label]) => `${label}: `.length));

/** The parameters `testCase` names, one line each. */
export function renderSummary(testCase: TestCaseDeclaration): string {
  return ROWS.map(([label, values]) => `${`${label}:`.padEnd(LABEL_WIDTH)}${values(testCase)}`).join("\n");
}

/** The plan of test case `name`, of the nearest `.thunderjar/` folder, in `cwd` or above it. */
export async function plan(cwd: string, name: string): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  return renderSummary(await loadTestCase(root, name));
}

export function createPlanCommand(): Command {
  return new Command("plan")
    .description("Show what a test case would run, without running it: the parameters it names.")
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .action(
      reportingConfigErrors(async (name: string) => {
        console.log(await plan(process.cwd(), name));
      }),
    );
}
