import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { createGenerateCommand } from "./commands/generate/generate.ts";
import { createInitCommand } from "./commands/init/init.ts";

export function createProgram(): Command {
  return new Command()
    .name("thunderjar")
    .description(pkg.description)
    .version(pkg.version)
    .addCommand(createInitCommand())
    .addCommand(createGenerateCommand());
}
