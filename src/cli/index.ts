#!/usr/bin/env bun
import { build } from "../commands/build/build.ts";
import { executions } from "../commands/executions/executions.ts";
import { generate } from "../commands/generate/generate.ts";
import { init } from "../commands/init/init.ts";
import { plan } from "../commands/plan/plan.ts";
import { remeasure } from "../commands/remeasure/remeasure.ts";
import { run } from "../commands/run/run.ts";
import { show } from "../commands/show/show.ts";

const [command, ...args] = process.argv.slice(2);

const USAGE = `usage: thunderjar <command> [<args>]

commands:
  init                                  create .thunderjar/ in this project
  generate                              write the parameter-name types for this project
  plan <test case>                      print what a run of a test case would do
  build <test case>                     build a test case's prerun images
  run <test case>                       run a test case
  executions [<test case>]              list recorded executions
  show <test case | execution | run>    show a test case, an execution or a container run
  remeasure <test case | execution>     apply the current measurements to past runs`;

/**
 * `args` without `<flag> <value>`, and the value, or `"invalid"` if the flag is given without a
 * value or more than once.
 */
function takeOption(args: string[], flag: string): { rest: string[]; value?: string } | "invalid" {
  const at = args.indexOf(flag);
  if (at === -1) return { rest: args };
  const value = args[at + 1];
  const rest = args.toSpliced(at, 2);
  if (!value || value.startsWith("-") || rest.includes(flag)) return "invalid";
  return { rest, value };
}

/** `args` without each of `flags` and its value, and the values by flag, or `"invalid"`. */
function takeOptions<F extends string>(
  args: string[],
  flags: F[],
): { rest: string[]; values: Partial<Record<F, string>> } | "invalid" {
  const values: Partial<Record<F, string>> = {};
  let rest = args;
  for (const flag of flags) {
    const taken = takeOption(rest, flag);
    if (taken === "invalid") return "invalid";
    rest = taken.rest;
    values[flag] = taken.value;
  }
  return { rest, values };
}

try {
  if (command === "init") {
    const { created, skipped } = await init(process.cwd());
    for (const f of created) console.log(`created  .thunderjar/${f}`);
    for (const f of skipped) console.log(`exists   .thunderjar/${f}`);
  } else if (command === "generate") {
    const { path } = await generate();
    console.log(`generated ${path}`);
  } else if (command === "plan") {
    const parsed = takeOptions(args, ["--image-prefix"]);
    if (parsed === "invalid" || parsed.rest.length !== 1 || parsed.rest[0]!.startsWith("-")) {
      console.error("usage: thunderjar plan <test case> [--image-prefix <name>]");
      process.exitCode = 1;
    } else {
      console.log(await plan(parsed.rest[0]!, process.cwd(), { repository: parsed.values["--image-prefix"] }));
    }
  } else if (command === "run") {
    const parsed = takeOptions(args, ["--image-prefix", "--data-dir"]);
    const rest = parsed === "invalid" ? [] : parsed.rest;
    const flags = rest.filter((a) => a.startsWith("-"));
    const [name, ...extra] = rest.filter((a) => !a.startsWith("-"));
    if (parsed === "invalid" || !name || extra.length > 0 || flags.some((f) => f !== "--dry-run")) {
      console.error("usage: thunderjar run <test case> [--dry-run] [--image-prefix <name>] [--data-dir <dir>]");
      process.exitCode = 1;
    } else {
      await run(name, {
        dryRun: flags.includes("--dry-run"),
        repository: parsed.values["--image-prefix"],
        dataDir: parsed.values["--data-dir"],
      });
    }
  } else if (command === "build") {
    const parsed = takeOptions(args, ["--image-prefix"]);
    const rest = parsed === "invalid" ? [] : parsed.rest;
    const flags = rest.filter((a) => a.startsWith("-"));
    const [name, ...extra] = rest.filter((a) => !a.startsWith("-"));
    if (parsed === "invalid" || !name || extra.length > 0 || flags.some((f) => f !== "--dry-run")) {
      console.error("usage: thunderjar build <test case> [--dry-run] [--image-prefix <name>]");
      process.exitCode = 1;
    } else {
      await build(name, { dryRun: flags.includes("--dry-run"), repository: parsed.values["--image-prefix"] });
    }
  } else if (command === "executions") {
    const parsed = takeOptions(args, ["--data-dir"]);
    if (parsed === "invalid" || parsed.rest.length > 1 || parsed.rest.some((a) => a.startsWith("-"))) {
      console.error("usage: thunderjar executions [<test case>] [--data-dir <dir>]");
      process.exitCode = 1;
    } else {
      console.log(await executions(parsed.rest[0], { dataDir: parsed.values["--data-dir"] }));
    }
  } else if (command === "show") {
    const parsed = takeOptions(args, ["--data-dir"]);
    if (parsed === "invalid" || parsed.rest.length !== 1 || parsed.rest[0]!.startsWith("-")) {
      console.error("usage: thunderjar show <test case | execution | container run> [--data-dir <dir>]");
      process.exitCode = 1;
    } else {
      console.log(await show(parsed.rest[0]!, { dataDir: parsed.values["--data-dir"] }));
    }
  } else if (command === "remeasure") {
    const parsed = takeOptions(args, ["--data-dir"]);
    if (parsed === "invalid" || parsed.rest.length !== 1 || parsed.rest[0]!.startsWith("-")) {
      console.error("usage: thunderjar remeasure <test case | execution> [--data-dir <dir>]");
      process.exitCode = 1;
    } else {
      console.log(await remeasure(parsed.rest[0]!, { dataDir: parsed.values["--data-dir"] }));
    }
  } else {
    if (command !== undefined) console.error(`unknown command: ${command}`);
    console.error(USAGE);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
