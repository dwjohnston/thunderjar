/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// `thunderjar capture`: record every coding-agent session in a repository as git refs, under
// refs/thunderjar/capture/<session>/, to triage and replay as evals. `install` and `uninstall` turn it
// on and off for a harness, `list` shows the captures, and `push` shares them. `prompt` and `stop` are
// what the hooks run, left out of --help.
import { Command, Option } from "commander";
import { HARNESSES, type HarnessId } from "../../../capture/adapters.ts";
import { repoRoot } from "../../../capture/git.ts";
import { formatTable, listCaptures } from "../../../capture/list.ts";
import { push, pushArgs } from "../../../capture/push.ts";
import { jsonOption } from "../../json.ts";
import { print, printError, printJson, printWarning } from "../../output.ts";
import { HOOKS, runHookCommand } from "./hook.ts";
import { configPath, DEFAULT_COMMAND, install, type Scope, uninstall } from "./install.ts";

const harnessOption = () => new Option("--harness <harness...>", "the harnesses, one or more").choices(HARNESSES).makeOptionMandatory();

/** The repository `cwd` is in, or exits 1 saying it isn't in one. */
function root(): string | undefined {
  const root = repoRoot(process.cwd());
  if (root === null) {
    printError("Not in a git repository: captures are kept in one.");
    process.exitCode = 1;
  }
  return root ?? undefined;
}

const paths = () => ({ root: repoRoot(process.cwd()), home: Bun.env.HOME ?? "~", env: Bun.env });

type InstallOptions = { harness: HarnessId[]; user?: boolean; command: string };

async function installCommand({ harness, user, command }: InstallOptions) {
  const scope: Scope = user ? "user" : "project";
  for (const id of harness) {
    const path = configPath(id, scope, paths());
    await install(id, path, command);
    print(`${id}: capture hooks in ${path}`);
    if (id === "codex") print("  Codex runs a hook only once you trust it: open `/hooks` in Codex and trust the thunderjar capture hooks.");
  }
  const executable = command.split(" ")[0]!;
  if (command === DEFAULT_COMMAND && !Bun.which(executable)) {
    printWarning("`thunderjar` isn't on PATH, and the hooks run it: install it globally with `bun add -g thunderjar`.");
  }
}

async function uninstallCommand({ harness, user }: Omit<InstallOptions, "command">) {
  const scope: Scope = user ? "user" : "project";
  for (const id of harness) {
    const path = configPath(id, scope, paths());
    print((await uninstall(id, path)) ? `${id}: removed the capture hooks from ${path}` : `${id}: no capture hooks in ${path}`);
  }
}

function hookCommand(hook: (typeof HOOKS)[number]): Command {
  return new Command(hook)
    .description(`What a harness's ${hook} hook runs: reads the hook's JSON on stdin, prints nothing, and always exits 0.`)
    .addOption(new Option("--harness <harness>", "the harness running the hook").choices(HARNESSES).makeOptionMandatory())
    .action(async (options: { harness: HarnessId }) => runHookCommand(hook, options.harness));
}

export function createCaptureCommand(): Command {
  const capture = new Command("capture").description(
    "Record every coding-agent session in this repository as git refs under refs/thunderjar/capture/, for Claude Code, Codex, Copilot CLI and OpenCode: each prompt's starting code, and each turn's result.",
  );
  capture
    .command("install")
    .description("Turn capture on for harnesses: writes their hook config into this repository, or with --user into your home folder. Set THUNDERJAR_CAPTURE=0 to switch it off for a while.")
    .addOption(harnessOption())
    .option("--user", "for every repository: write the config into your home folder")
    .addOption(new Option("--command <command>", "how the hooks run thunderjar").default(DEFAULT_COMMAND))
    .action(installCommand);
  capture
    .command("uninstall")
    .description("Turn capture off for harnesses: removes exactly what install added.")
    .addOption(harnessOption())
    .option("--user", "remove it from your home folder instead")
    .action(uninstallCommand);
  capture
    .command("list")
    .description("List the captured sessions, each with a verdict, to triage which would make good evals.")
    .addOption(jsonOption())
    .action((options: { json?: boolean }) => {
      const dir = root();
      if (dir === undefined) return;
      const captures = listCaptures(dir);
      if (options.json) printJson(captures);
      else print(formatTable(captures));
    });
  capture
    .command("push")
    .description("Push every capture to a remote, or fetch them from it with --fetch. Captures are never moved, so neither needs --force.")
    .argument("[remote]", "the remote", "origin")
    .option("--fetch", "fetch the captures instead of pushing them")
    .option("--dry-run", "print the git command instead of running it")
    .action((remote: string, options: { fetch?: boolean; dryRun?: boolean }) => {
      const pushOptions = { fetch: options.fetch ?? false, remote };
      if (options.dryRun) return print(["git", ...pushArgs(pushOptions)].join(" "));
      const dir = root();
      if (dir === undefined) return;
      try {
        push(dir, pushOptions);
        print(pushOptions.fetch ? `Fetched the captures from ${remote}.` : `Pushed the captures to ${remote}.`);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
  for (const hook of HOOKS) capture.addCommand(hookCommand(hook), { hidden: true });
  return capture;
}
