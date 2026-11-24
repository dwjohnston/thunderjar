import { Command, Option } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { createAttachCommand } from "./commands/attach/attach.ts";
import { createBuildCommand } from "./commands/build/build.ts";
import { createCaptureCommand } from "./commands/capture/capture.ts";
import { createCheckoutCommand } from "./commands/checkout/checkout.ts";
import { createDbCommand } from "./commands/db/db.ts";
import { createDoctorCommand } from "./commands/doctor/doctor.ts";
import { createExecutionsCommand } from "./commands/executions/executions.ts";
import { createGenerateCommand } from "./commands/generate/generate.ts";
import { createInitCommand } from "./commands/init/init.ts";
import { createPlanCommand } from "./commands/plan/plan.ts";
import { createPurgeCommand } from "./commands/purge/purge.ts";
import { createRemeasureCommand } from "./commands/remeasure/remeasure.ts";
import { createRunCommand } from "./commands/run/run.ts";
import { createRunnerCommand } from "./commands/runner/runner.ts";
import { createShowCommand } from "./commands/show/show.ts";
import { createViewCommand } from "./commands/view/view.ts";
import { ConfigError, findThunderjarRoot } from "../config/loader.ts";
import { DEFAULT_LOG_LEVEL, LOG_LEVELS, type LogLevel, moduleLogger } from "../log/logger.ts";
import type { CommandRun } from "./app.ts";
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
 * Where `command`'s diagnostic log goes: `logFile`, or a new file in `.thunderjar/logs/` of the
 * project `cwd` is in, named for when it started, `now`, and the command, e.g.
 * `2026-11-11T06-07-11.679Z-run.log`. Outside a project, e.g. before `init`, there's no log
 * without `logFile`.
 */
async function logPath(logFile: string | undefined, cwd: string, now: number, command: string): Promise<string | undefined> {
  // An empty THUNDERJAR_LOG_FILE is no file.
  if (logFile) return resolvePath(cwd, logFile);
  try {
    const root = await findThunderjarRoot(cwd);
    return `${root}/logs/${new Date(now).toISOString().replaceAll(":", "-")}-${command}.log`;
  } catch (error) {
    if (error instanceof ConfigError) return undefined;
    throw error;
  }
}

/** `command` and every command under it. */
const allCommands = (command: Command): Command[] => [command, ...command.commands.flatMap(allCommands)];

/** `value` if it's a log level. */
const logLevel = (value: string | undefined): LogLevel | undefined => (LOG_LEVELS as readonly string[]).includes(value ?? "") ? (value as LogLevel) : undefined;

/**
 * The CLI, as a commander program, running its commands with `run`'s services, and writing its
 * help and argument errors to `run.io`. Without `run`, e.g. for scripts/docs-data.ts, it only
 * describes the commands: running one throws.
 */
export function createProgram(run?: CommandRun): Command {
  const program = new Command()
    .name("thunderjar")
    .description(pkg.description)
    .version(pkg.version)
    .addOption(new Option("--log-file <path>", "where to write the diagnostic log, instead of .thunderjar/logs/").env("THUNDERJAR_LOG_FILE"))
    .addOption(new Option("--log-level <level>", "how much goes in the diagnostic log").choices(LOG_LEVELS).env("THUNDERJAR_LOG_LEVEL"))
    .addOption(new Option("-v, --verbose", "log at the debug level: --log-level debug").conflicts("logLevel"))
    .hook("preAction", async (program, command) => {
      // A capture hook runs twice a turn, in any repository: it logs to capture.log, never a log file of its own.
      if (command.parent?.name() === "capture" && (command.name() === "prompt" || command.name() === "stop")) return;
      // With --json, stdout is the JSON alone, so everything else a command writes goes to stderr.
      if (command.opts<{ json?: boolean }>().json) textToStderr();
      if (run?.log === undefined) return;
      const options = program.opts<LogOptions>();
      // From the command line, or else the environment the command was launched with. Commander's
      // own fallback, `.env()`, reads the process's, which isn't the command's in a test.
      const given = (name: keyof LogOptions) => program.getOptionValueSource(name) === "cli";
      const file = given("logFile") ? options.logFile : run.launch.env.THUNDERJAR_LOG_FILE;
      const level = given("logLevel") ? options.logLevel : logLevel(run.launch.env.THUNDERJAR_LOG_LEVEL);
      const path = await logPath(file, run.launch.cwd, run.clock.now(), command.name());
      if (path === undefined) return;
      run.log({ path, level: options.verbose ? "debug" : (level ?? DEFAULT_LOG_LEVEL) });
      log.debug({ command: command.name(), args: command.args, options: command.opts(), version: pkg.version, cwd: run.launch.cwd }, "command started");
    })
    .addCommand(createInitCommand())
    .addCommand(createGenerateCommand())
    .addCommand(createPlanCommand())
    .addCommand(createBuildCommand(run))
    .addCommand(createRunCommand(run))
    .addCommand(createAttachCommand())
    // What a runtime's runner runs, not a command for a user: left out of --help.
    .addCommand(createRunnerCommand(), { hidden: true })
    .addCommand(createDoctorCommand())
    .addCommand(createDbCommand())
    .addCommand(createExecutionsCommand())
    .addCommand(createShowCommand())
    .addCommand(createViewCommand())
    .addCommand(createRemeasureCommand())
    .addCommand(createCheckoutCommand())
    .addCommand(createPurgeCommand())
    .addCommand(createCaptureCommand());
  // Commands made on their own and added don't inherit the program's settings.
  for (const command of allCommands(program)) {
    command.configureHelp(HELP_STYLES);
    if (run === undefined) continue;
    // Throws, where commander would exit: createApp returns the exit code.
    command.exitOverride();
    command.configureOutput({ writeOut: (text) => run.io.stdout.write(text), writeErr: (text) => run.io.stderr.write(text) });
  }
  return program;
}
