/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// A shell session in a container: one `docker run --interactive`, whose shell then runs each
// command it's sent, one after another, over that one connection. For a runtime far away, where
// each `docker` command costs several round trips (on Fly, from Europe or the US, about 1.8 s a
// `docker exec`), a command in a session costs one.
//
// The container runs SESSION_SCRIPT. Over its stdin, each command is a line `<command bytes>
// <stdin bytes>`, then the command, then its stdin. Over its stdout, the session first writes
// `ready <working directory>`, then for each command a line `<exit code> <stdout bytes> <stderr
// bytes>`, then its stdout, then its stderr. Each command runs with `sh`, in the image's working
// directory. Its files are kept in /tmp, outside the working directory.
import { moduleLogger } from "../log/logger.ts";
import { DockerContainerError, type DockerRuntime, type ExecResult, reasonOf, removeContainer } from "./docker.ts";

const log = moduleLogger("docker");

/** What the session's container runs: reads commands from stdin, and runs each. Only POSIX `sh`, `dd`, `wc` and `cat`. */
export const SESSION_SCRIPT = [
  "d=/tmp/.thunderjar-session",
  'mkdir -p "$d" || exit 1',
  `printf 'ready %s\\n' "$(pwd)"`,
  "while read -r c i; do",
  // `dd bs=1` reads exactly that many bytes of a pipe, leaving the next command's line for `read`.
  '  dd bs=1 count="$c" of="$d/cmd" 2>/dev/null',
  '  dd bs=1 count="$i" of="$d/in" 2>/dev/null',
  '  sh "$d/cmd" <"$d/in" >"$d/out" 2>"$d/err"',
  "  code=$?",
  `  printf '%s %s %s\\n' "$code" "$(wc -c <"$d/out")" "$(wc -c <"$d/err")"`,
  '  cat "$d/out" "$d/err"',
  "done",
].join("\n");

/** How long `close` waits for the container to end once its stdin is closed, before it removes it. */
const CLOSE_TIMEOUT_MS = 30_000;

/** A shell session in a running container. */
export type ShellSession = {
  /** The image's working directory, where each command runs. */
  workdir: string;
  /** Runs `command` with `sh`, with `stdin` as its input, after any command already sent. Throws a DockerContainerError if the session has ended. */
  run(command: string, stdin?: string): Promise<ExecResult>;
  /** Ends the session: its container is removed. */
  close(): Promise<void>;
};

/** Reads lines and runs of bytes from `stream`. Each returns null once the stream has ended. */
export function framedReader(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  let buffer = new Uint8Array(0);
  let ended = false;
  const more = async (): Promise<boolean> => {
    if (ended) return false;
    const { done, value } = await reader.read();
    if (done) {
      ended = true;
      return false;
    }
    const joined = new Uint8Array(buffer.length + value.length);
    joined.set(buffer);
    joined.set(value, buffer.length);
    buffer = joined;
    return true;
  };
  const take = (length: number) => {
    const taken = buffer.slice(0, length);
    buffer = buffer.slice(length);
    return taken;
  };
  return {
    async line(): Promise<string | null> {
      let newline: number;
      while ((newline = buffer.indexOf(10)) === -1) if (!(await more())) return null;
      return new TextDecoder().decode(take(newline + 1)).slice(0, -1);
    },
    async bytes(length: number): Promise<Uint8Array | null> {
      while (buffer.length < length) if (!(await more())) return null;
      return take(length);
    },
  };
}

/**
 * Starts the container `name` from `image` in `runtime`, running a shell session, and returns it
 * once it's ready. Throws a DockerContainerError, with Docker's reason, if it can't be started.
 */
export async function openShellSession(image: string, name: string, runtime: DockerRuntime): Promise<ShellSession> {
  const args = ["run", "--rm", "--interactive", "--name", name, "--pull", runtime.pull, "--entrypoint", "sh", image, "-c", SESSION_SCRIPT];
  const startedAt = Date.now();
  const child = Bun.spawn([...runtime.command, ...args], { env: Bun.env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const stderr = new Response(child.stderr).text();
  const out = framedReader(child.stdout);
  /** Why the session ended, from what Docker wrote to stderr. */
  const ended = async (what?: string) => {
    const exitCode = await child.exited;
    const reason = reasonOf(await stderr) || `${[...runtime.command, "run"].join(" ")} exited ${exitCode}`;
    log.warn({ container: name, image, exitCode, stderr: await stderr }, "shell session ended");
    return new DockerContainerError(what === undefined ? reason : `${what}: ${reason}`);
  };

  const ready = await out.line();
  if (ready === null || !ready.startsWith("ready ")) {
    await removeContainer(name, runtime).catch(() => {});
    throw await ended();
  }
  const workdir = ready.slice("ready ".length);
  log.debug({ container: name, image, workdir, ms: Date.now() - startedAt }, "started a shell session");

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let queue: Promise<unknown> = Promise.resolve();
  const send = async (command: string, stdin: string): Promise<ExecResult> => {
    const [body, input] = [encoder.encode(command), encoder.encode(stdin)];
    const sentAt = Date.now();
    try {
      child.stdin.write(`${body.length} ${input.length}\n`);
      child.stdin.write(body);
      child.stdin.write(input);
      await child.stdin.flush();
    } catch {
      throw await ended(`the shell session in ${name} has ended`);
    }
    const header = await out.line();
    const [exitCode, outLength, errLength] = (header ?? "").trim().split(/\s+/).map(Number);
    if (header === null || exitCode === undefined || Number.isNaN(exitCode) || !Number.isInteger(outLength) || !Number.isInteger(errLength)) {
      throw await ended(`the shell session in ${name} has ended`);
    }
    const [stdoutBytes, stderrBytes] = [await out.bytes(outLength as number), await out.bytes(errLength as number)];
    if (stdoutBytes === null || stderrBytes === null) throw await ended(`the shell session in ${name} has ended`);
    const result = { exitCode, stdout: decoder.decode(stdoutBytes), stderr: decoder.decode(stderrBytes) };
    log.debug({ container: name, command, exitCode, stderr: result.stderr, ms: Date.now() - sentAt }, "ran command in shell session");
    return result;
  };

  return {
    workdir,
    run(command, stdin = "") {
      const result = queue.then(() => send(command, stdin));
      queue = result.catch(() => {});
      return result;
    },
    async close() {
      await queue;
      try {
        child.stdin.end();
      } catch {
        // Already ended.
      }
      // A timer that's cleared once it has exited, so it doesn't keep the process alive.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const exited = await Promise.race([
        child.exited.then(() => true),
        new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), CLOSE_TIMEOUT_MS))),
      ]);
      clearTimeout(timer);
      if (!exited) {
        child.kill();
        await removeContainer(name, runtime);
      }
    },
  };
}
