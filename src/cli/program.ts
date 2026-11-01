import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { createGenerateCommand } from "./commands/generate/generate.ts";
import { createInitCommand } from "./commands/init/init.ts";
import { createPlanCommand } from "./commands/plan/plan.ts";
import { createRunCommand } from "./commands/run/run.ts";

export function createProgram(): Command {
  return new Command()
    .name("thunderjar")
    .description(pkg.description)
    .version(pkg.version)
    .addCommand(createInitCommand())
    .addCommand(createGenerateCommand())
    .addCommand(createPlanCommand())
    .addCommand(createRunCommand());
}
