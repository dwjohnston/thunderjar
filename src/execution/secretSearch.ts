/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Looking for a run's secret values in the files of its postrun image, before it's pushed.
//
// commitContainer keeps every secret out of the image's config, but not out of its files: the
// agent, or what it runs, can write a key into a log line, a `.env`, a shell history or a session
// file. So once the agent's container is committed, a short-lived container is run from the
// postrun image, which has exactly the files that would be pushed, given each secret variable by
// name, `-e NAME`. Its shell compares the files against `$NAME` there, and writes only the names
// and paths it finds: the values never leave Docker and Thunderjar's own environment.
import { type DockerRuntime, readContainerFile, removeContainer, runContainer } from "../docker/docker.ts";
import type { DockerService } from "../services/Docker/Docker.ts";
import { moduleLogger } from "../log/logger.ts";
import type { FoundSecret } from "../store/runDataStore.ts";

const log = moduleLogger("secrets");

/**
 * The shortest value searched for. A shorter one, e.g. `postgres` or `password`, could be in many
 * files by chance, and a found one would mean little. Real keys and tokens are far longer.
 */
export const MIN_SECRET_LENGTH = 12;

/** How many paths of the files holding a secret are recorded: the count of them all is too. */
export const SECRET_PATHS_KEPT = 20;

/** Where the search container writes what it found: `NAME<tab>path` lines, then `complete`. */
export const SECRET_SEARCH_PATH = "/thunderjar/secret-search.tsv";

/** The last line of a search that finished. */
const COMPLETE = "complete";

/**
 * How long a search may take before it's given up on: THUNDERJAR_SECRET_SEARCH_TIMEOUT_SECONDS,
 * or 120. Enough to read a large image's files, so a huge one can't hang a run.
 */
export const secretSearchTimeoutSeconds = (): number => {
  const seconds = Number(Bun.env.THUNDERJAR_SECRET_SEARCH_TIMEOUT_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 120;
};

/** The part of Docker a search runs on: a `DockerService` has it. */
export type SecretSearchDocker = Pick<DockerService, "run" | "readFile" | "removeContainer">;

/** What a search came to: the secrets found, or why it couldn't be done. */
export type SecretSearch = { found: FoundSecret[] } | { failed: string };

/**
 * Those of `names` worth searching for, once each: set in `env`, Thunderjar's own environment,
 * to a value of MIN_SECRET_LENGTH or more, on one line. Only the values' lengths are looked at here.
 */
export function searchableSecrets(names: string[], env: Record<string, string | undefined> = Bun.env): string[] {
  return [...new Set(names)].filter((name) => {
    const value = env[name];
    return /^[A-Za-z_]\w*$/.test(name) && value !== undefined && value.length >= MIN_SECRET_LENGTH && !/[\r\n]/.test(value);
  });
}

/**
 * The search script for the secret variables `names`, each given to its container by name. From
 * the root, it skips /proc, /sys and /dev, and every other mount (`-xdev`), lists the files that
 * hold any value with one `grep -F` pass, then says which value each holds.
 */
export function secretSearchScript(names: string[]): string {
  const patterns = names.map((name) => `-e "$${name}"`).join(" ");
  const each = names.map((name) => `grep -qF -e "$${name}" "$file" 2> /dev/null && printf '${name}\\t%s\\n' "\${file#.}"`);
  return [
    `for tool in find xargs grep; do command -v "$tool" > /dev/null || { echo "the image has no $tool" >&2; exit 3; }; done`,
    `cd / || exit 3`,
    `find . -xdev \\( -path ./proc -o -path ./sys -o -path ./dev \\) -prune -o -type f -print0 \\`,
    `  | xargs -0 -r grep -lF ${patterns} 2> /dev/null \\`,
    `  | while IFS= read -r file; do`,
    ...each.map((line) => `      ${line}`),
    `    done > ${SECRET_SEARCH_PATH}`,
    `echo ${COMPLETE} >> ${SECRET_SEARCH_PATH}`,
  ].join("\n");
}

/**
 * What the search script left, `text`: each secret found, by name, in the order of `names`, with
 * how many files hold it and the first SECRET_PATHS_KEPT of their paths, sorted. A string, why,
 * if it's missing or didn't finish.
 */
export function parseSecretSearch(text: string | undefined, names: string[]): FoundSecret[] | string {
  const lines = (text ?? "").split("\n").filter(Boolean);
  if (lines.at(-1) !== COMPLETE) return text === undefined ? "the search left no results" : "the search didn't finish";
  const paths = new Map<string, Set<string>>();
  for (const line of lines.slice(0, -1)) {
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const [name, path] = [line.slice(0, tab), line.slice(tab + 1)];
    paths.set(name, (paths.get(name) ?? new Set()).add(path));
  }
  return names.flatMap((name) => {
    const found = [...(paths.get(name) ?? [])].sort();
    return found.length === 0 ? [] : [{ name, files: found.length, paths: found.slice(0, SECRET_PATHS_KEPT) }];
  });
}

/**
 * Searches the files of the postrun image `image` for the values of the secret variables `names`,
 * in the container `container`, which is removed afterwards. Undefined, and no container, if none
 * is worth searching for: see searchableSecrets. Never throws: a search that fails, or takes
 * longer than secretSearchTimeoutSeconds(), is `failed`, with why, and the run goes on.
 */
export async function searchForSecrets(
  image: string,
  container: string,
  names: string[],
  where: DockerRuntime | SecretSearchDocker,
  env: Record<string, string | undefined> = Bun.env,
): Promise<SecretSearch | undefined> {
  const docker: SecretSearchDocker =
    "pull" in where
      ? {
          run: (image, name, script, options) => runContainer(image, name, script, { ...options, runtime: where }),
          readFile: (name, path) => readContainerFile(name, path, where),
          removeContainer: (name) => removeContainer(name, where),
        }
      : where;
  const searched = searchableSecrets(names, env);
  if (searched.length === 0) return undefined;
  const timeoutSeconds = secretSearchTimeoutSeconds();
  const startedAt = Date.now();
  try {
    // As root, to read every file; with no network, as it needs none.
    const stop = await docker.run(image, container, secretSearchScript(searched), {
      env: searched,
      runOptions: ["--user", "0", "--network", "none"],
      timeoutSeconds,
    });
    if (stop.outcome !== "exited") return { failed: `it took longer than ${timeoutSeconds}s` };
    const found = parseSecretSearch(await docker.readFile(container, SECRET_SEARCH_PATH), searched);
    if (typeof found === "string") return { failed: found };
    // Names and paths only: never a value.
    log.info({ image, searched, found, ms: Date.now() - startedAt }, "searched the postrun image for secrets");
    return { found };
  } catch (error) {
    return { failed: error instanceof Error ? error.message : String(error) };
  } finally {
    await docker.removeContainer(container).catch(() => {});
  }
}
