/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// The ambient APIs src/ may not use: each reads the clock, randomness, the environment, the
// terminal or the outside world behind the caller's back. Each moves behind a service, the one its
// message names. See "Ambient APIs" in AGENTS.md.
//
// `bun run lint:generate` turns them into the overrides of .oxlintrc.json, relaxed per file by
// scripts/ambientAllowlist.ts.

/**
 * One banned API, by how oxlint finds it.
 *
 * - `global`: a global, e.g. `setTimeout`. `no-restricted-globals`.
 * - `property`: `object.property`, e.g. `Date.now`, including destructuring. `no-restricted-properties`.
 *   For `Bun.x`, also `import { x } from "bun"`, with the `thunderjar/no-ambient` rule.
 * - `module`: any import from a module, e.g. `bun:sqlite`. `thunderjar/no-ambient`.
 * - `date`: `new Date()` or `Date()` with no arguments. `thunderjar/no-ambient`.
 *
 * `id` names the ban in scripts/ambientAllowlist.ts.
 */
export type Ban = { id: string; kind: "global" | "property" | "module" | "date"; message: string };

const SEE = 'See "Ambient APIs" in AGENTS.md.';
const service = (name: string) => `Use the ${name} service instead. ${SEE}`;
const SUBPROCESS = `Run it through the service for what it does: DockerService, Git, HarnessAdapters, RuntimeHooks, HostExec or ThunderjarPackage. ${SEE}`;

const ban = (kind: Ban["kind"], message: string) => (id: string): Ban => ({ id, kind, message });
const clock = { prop: ban("property", service("Clock")), global: ban("global", service("Clock")) };
const ids = ban("property", service("Ids"));
const launch = ban("property", service("launch"));
const io = ban("property", service("Io"));
const subprocess = ban("property", SUBPROCESS);

export const AMBIENT_BANS: readonly Ban[] = [
  // Clock
  clock.prop("Date.now"),
  ban("date", service("Clock"))("new Date()"),
  clock.prop("performance.now"),
  clock.prop("Bun.nanoseconds"),
  clock.prop("Bun.sleep"),
  clock.prop("Bun.sleepSync"),
  clock.global("setTimeout"),
  clock.global("setInterval"),
  // Ids
  ids("Math.random"),
  ids("crypto.randomUUID"),
  ids("crypto.getRandomValues"),
  ids("Bun.randomUUIDv7"),
  // launch
  launch("process.env"),
  launch("Bun.env"),
  launch("process.cwd"),
  launch("process.chdir"),
  ban("property", `Take the arguments as a parameter: app.cli(args) will. ${SEE}`)("process.argv"),
  // Io
  io("process.stdout"),
  io("process.stderr"),
  io("process.stdin"),
  io("Bun.stdin"),
  io("Bun.stdout"),
  io("Bun.stderr"),
  io("process.on"),
  io("process.once"),
  io("process.off"),
  ban("property", `Return the exit code instead: only src/cli/index.ts exits. ${SEE}`)("process.exit"),
  ban("property", `Return the exit code instead: only src/cli/index.ts sets it. ${SEE}`)("process.exitCode"),
  // Subprocesses
  subprocess("Bun.spawn"),
  subprocess("Bun.spawnSync"),
  subprocess("Bun.$"),
  // The rest
  ban("global", service("ImageRegistry"))("fetch"),
  ban("property", service("ViewServer"))("Bun.serve"),
  ban("property", service("HarnessAdapters"))("Bun.which"),
  ban("property", service("RunDataStore"))("Bun.SQL"),
  ban("module", service("RunDataStore"))("bun:sqlite"),
];

/**
 * Files in src/ the bans don't apply to.
 *
 * `src/testing`: the fixture harness runs the CLI as a subprocess, with its own environment, and
 * waits on it. Tests, and `run`'s test support: they set up and observe the real world on purpose,
 * e.g. a temp folder, a Docker image, a timeout. What a test does can't leak into what Thunderjar
 * does.
 */
export const AMBIENT_EXEMPT: readonly string[] = [
  "src/testing/**",
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "src/cli/commands/run/runTestSupport.ts",
];

/** Which file may break which bans, e.g. `{ "src/cli/colour.ts": ["process.env"] }`. */
export type Allowlist = Readonly<Record<string, readonly string[]>>;

/**
 * The services' real implementations, and which bans each breaks: where the ambient APIs belong
 * for good. Unlike scripts/ambientAllowlist.ts, this list doesn't shrink: each entry is the one
 * place its API is read, e.g. `Date.now` in `systemClock`.
 *
 * ✅ Add a file here when it's a service's real implementation, or the composition root.
 * ❌ Don't add a file here to dodge the allowlist: anything else takes the service instead.
 */
export const AMBIENT_IMPLEMENTATIONS: Allowlist = {
  // The composition root's caller: builds the real services from the process.
  "src/cli/index.ts": ["process.env", "process.cwd", "process.argv", "process.exitCode"],
  // Waits in real time for the code under test to reach the fake clock.
  "src/fakes/fakeClock.ts": ["setTimeout"],
  "src/io/io.ts": ["process.stdout", "process.stderr"],
  "src/time/clock.ts": ["Date.now", "setTimeout"],
};

/** `a` and `b` together: each file may break the bans either allows it. */
export function mergeAllowlists(a: Allowlist, b: Allowlist): Allowlist {
  const merged: Record<string, string[]> = {};
  for (const list of [a, b]) for (const [path, ids] of Object.entries(list)) merged[path] = [...new Set([...(merged[path] ?? []), ...ids])];
  return merged;
}

export const AMBIENT_RULES = ["no-restricted-globals", "no-restricted-properties", "thunderjar/no-ambient"] as const;

/** The oxlint rules that enforce `bans`, "off" for a rule with none to enforce. */
export function ambientRules(bans: readonly Ban[]): Record<string, unknown> {
  const of = (kind: Ban["kind"]) => bans.filter((b) => b.kind === kind);
  const globals = of("global").map(({ id, message }) => ({ name: id, message }));
  const properties = of("property").map(({ id, message }) => {
    const [object, property] = id.split(".");
    return { object, property, message };
  });
  const custom = bans
    .filter((b) => b.kind === "module" || b.kind === "date" || (b.kind === "property" && b.id.startsWith("Bun.")))
    .map(({ id, kind, message }) => ({ id, kind, message }));
  const rule = (options: unknown[], wrap = (o: unknown[]) => o) => (options.length > 0 ? ["error", ...wrap(options)] : "off");
  return {
    "no-restricted-globals": rule(globals),
    "no-restricted-properties": rule(properties),
    "thunderjar/no-ambient": rule(custom, (o) => [{ bans: o }]),
  };
}

/**
 * The overrides that apply the bans to src/: one for all of it, one for the exempt files, and one
 * per allowlisted file, relaxing only what it may break.
 *
 * Overrides replace a rule rather than adding to it, and a later override wins, so an allowlisted
 * file's override repeats the bans it may not break, for each rule it relaxes.
 */
export function ambientOverrides(
  bans: readonly Ban[],
  exempt: readonly string[],
  allowlist: Allowlist,
): { files: string[]; rules: Record<string, unknown> }[] {
  const off = Object.fromEntries(AMBIENT_RULES.map((r) => [r, "off"]));
  const all = ambientRules(bans);
  /** The rules `path` relaxes, i.e. those that differ from `all`. */
  const relaxed = (path: string) => {
    const rules = ambientRules(bans.filter((b) => !allowlist[path]!.includes(b.id)));
    return Object.fromEntries(Object.entries(rules).filter(([name, rule]) => JSON.stringify(rule) !== JSON.stringify(all[name])));
  };
  return [
    { files: ["src/**"], rules: all },
    ...(exempt.length > 0 ? [{ files: [...exempt], rules: off }] : []),
    ...Object.keys(allowlist)
      .sort()
      .map((path) => ({ files: [path], rules: relaxed(path) })),
  ];
}

/** The ban an oxlint diagnostic reports, if it's one of `bans`. */
export function banOf(diagnostic: { code: string; message: string }, bans: readonly Ban[]): string | undefined {
  const name =
    diagnostic.code === "eslint(no-restricted-globals)"
      ? /^Unexpected use of '([^']+)'/.exec(diagnostic.message)?.[1]
      : ["eslint(no-restricted-properties)", "thunderjar(no-ambient)"].includes(diagnostic.code)
        ? /^'([^']+)'/.exec(diagnostic.message)?.[1]
        : undefined;
  return bans.some((b) => b.id === name) ? name : undefined;
}

/** The bans each file breaks, from oxlint's diagnostics: what scripts/ambientAllowlist.ts would need. */
export function offenders(diagnostics: { code: string; message: string; filename: string }[], bans: readonly Ban[]): Allowlist {
  const found: Record<string, Set<string>> = {};
  for (const d of diagnostics) {
    const id = banOf(d, bans);
    if (id) (found[d.filename] ??= new Set()).add(id);
  }
  const order = (id: string) => bans.findIndex((b) => b.id === id);
  return Object.fromEntries(
    Object.keys(found)
      .sort()
      .map((f) => [f, [...found[f]!].sort((a, b) => order(a) - order(b))]),
  );
}

/** Entries of `allowlist` that `actual` doesn't need: bans a file no longer breaks. */
export function staleEntries(allowlist: Allowlist, actual: Allowlist): string[] {
  return Object.entries(allowlist).flatMap(([path, ids]) =>
    ids.filter((id) => !actual[path]?.includes(id)).map((id) => `${path}: ${id}`),
  );
}

/** scripts/ambientAllowlist.ts, listing `allowlist`. */
export function renderAllowlist(allowlist: Allowlist): string {
  const entries = Object.entries(allowlist)
    .map(([path, ids]) => `  ${JSON.stringify(path)}: [${ids.map((id) => JSON.stringify(id)).join(", ")}],\n`)
    .join("");
  return `/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// The files in src/ that still use an ambient API, and which. See "Ambient APIs" in AGENTS.md.
//
// It may only shrink: \`bun run lint\` fails on an entry a file no longer needs. Move an API behind
// its service, then delete the entry, or run \`bun run lint:allowlist\` to rewrite this file from
// what oxlint finds.
import type { Allowlist } from "./ambient.ts";

export const AMBIENT_ALLOWLIST: Allowlist = {
${entries}};
`;
}
