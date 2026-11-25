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
};

/** The real Env: this process's folder and variables. The only place that should read them. */
export function createEnvService(): Env {
  return { cwd: process.cwd(), variables: { ...Bun.env } };
}
