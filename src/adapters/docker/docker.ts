// The Docker seam — spec/120-test-boundaries.md#principles. Everything Thunderjar asks of
// Docker goes through a `Docker`; the real one runs the `docker` CLI. Tests swap the binary,
// not the code path: `THUNDERJAR_DOCKER` names the executable to run in place of `docker`, such
// as fixtureTests/fake-docker.ts, which records the commands it is given
// (spec/120-test-boundaries.md#2-cli-with-recording-adapters).
//
// Running containers from a prerun image is a later story; so far Thunderjar only builds them.

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
}

export class DockerBuildError extends Error {
  constructor(
    readonly ref: string,
    readonly exitCode: number,
  ) {
    super(`docker build of ${ref} exited ${exitCode}`);
  }
}

/**
 * Runs `binary` with `args`. "collect" discards stdout and collects stderr; "stderr" passes all
 * of its output to our stderr, keeping stdout for Thunderjar's own.
 */
function docker(binary: string, args: string[], output: "collect" | "stderr") {
  return new Promise<{ exitCode: number; stderr: string }>((resolve, reject) => {
    const stdio = output === "collect" ? (["ignore", "ignore", "pipe"] as const) : (["ignore", 2, 2] as const);
    const child = spawn(binary, args, { stdio: [...stdio] });
    let stderr = "";
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
  });
}

/** A Docker that runs the `docker` CLI, or `binary` in its place. */
export function dockerCli(binary: string = process.env.THUNDERJAR_DOCKER || "docker"): Docker {
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
  };
}
