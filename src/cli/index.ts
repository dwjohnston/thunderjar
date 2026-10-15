#!/usr/bin/env bun
import { generate } from "../commands/generate.ts";
import { init } from "../commands/init.ts";
import { plan } from "../commands/plan.ts";
import { run } from "../commands/run.ts";

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
  } else {
    console.log("hello world!");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
