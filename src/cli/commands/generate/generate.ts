// `thunderjar generate` — spec/100-cli-reference.md#generate.

import { findThunderjarRoot } from "../../../project/config.ts";
import { writeGeneratedTypes } from "./parameter-names.ts";

export async function generate(cwd: string = process.cwd()): Promise<{ path: string }> {
  const root = findThunderjarRoot(cwd);
  const { path } = await writeGeneratedTypes(root);
  return { path };
}
