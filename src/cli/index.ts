#!/usr/bin/env bun
import { init } from "../commands/init.ts";

const [command] = process.argv.slice(2);

if (command === "init") {
  const { created, skipped } = await init(process.cwd());
  for (const f of created) console.log(`created  .thunderjar/${f}`);
  for (const f of skipped) console.log(`exists   .thunderjar/${f}`);
} else {
  console.log("hello world!");
}
