import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { createBuildCommand } from "./commands/build/build.ts";
import { createExecutionsCommand } from "./commands/executions/executions.ts";
import { createGenerateCommand } from "./commands/generate/generate.ts";
import { createInitCommand } from "./commands/init/init.ts";
import { createPlanCommand } from "./commands/plan/plan.ts";
import { createRemeasureCommand } from "./commands/remeasure/remeasure.ts";
import { createRunCommand } from "./commands/run/run.ts";
import { createShowCommand } from "./commands/show/show.ts";

export function createProgram(): Command {
  const program = new Command()
    .name("thunderjar")
    .description(pkg.description)
    .version(pkg.version)
    .showHelpAfterError()
    .addCommand(createInitCommand())
    .addCommand(createGenerateCommand())
    .addCommand(createPlanCommand())
    .addCommand(createBuildCommand())
    .addCommand(createRunCommand())
    .addCommand(createExecutionsCommand())
    .addCommand(createShowCommand())
    .addCommand(createRemeasureCommand());
  // Added commands don't inherit this setting from the program.
  for (const command of program.commands) command.showHelpAfterError();
  return program;
}
