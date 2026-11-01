// The measurement context over a measurement container: one started from a postrun image, for
// one measurement, and removed once it's taken. The instrument's logic runs on the host; what it
// asks of the context runs in the container, so nothing it writes reaches the postrun image.
import type { MeasurementContext } from "../api/declarations.ts";
import { execInContainer, removeContainer, startContainer } from "../docker/docker.ts";

/** Where in the container paths, globs and commands resolve: where the agent worked. */
export const WORKDIR = "/workspace";

/** A MeasurementContext of its own, for one measurement; `close` removes its container. */
export type OpenedMeasurementContext = MeasurementContext & {
  close(): Promise<void>;
};

/**
 * Starts the measurement container `container` from `postrunImage`, and returns a context over it.
 * `harnessResult` is what the harness's `cli` left, or "" if nothing. Throws a DockerContainerError
 * if the container can't be started.
 */
export async function openMeasurementContext(postrunImage: string, container: string, harnessResult: string): Promise<OpenedMeasurementContext> {
  try {
    await startContainer(postrunImage, container);
  } catch (error) {
    await removeContainer(container).catch(() => {});
    throw error;
  }
  const run = (command: string[], stdin?: string) => execInContainer(container, WORKDIR, command, stdin);
  const mustRun = async (what: string, command: string[], stdin?: string) => {
    const result = await run(command, stdin);
    if (result.exitCode !== 0) throw new Error(`${what}: ${result.stderr.trim() || `exited ${result.exitCode}`}`);
    return result.stdout;
  };
  return {
    workdir: WORKDIR,
    harnessResult,
    exec: (command) => run(["sh", "-c", command]),
    readFile: (path) => mustRun(`can't read ${path}`, ["cat", "--", path]),
    async writeFile(path, contents) {
      await mustRun(`can't write ${path}`, ["sh", "-c", 'mkdir -p -- "$(dirname -- "$1")" && cat > "$1"', "sh", path], contents);
    },
    async glob(pattern) {
      const found = await mustRun(`can't list the files in ${WORKDIR}`, ["find", ".", "(", "-type", "f", "-o", "-type", "l", ")"]);
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
