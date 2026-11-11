import { Command, Option } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { createBuildCommand } from "./commands/build/build.ts";
import { createExecutionsCommand } from "./commands/executions/executions.ts";
import { createGenerateCommand } from "./commands/generate/generate.ts";
import { createInitCommand } from "./commands/init/init.ts";
import { createPlanCommand } from "./commands/plan/plan.ts";
import { createRunCommand } from "./commands/run/run.ts";
import { createShowCommand } from "./commands/show/show.ts";
import { createViewCommand } from "./commands/view/view.ts";
import { LOG_LEVELS, type LogLevel, moduleLogger, setLogLevel } from "../log/logger.ts";

const log = moduleLogger("cli");

export function createProgram(): Command {
  return new Command()
    .name("thunderjar")
    .description(pkg.description)
    .version(pkg.version)
    .addOption(
      new Option("--log-level <level>", "write a diagnostic log to stderr, as JSON lines, at this level (default: THUNDERJAR_LOG_LEVEL, or silent)").choices(
        LOG_LEVELS,
      ),
    )
    .hook("preAction", (program, command) => {
      const { logLevel } = program.opts<{ logLevel?: LogLevel }>();
      if (logLevel !== undefined) setLogLevel(logLevel);
      log.debug({ command: command.name(), args: command.args, options: command.opts(), version: pkg.version, cwd: process.cwd() }, "command started");
    })
    .addCommand(createInitCommand())
    .addCommand(createGenerateCommand())
    .addCommand(createPlanCommand())
    .addCommand(createBuildCommand())
    .addCommand(createRunCommand())
    .addCommand(createExecutionsCommand())
    .addCommand(createShowCommand())
    .addCommand(createViewCommand());
}
