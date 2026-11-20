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
// refs/thunderjar/capture/<session>/ or, with THUNDERJAR_CAPTURE_STORE=branch, on the branch
// thunderjar/capture/<session>, to triage and replay as evals. `install` and `uninstall` turn it on and
// off for a harness, `list` shows the captures, `show` prints one, `push` shares them, and `import` copies branches into
// refs. `prompt` and `stop` are what the hooks run, left out of --help.
import { Command, Option } from "commander";
import { HARNESSES, type HarnessId } from "../../../capture/adapters.ts";
import { importBranches } from "../../../capture/branch.ts";
import { git, repoRoot } from "../../../capture/git.ts";
import { startedIn } from "../../../capture/store.ts";
import { formatTable, listCaptures } from "../../../capture/list.ts";
import { localStores, pushArgs, sessionPushArgs } from "../../../capture/push.ts";
import { formatCapture, showCapture } from "../../../capture/show.ts";
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
    "Record every coding-agent session in this repository as git refs under refs/thunderjar/capture/, for Claude Code, Codex, Copilot CLI and OpenCode: each prompt's starting code, and each turn's result. With THUNDERJAR_CAPTURE_STORE=branch, the default in Claude Code cloud sessions (CLAUDE_CODE_REMOTE=true), each session is a branch instead, thunderjar/capture/<session>, one commit per record, for remotes that take only branches.",
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
    .description("List the captured sessions, from refs and branches alike, each with a verdict, to triage which would make good evals.")
    .addOption(jsonOption())
    .action((options: { json?: boolean }) => {
      const dir = root();
      if (dir === undefined) return;
      const captures = listCaptures(dir);
      if (options.json) printJson(captures);
      else print(formatTable(captures));
    });
  capture
    .command("show")
    .description("Print one captured session's records, from whichever store holds it: a header, then each record as its subject and JSON. Leaves out the snapshot trees.")
    .argument("<session>", "the session ID, as `capture list` shows it")
    .addOption(jsonOption())
    .action((session: string, options: { json?: boolean }) => {
      const dir = root();
      if (dir === undefined) return;
      const shown = showCapture(dir, session);
      if (shown === null) {
        printError(`No capture of session ${session}. \`thunderjar capture list\` shows the captures, and \`thunderjar capture pull\` fetches them.`);
        process.exitCode = 1;
        return;
      }
      if (options.json) printJson(shown);
      else print(formatCapture(shown));
    });
  /** Pushes the captures to `remote`, or with `fetch`, fetches them from it. */
  const transfer = (remote: string, fetch: boolean, dryRun: boolean | undefined, session?: string) => {
    const dir = root();
    if (dir === undefined) return;
    let args: string[] | null;
    if (session === undefined) args = pushArgs({ fetch, remote }, localStores(dir));
    else {
      const store = startedIn(dir, session);
      if (store === null) {
        printError(`No capture of session ${session}. \`thunderjar capture list\` shows the captures.`);
        process.exitCode = 1;
        return;
      }
      args = sessionPushArgs(remote, session, store);
    }
    if (args === null) return print("No captures to push.");
    if (dryRun) return print(["git", ...args].join(" "));
    try {
      git(dir, args);
      print(fetch ? `Fetched the captures from ${remote}.` : `Pushed the captures to ${remote}.`);
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };
  capture
    .command("push")
    .description(
      "Push every capture to a remote, refs and branches alike. Captures are never moved, and capture branches only grow, so it never needs --force. `capture pull` fetches them.",
    )
    .argument("[remote]", "the remote", "origin")
    // Kept for scripts written before `capture pull`.
    .addOption(new Option("--fetch", "fetch the captures instead of pushing them: use `capture pull`").hideHelp())
    .option("--session <id>", "push only this session's capture")
    .option("--dry-run", "print the git command instead of running it")
    .action((remote: string, options: { fetch?: boolean; dryRun?: boolean; session?: string }) =>
      transfer(remote, options.fetch ?? false, options.dryRun, options.session),
    );
  capture
    .command("pull")
    .description("Fetch every capture from a remote, refs and branches alike, e.g. ones pushed from another machine or a cloud session.")
    .argument("[remote]", "the remote", "origin")
    .option("--dry-run", "print the git command instead of running it")
    .action((remote: string, options: { dryRun?: boolean }) => transfer(remote, true, options.dryRun));
  capture
    .command("import")
    .description(
      "Copy the captures on thunderjar/capture/<session> branches into refs/thunderjar/capture/<session>/, as the hooks write them by default. Skips refs that exist, so it can run again, and leaves the branches alone.",
    )
    .addOption(jsonOption())
    .action((options: { json?: boolean }) => {
      const dir = root();
      if (dir === undefined) return;
      const result = importBranches(dir);
      if (options.json) return printJson(result);
      for (const ref of result.imported) print(`imported ${ref}`);
      print(`${result.imported.length} imported, ${result.skipped.length} already there.`);
    });
  for (const hook of HOOKS) capture.addCommand(hookCommand(hook), { hidden: true });
  return capture;
}
