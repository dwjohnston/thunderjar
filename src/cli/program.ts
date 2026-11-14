import { Command, Option } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { createAttachCommand } from "./commands/attach/attach.ts";
import { createBuildCommand } from "./commands/build/build.ts";
import { createDoctorCommand } from "./commands/doctor/doctor.ts";
import { createExecutionsCommand } from "./commands/executions/executions.ts";
import { createGenerateCommand } from "./commands/generate/generate.ts";
import { createInitCommand } from "./commands/init/init.ts";
import { createPlanCommand } from "./commands/plan/plan.ts";
import { createRunCommand } from "./commands/run/run.ts";
import { createRunnerCommand } from "./commands/runner/runner.ts";
import { createShowCommand } from "./commands/show/show.ts";
import { createViewCommand } from "./commands/view/view.ts";
import { ConfigError, findThunderjarRoot } from "../config/loader.ts";
import { configureLog, DEFAULT_LOG_LEVEL, LOG_LEVELS, type LogLevel, moduleLogger } from "../log/logger.ts";
import { resolvePath } from "./dataDir.ts";
import { textToStderr } from "./textOutput.ts";

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

type LogOptions = { logFile?: string; logLevel?: LogLevel; verbose?: boolean };

/**
 * Where `command`'s diagnostic log goes: `--log-file`, or a new file in `.thunderjar/logs/`,
 * named for when it started and the command, e.g. `2026-11-11T06-07-11.679Z-run.log`. Outside a
 * project, e.g. before `init`, there's no log without `--log-file`.
 */
async function logFile({ logFile }: LogOptions, command: string): Promise<string | undefined> {
  const cwd = process.cwd();
  // An empty THUNDERJAR_LOG_FILE is no file.
  if (logFile) return resolvePath(cwd, logFile);
  try {
    const root = await findThunderjarRoot(cwd);
    return `${root}/logs/${new Date().toISOString().replaceAll(":", "-")}-${command}.log`;
  } catch (error) {
    if (error instanceof ConfigError) return undefined;
    throw error;
  }
}

export function createProgram(): Command {
  const program = new Command()
    .name("thunderjar")
    .description(pkg.description)
    .version(pkg.version)
    .addOption(new Option("--log-file <path>", "where to write the diagnostic log, instead of .thunderjar/logs/").env("THUNDERJAR_LOG_FILE"))
    .addOption(new Option("--log-level <level>", "how much goes in the diagnostic log").choices(LOG_LEVELS).env("THUNDERJAR_LOG_LEVEL"))
    .addOption(new Option("-v, --verbose", "log at the debug level: --log-level debug").conflicts("logLevel"))
    .hook("preAction", async (program, command) => {
      // With --json, stdout is the JSON alone, so everything else a command writes goes to stderr.
      if (command.opts<{ json?: boolean }>().json) textToStderr();
      const options = program.opts<LogOptions>();
      const path = await logFile(options, command.name());
      if (path === undefined) return;
      configureLog({ path, level: options.verbose ? "debug" : (options.logLevel ?? DEFAULT_LOG_LEVEL) });
      log.debug({ command: command.name(), args: command.args, options: command.opts(), version: pkg.version, cwd: process.cwd() }, "command started");
    })
    .addCommand(createInitCommand())
    .addCommand(createGenerateCommand())
    .addCommand(createPlanCommand())
    .addCommand(createBuildCommand())
    .addCommand(createRunCommand())
    .addCommand(createAttachCommand())
    // What a runtime's runner runs, not a command for a user: left out of --help.
    .addCommand(createRunnerCommand(), { hidden: true })
    .addCommand(createDoctorCommand())
    .addCommand(createExecutionsCommand())
    .addCommand(createShowCommand())
    .addCommand(createViewCommand());
  // Commands made on their own and added don't inherit the program's help settings.
  for (const command of [program, ...program.commands]) command.configureHelp(HELP_STYLES);
  return program;
}
