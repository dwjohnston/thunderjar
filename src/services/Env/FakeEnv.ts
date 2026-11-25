import type { Env } from "./Env";

/**
 * An Env for tests: a made-up folder and no variables, so nothing leaks in from the machine
 * running the tests. Pass only what the test cares about, e.g.
 * `FakeEnv({ variables: { ANTHROPIC_API_KEY: "test-key" } })`. Settings are given as fields,
 * e.g. `FakeEnv({ concurrency: 2 })`: they aren't read from `variables`.
 */
export function FakeEnv(overrides: Partial<Env> = {}): Env {
  return { cwd: "/fake/cwd", variables: {}, uploadBacklogCap: 4, tmpDir: "/tmp", ...overrides };
}
