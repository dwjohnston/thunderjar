// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// A stand-in for OpenSSH's `ssh`, for the client's tests. The shared connection is open while
// $FAKE_DIR/ssh-open exists: `-fN` opens it, `-O exit` closes it, `-O check` says if it's open.

import { fakeDir, logCall } from "./state.ts";

const args = Bun.argv.slice(2);
await logCall("ssh", args);
const open = Bun.file(`${fakeDir}/ssh-open`);
const control = args[args.indexOf("-O") + 1];

if (args.includes("-O") && control === "check") {
  process.exit((await open.exists()) ? 0 : 255);
} else if (args.includes("-O") && control === "exit") {
  if (await open.exists()) await open.delete();
} else if (args.includes("-fN")) {
  await Bun.write(open, "open");
} else {
  console.error(`fake ssh: unexpected command: ${args.join(" ")}`);
  process.exit(1);
}
