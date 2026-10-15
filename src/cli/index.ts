#!/usr/bin/env bun
import { executions } from "../commands/executions.ts";
import { generate } from "../commands/generate.ts";
import { init } from "../commands/init.ts";
import { plan } from "../commands/plan.ts";
import { run } from "../commands/run.ts";
import { show } from "../commands/show.ts";

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "init") {
    const { created, skipped } = await init(process.cwd());
    for (const f of created) console.log(`created  .thunderjar/${f}`);
    for (const f of skipped) console.log(`exists   .thunderjar/${f}`);
  } else if (command === "generate") {
    const { path } = await generate();
    console.log(`generated ${path}`);
  } else if (command === "plan") {
    const [name] = args;
    if (!name) {
      console.error("usage: thunderjar plan <test case>");
      process.exitCode = 1;
    } else {
      console.log(await plan(name));
    }
  } else if (command === "run") {
    const flags = args.filter((a) => a.startsWith("-"));
    const [name, ...extra] = args.filter((a) => !a.startsWith("-"));
    if (!name || extra.length > 0 || flags.some((f) => f !== "--dry-run")) {
      console.error("usage: thunderjar run <test case> [--dry-run]");
      process.exitCode = 1;
    } else {
      await run(name, { dryRun: flags.includes("--dry-run") });
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
