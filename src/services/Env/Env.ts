/**
 * What the command was started with: facts fixed before it runs, as one plain object. It has no
 * methods; a test writes the values, or uses FakeEnv for safe defaults, e.g.
 * `{ cwd: scenario("0202"), variables: { ANTHROPIC_API_KEY: "test-key" } }`.
 * `variables: {}` means none are set, not "inherit mine".
 */
export type Env = {
  /** The folder the command was run in. */
  cwd: string;
  /** The environment variables. */
  variables: Record<string, string | undefined>;
  /** Where Thunderjar's own files are installed. */
  thunderjarDir?: string;
  /** THUNDERJAR_CONCURRENCY: the most containers at once. Undefined if unset, or not a whole number from 1. */
  concurrency?: number;
  /** THUNDERJAR_UPLOAD_BACKLOG_CAP: new runs wait while more committed images than this are still to upload. 4 by default. */
  uploadBacklogCap: number;
  /** TMPDIR, or `/tmp`: where temporary folders are made. No trailing slash. */
  tmpDir: string;
};

const DEFAULT_UPLOAD_BACKLOG_CAP = 4;

/** `text` as a whole number, or undefined: digits only, so "3 ", "1.5" and "1e3" aren't one. */
const wholeNumber = (text: string | undefined): number | undefined => (text !== undefined && /^\d+$/.test(text) ? Number(text) : undefined);

/** The Env of a command run in `cwd` with `variables`: its settings are read from them here, once. */
export function readEnv(cwd: string, variables: Record<string, string | undefined>): Env {
  const concurrency = wholeNumber(variables.THUNDERJAR_CONCURRENCY);
  return {
    cwd,
    variables,
    concurrency: concurrency !== undefined && concurrency >= 1 ? concurrency : undefined,
    uploadBacklogCap: wholeNumber(variables.THUNDERJAR_UPLOAD_BACKLOG_CAP) ?? DEFAULT_UPLOAD_BACKLOG_CAP,
    // `/` alone stays `/`: stripping its slash would leave nothing.
    tmpDir: (variables.TMPDIR || "/tmp").replace(/(?<=.)\/+$/, ""),
  };
}

/** The real Env: this process's folder and variables. The only place that should read them. */
export function createEnvService(): Env {
  return readEnv(process.cwd(), { ...Bun.env });
}
