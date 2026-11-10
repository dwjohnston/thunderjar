// The measurement context over a measurement container: one started from a postrun image, for
// one measurement, and removed once it's taken. The instrument's logic runs on the host; what it
// asks of the context runs in the container, so nothing it writes reaches the postrun image.
import type { MeasurementContext } from "../api/declarations.ts";
import { execInContainer, removeContainer, startContainer } from "../docker/docker.ts";

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
    close: async () => {},
  };
}

/**
 * Starts the measurement container `container` from `postrunImage`, and returns a context over it.
 * `recorded` is what was recorded of the container run: what the harness's `cli` left, or "" if
 * nothing, and the agent's replies, or why there are none. Throws a DockerContainerError
 * if the container can't be started.
 */
export async function openMeasurementContext(
  postrunImage: string,
  container: string,
  { harnessResult, reply, replies }: Recorded,
): Promise<OpenedMeasurementContext> {
  try {
    await startContainer(postrunImage, container);
  } catch (error) {
    await removeContainer(container).catch(() => {});
    throw error;
  }
  // Where the agent worked: the postrun image's working directory, as its prerun image's last WORKDIR set it.
  let workdir: string;
  try {
    const pwd = await execInContainer(container, undefined, ["sh", "-c", "pwd"]);
    workdir = pwd.exitCode === 0 && pwd.stdout.trim().startsWith("/") ? pwd.stdout.trim() : WORKDIR;
  } catch (error) {
    await removeContainer(container).catch(() => {});
    throw error;
  }
  const run = (command: string[], stdin?: string) => execInContainer(container, workdir, command, stdin);
  const mustRun = async (what: string, command: string[], stdin?: string) => {
    const result = await run(command, stdin);
    if (result.exitCode !== 0) throw new Error(`${what}: ${result.stderr.trim() || `exited ${result.exitCode}`}`);
    return result.stdout;
  };
  return {
    workdir,
    harnessResult,
    reply,
    replies,
    exec: (command) => run(["sh", "-c", command]),
    readFile: (path) => mustRun(`can't read ${path}`, ["cat", "--", path]),
    async writeFile(path, contents) {
      await mustRun(`can't write ${path}`, ["sh", "-c", 'mkdir -p -- "$(dirname -- "$1")" && cat > "$1"', "sh", path], contents);
    },
    async glob(pattern) {
      const found = await mustRun(`can't list the files in ${workdir}`, ["find", ".", "(", "-type", "f", "-o", "-type", "l", ")"]);
      const glob = new Bun.Glob(pattern);
      return found
        .split("\n")
        .filter(Boolean)
        .map((path) => path.replace(/^\.\//, ""))
        .filter((path) => glob.match(path))
        .toSorted();
    },
    close: () => removeContainer(container),
  };
}
