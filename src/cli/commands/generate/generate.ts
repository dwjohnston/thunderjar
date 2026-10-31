// `thunderjar generate` — spec/100-cli-reference.md#generate.

import { Command } from "commander";
import { findThunderjarRoot } from "../../../project/config.ts";
import { writeGeneratedTypes } from "./parameter-names.ts";

export async function generate(cwd: string = process.cwd()): Promise<{ path: string }> {
  const root = findThunderjarRoot(cwd);
  const { path } = await writeGeneratedTypes(root);
  return { path };
}

export function createGenerateCommand(): Command {
  return new Command("generate").description("Write the parameter-name types for this project.").action(async () => {
    const { path } = await generate();
    console.log(`generated ${path}`);
  });
}
