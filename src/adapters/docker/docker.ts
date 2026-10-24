// The Docker seam — spec/120-test-boundaries.md#principles. Everything Thunderjar asks of
// Docker goes through a `Docker`; the real one runs the `docker` CLI. Tests swap the binary,
// not the code path: `THUNDERJAR_DOCKER` names the executable to run in place of `docker`, such
// as fixtureTests/fake-docker.ts, which records the commands it is given
// (spec/120-test-boundaries.md#2-cli-with-recording-adapters).
//
// Thunderjar builds prerun images, runs a container run in a container from one and commits it
// into a postrun image, and copies files out of a postrun image to measure it.

import { spawn } from "node:child_process";

export interface Docker {
  /** Why the Docker daemon can't be reached, or undefined when it can. */
  unreachable(): Promise<string | undefined>;
  imageExists(ref: string): Promise<boolean>;
  /**
   * Builds the Dockerfile in `contextDir` and tags the image `ref`. Docker's own output goes to
   * stderr. Throws if the build fails.
   */
  build(contextDir: string, ref: string): Promise<void>;
  /**
   * Runs `script` with `sh -c` in a new container named `name` from the image `ref`, and
   * leaves the container once it stops. Returns its stdout; its stderr goes to stderr.
   */
  run(ref: string, name: string, script: string): Promise<{ exitCode: number; stdout: string }>;
  /**
   * Commits the stopped container `name` into the image `ref`, with the entrypoint and command
   * of the image `like` (the one it ran from), so starting it doesn't run `run`'s script again.
   */
  commit(name: string, ref: string, like: string): Promise<void>;
  /** Creates, without starting it, a container named `name` from the image `ref`. */
  create(ref: string, name: string): Promise<void>;
  /** Copies `path` out of the container `name` to `dest` on the host, as `docker cp` does. */
  copyFrom(name: string, path: string, dest: string): Promise<void>;
  /** Removes the container `name`, stopped or not. */
  removeContainer(name: string): Promise<void>;
}

export class DockerBuildError extends Error {
  constructor(
    readonly ref: string,
    readonly exitCode: number,
  ) {
    super(`docker build of ${ref} exited ${exitCode}`);
  }
}

/** A docker command that exited non-zero, with what it wrote to stderr. */
export class DockerCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(`docker ${args[0]} exited ${exitCode}${stderr.trim() ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`);
  }
}

/**
 * Runs `binary` with `args`. "collect" discards stdout and collects stderr; "stderr" passes all
 * of its output to our stderr, keeping stdout for Thunderjar's own; "stdout" collects stdout and
 * passes stderr to ours.
 */
function docker(binary: string, args: string[], output: "collect" | "stderr" | "stdout") {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const stdio = {
      collect: ["ignore", "ignore", "pipe"] as const,
      stderr: ["ignore", 2, 2] as const,
      stdout: ["ignore", "pipe", 2] as const,
    }[output];
    const child = spawn(binary, args, { stdio: [...stdio] });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

/** A Docker that runs the `docker` CLI, or `binary` in its place. */
export function dockerCli(binary: string = process.env.THUNDERJAR_DOCKER || "docker"): Docker {
  /** Runs a command whose output isn't needed, throwing if it fails. */
  const must = async (args: string[]) => {
    const { exitCode, stderr } = await docker(binary, args, "collect");
    if (exitCode !== 0) throw new DockerCommandError(args, exitCode, stderr);
  };
  return {
    async unreachable() {
      try {
        const { exitCode, stderr } = await docker(binary, ["version", "--format", "{{.Server.Version}}"], "collect");
        if (exitCode === 0) return undefined;
        return stderr.trim().split("\n").at(-1) || `\`${binary} version\` exited ${exitCode}`;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return `\`${binary}\` was not found`;
        throw error;
      }
    },
    async imageExists(ref) {
      return (await docker(binary, ["image", "inspect", "--format", "{{.Id}}", ref], "collect")).exitCode === 0;
    },
    async build(contextDir, ref) {
      const { exitCode } = await docker(binary, ["build", "--tag", ref, contextDir], "stderr");
      if (exitCode !== 0) throw new DockerBuildError(ref, exitCode);
    },
    async run(ref, name, script) {
      // The image's own entrypoint isn't run: the script is all that runs.
      const { exitCode, stdout } = await docker(binary, ["run", "--name", name, "--entrypoint", "sh", ref, "-c", script], "stdout");
      return { exitCode, stdout };
    },
    async commit(name, ref, like) {
      const format = "{{json .Config.Entrypoint}}\t{{json .Config.Cmd}}";
      const inspected = await docker(binary, ["image", "inspect", "--format", format, like], "stdout");
      if (inspected.exitCode !== 0) throw new DockerCommandError(["image", "inspect", like], inspected.exitCode, "");
      const [entrypoint, cmd] = inspected.stdout.trim().split("\t");
      // `ENTRYPOINT []` is ignored; `[""]` clears it.
      const changes = [`ENTRYPOINT ${entrypoint === "null" ? '[""]' : entrypoint}`, `CMD ${cmd === "null" ? '["sh"]' : cmd}`];
      await must(["commit", ...changes.flatMap((change) => ["--change", change]), name, ref]);
    },
    create: (ref, name) => must(["create", "--name", name, "--entrypoint", "sh", ref]),
    copyFrom: (name, path, dest) => must(["cp", `${name}:${path}`, dest]),
    removeContainer: (name) => must(["rm", "--force", name]),
  };
}
