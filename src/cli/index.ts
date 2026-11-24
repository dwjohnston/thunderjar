#!/usr/bin/env bun
// The composition root's caller: the only place that reads the process's arguments, environment
// and folder, builds the real services, and sets the exit code.
import { harnessArg, isHook, runHookCommand } from "./commands/capture/hook.ts";

const args = process.argv.slice(2);
const [command, hook, ...rest] = args;
// A capture hook runs twice a turn, so it skips loading the rest of the CLI: see commands/capture/hook.ts.
if (command === "capture" && isHook(hook)) {
  await runHookCommand(hook, harnessArg(rest));
} else {
  const { createApp } = await import("./app.ts");
  const { cliDockerService, localRuntime } = await import("../docker/docker.ts");
  const { systemIds } = await import("../execution/ids.ts");
  const { processIo } = await import("../io/io.ts");
  const { configureLog } = await import("../log/logger.ts");
  const { systemClock } = await import("../time/clock.ts");
  const env = process.env;
  const app = createApp({
    clock: systemClock,
    docker: cliDockerService(localRuntime(env), env),
    ids: systemIds(systemClock),
    io: processIo(),
    launch: { cwd: process.cwd(), env },
    log: configureLog,
  });
  const code = await app.cli(args);
  // Interrupted: ends now, whatever is still running or pending, as it always has.
  if (code === 130 || code === 143) process.exit(code);
  // Otherwise not process.exit: `view` keeps serving after its command returns, and the commands
  // not yet on createApp set process.exitCode themselves.
  if (code !== 0) process.exitCode = code;
}
