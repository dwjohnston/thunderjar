// The measurement context over a measurement container: one started from a postrun image, for
// a container run's measurements, and removed once they're taken. The instrument's logic runs on the host; what it
// asks of the context runs in the container, so nothing it writes reaches the postrun image.
import type { MeasurementContext, Transcript, TranscriptDeclaration } from "../api/declarations.ts";
import { type DockerRuntime, localRuntime } from "../docker/docker.ts";
import { openShellSession } from "../docker/shellSession.ts";

/**
 * Where paths, globs and commands resolve for an instrument that has no container: the default
 * working directory. One with a container uses its image's, where the agent worked.
 */
export const WORKDIR = "/workspace";

/** A MeasurementContext of its own, for one measurement; `close` removes its container. */
export type OpenedMeasurementContext = MeasurementContext & {
  close(): Promise<void>;
};

/** What was recorded of a container run, that an instrument can read without its container. */
export type Recorded = Pick<MeasurementContext, "harnessResult" | "reply" | "replies">;

/**
 * A context over only what was recorded of a container run, for an instrument that doesn't use
 * a measurement container. Asking it for the container's files or commands is an error.
 */
export function recordedContext({ harnessResult, reply, replies }: Recorded): OpenedMeasurementContext {
  const noContainer = async (): Promise<never> => {
    throw new Error("this instrument has no measurement container: it reads only what was recorded of the run");
  };
  return {
    workdir: WORKDIR,
    harnessResult,
    reply,
    replies,
    exec: noContainer,
    readFile: noContainer,
    writeFile: noContainer,
    glob: noContainer,
    transcript: noContainer,
    close: async () => {},
  };
}

/** `text` as one word of a shell command. */
const word = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * Starts the measurement container `container` from `postrunImage`, and returns a context over it.
 * Each thing asked of it is one command in a shell session in the container: on a remote runtime,
 * one round trip, not a `docker exec` of several. `recorded` is what was recorded of the container
 * run: what the harness's `cli` left, or "" if nothing, and the agent's replies, or why there are
 * none. Throws a DockerContainerError if the container can't be started.
 *
 * `secretEnv` names the run's secret variables, its harness's `requiredEnv` and its test case's
 * `secretEnv`: the postrun image has them blank, so each is passed in by name, its value from
 * Thunderjar's own environment. Its test case's `env` needs nothing: the postrun image keeps it.
 */
export async function openMeasurementContext(
  postrunImage: string,
  container: string,
  { harnessResult, reply, replies }: Recorded,
  runtime: DockerRuntime = localRuntime(),
  secretEnv: string[] = [],
  transcript?: TranscriptDeclaration,
): Promise<OpenedMeasurementContext> {
  // Safe to give secrets to: a measurement container is removed once its measurements are taken,
  // and never committed, so nothing it's given can reach an image.
  const session = await openShellSession(postrunImage, container, runtime, secretEnv);
  // Where the agent worked: the postrun image's working directory, as its prerun image's last WORKDIR set it.
  const workdir = session.workdir.startsWith("/") ? session.workdir : WORKDIR;
  const mustRun = async (what: string, command: string, stdin?: string) => {
    const result = await session.run(command, stdin);
    if (result.exitCode !== 0) throw new Error(`${what}: ${result.stderr.trim() || `exited ${result.exitCode}`}`);
    return result.stdout;
  };
  const readFile = (path: string) => mustRun(`can't read ${path}`, `cat -- ${word(path)}`);
  // Read once, for every measurement that asks.
  let transcribed: Promise<Transcript> | undefined;
  return {
    workdir,
    harnessResult,
    reply,
    replies,
    exec: (command) => session.run(command),
    readFile,
    async writeFile(path, contents) {
      await mustRun(`can't write ${path}`, `mkdir -p -- "$(dirname -- ${word(path)})" && cat > ${word(path)}`, contents);
    },
    async glob(pattern) {
      const found = await mustRun(`can't list the files in ${workdir}`, "find . \\( -type f -o -type l \\)");
      const glob = new Bun.Glob(pattern);
      return found
        .split("\n")
        .filter(Boolean)
        .map((path) => path.replace(/^\.\//, ""))
        .filter((path) => glob.match(path))
        .toSorted();
    },
    transcript: () => (transcribed ??= readTranscript(transcript, workdir, mustRun, readFile)),
    close: () => session.close(),
  };
}

/** Where `find` starts for `pattern`, an absolute glob: its folders before the first with a glob character in it. */
function globBase(pattern: string): string {
  const segments = pattern.split("/");
  const first = segments.findIndex((segment) => /[*?[{]/.test(segment));
  return (first === -1 ? segments.slice(0, -1) : segments.slice(0, first)).join("/") || "/";
}

/**
 * The transcript `declaration` reads from the measurement container: its globs, `~` the home of
 * the image's user, and relative ones in `workdir`, matched against the files there, each file's
 * text given to its `parse`.
 */
async function readTranscript(
  declaration: TranscriptDeclaration | undefined,
  workdir: string,
  mustRun: (what: string, command: string) => Promise<string>,
  readFile: (path: string) => Promise<string>,
): Promise<Transcript> {
  if (declaration === undefined) return { outcome: "unavailable", reason: "its harness declares no transcript" };
  const home = await mustRun("can't find the home folder", `printf '%s' "$HOME"`);
  const patterns = declaration.files.map((pattern) =>
    pattern === "~" || pattern.startsWith("~/") ? `${home}${pattern.slice(1)}` : pattern.startsWith("/") ? pattern : `${workdir}/${pattern}`,
  );
  // A folder that isn't there has no files, rather than failing.
  const listing = [...new Set(patterns.map(globBase))].map((base) => `find ${word(base)} -type f 2>/dev/null`).join("; ");
  const found = await mustRun("can't list the transcript's files", `${listing}; true`);
  const globs = patterns.map((pattern) => new Bun.Glob(pattern));
  const paths = [...new Set(found.split("\n").filter(Boolean))].filter((path) => globs.some((glob) => glob.match(path))).toSorted();
  if (paths.length === 0) return { outcome: "unavailable", reason: `no file matched its transcript's files: ${declaration.files.join(", ")}` };
  const files = [];
  for (const path of paths) files.push({ path, text: await readFile(path) });
  try {
    return { outcome: "collected", events: declaration.parse(files) };
  } catch (error) {
    return { outcome: "unavailable", reason: `unparseable: ${error instanceof Error ? error.message : String(error)}` };
  }
}
