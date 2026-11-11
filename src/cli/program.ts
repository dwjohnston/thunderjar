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
import { painter } from "./colour.ts";

// Colour for `--help`. Commander strips it again when its output shouldn't be coloured: not a
// terminal, or NO_COLOR set.
const paint = painter({}, true);
/**
 * `[options]` green and each argument yellow, e.g. `<test case>`. Commander's own styling splits
 * text on spaces, so would colour `case>` as a command.
 */
const styleArguments = (text: string) =>
  text.replace(/\[options\]|<[^>]*>|\[[^\]]*\]/g, (match) => (match === "[options]" ? paint.green(match) : paint.yellow(match)));
/** A command's name cyan, then its arguments, e.g. `run [options] <test case>`. */
function styleCommand(text: string): string {
  const start = text.search(/[[<]/);
  if (start === -1) return paint.cyan(text);
  const name = text.slice(0, start).trimEnd();
  return `${name === "" ? "" : `${paint.cyan(name)} `}${styleArguments(text.slice(start))}`;
}
const HELP_STYLES = {
  styleTitle: paint.bold,
  styleCommandText: paint.cyan,
  styleUsage: (usage: string) => styleCommand(usage),
  styleSubcommandTerm: (term: string) => styleCommand(term),
  styleOptionTerm: paint.green,
  styleArgumentTerm: paint.yellow,
};

export function createProgram(): Command {
  const program = new Command()
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
  // Commands made on their own and added don't inherit the program's help settings.
  for (const command of [program, ...program.commands]) command.configureHelp(HELP_STYLES);
  return program;
}
