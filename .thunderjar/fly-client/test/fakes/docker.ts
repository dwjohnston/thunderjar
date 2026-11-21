// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// A stand-in for the Docker CLI, for the client's tests. It logs every call, and:
//
// - `version` prints a server version, as a daemon that's up does
// - `ps --quiet` prints the IDs in $FAKE_DIR/running, one a line
// - any command with --fake-hang waits until it's killed
// - anything else copies its stdin to stdout, says so on stderr, and exits with the code in
//   $FAKE_DIR/exit-code, or 0

import { fakeDir, logCall } from "./state.ts";

const args = Bun.argv.slice(2);
await logCall("docker", args);
const command = args[0] === "-H" ? args.slice(2) : args;

if (command[0] === "version") {
  console.log("29.0.0");
} else if (command[0] === "ps" && command.includes("--quiet")) {
  const running = Bun.file(`${fakeDir}/running`);
  if (await running.exists()) process.stdout.write(await running.text());
} else if (command.includes("--fake-hang")) {
  await Bun.write(`${fakeDir}/hanging`, String(process.pid));
  await new Promise(() => setInterval(() => {}, 1000));
} else {
  process.stdout.write(await Bun.stdin.text());
  process.stderr.write(`fake docker ran: ${command.join(" ")}\n`);
  const exitCode = Bun.file(`${fakeDir}/exit-code`);
  process.exit((await exitCode.exists()) ? Number(await exitCode.text()) : 0);
}
