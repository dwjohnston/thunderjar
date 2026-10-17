#!/usr/bin/env bun
import { build } from "../commands/build/build.ts";
import { executions } from "../commands/executions/executions.ts";
import { generate } from "../commands/generate/generate.ts";
import { init } from "../commands/init/init.ts";
import { plan } from "../commands/plan/plan.ts";
import { run } from "../commands/run/run.ts";
import { show } from "../commands/show/show.ts";

const [command, ...args] = process.argv.slice(2);

/**
 * `args` without `--image-prefix <name>`, and the name, or `"invalid"` if the flag is given
 * without a name or more than once.
 */
function takeImagePrefix(args: string[]): { rest: string[]; imagePrefix?: string } | "invalid" {
  const at = args.indexOf("--image-prefix");
  if (at === -1) return { rest: args };
  const imagePrefix = args[at + 1];
  const rest = args.toSpliced(at, 2);
  if (!imagePrefix || imagePrefix.startsWith("-") || rest.includes("--image-prefix")) return "invalid";
  return { rest, imagePrefix };
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
    const parsed = takeImagePrefix(args);
    if (parsed === "invalid" || parsed.rest.length !== 1 || parsed.rest[0]!.startsWith("-")) {
      console.error("usage: thunderjar plan <test case> [--image-prefix <name>]");
      process.exitCode = 1;
    } else {
      console.log(await plan(parsed.rest[0]!, process.cwd(), { repository: parsed.imagePrefix }));
    }
  } else if (command === "run") {
    const parsed = takeImagePrefix(args);
    const rest = parsed === "invalid" ? [] : parsed.rest;
    const flags = rest.filter((a) => a.startsWith("-"));
    const [name, ...extra] = rest.filter((a) => !a.startsWith("-"));
    if (parsed === "invalid" || !name || extra.length > 0 || flags.some((f) => f !== "--dry-run")) {
      console.error("usage: thunderjar run <test case> [--dry-run] [--image-prefix <name>]");
      process.exitCode = 1;
    } else {
      await run(name, { dryRun: flags.includes("--dry-run"), repository: parsed.imagePrefix });
    }
  } else if (command === "build") {
    const parsed = takeImagePrefix(args);
    const rest = parsed === "invalid" ? [] : parsed.rest;
    const flags = rest.filter((a) => a.startsWith("-"));
    const [name, ...extra] = rest.filter((a) => !a.startsWith("-"));
    if (parsed === "invalid" || !name || extra.length > 0 || flags.some((f) => f !== "--dry-run")) {
      console.error("usage: thunderjar build <test case> [--dry-run] [--image-prefix <name>]");
      process.exitCode = 1;
    } else {
      await build(name, { dryRun: flags.includes("--dry-run"), repository: parsed.imagePrefix });
    }
  } else if (command === "executions") {
    if (args.length > 1 || args.some((a) => a.startsWith("-"))) {
      console.error("usage: thunderjar executions [<test case>]");
      process.exitCode = 1;
    } else {
      console.log(await executions(args[0]));
    }
  } else if (command === "show") {
    if (args.length !== 1 || args[0]!.startsWith("-")) {
      console.error("usage: thunderjar show <test case | execution | container run>");
      process.exitCode = 1;
    } else {
      console.log(await show(args[0]!));
    }
  } else {
    console.log("hello world!");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
