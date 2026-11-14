// Loads `.thunderjar/thunderjar.config.ts`: where images are pushed, if anywhere, and what prerun
// builds are given beside their build context.
import type { BuildOptions, ConfigDeclaration, ImageStore, RunnerConfig, RuntimeConfig } from "../api/declarations.ts";
import { ConfigError, loadDeclaration, type Problem, problemsError } from "./loader.ts";
import { ENV_NAME } from "./envName.ts";

export const CONFIG_FILE = "thunderjar.config.ts";

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

// A registry host, with an optional port: `ghcr.io`, `localhost:5000`.
const HOST = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*(?::[0-9]+)?$/;

// A path component of a Docker repository name: lowercase letters and digits, joined by single separators.
const PATH_COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;

/** Whether the first component of a repository name is a registry host, as Docker decides it. */
const isHost = (component: string) => component.includes(".") || component.includes(":") || component === "localhost";

/** The registry `repository` is in, as `docker login` takes it: `ghcr.io/acme/images` is in `ghcr.io`, `acme/images` in `docker.io`. */
export function registryHost(repository: string): string {
  const [first, ...rest] = repository.split("/");
  return rest.length > 0 && isHost(first as string) ? (first as string) : "docker.io";
}

/** Why `repository` isn't a Docker repository name, without a tag, or undefined if it is one. */
export function repositoryProblem(repository: string): string | undefined {
  const components = repository.split("/");
  const path = components.length > 1 && isHost(components[0] as string) ? components.slice(1) : components;
  const hostOk = path === components || HOST.test(components[0] as string);
  if (hostOk && path.every((component) => PATH_COMPONENT.test(component))) return undefined;
  return `${show(repository)} is not a Docker repository name. Expected e.g. "ghcr.io/acme/thunderjar-images", without a tag.`;
}

/** Why `imageStore`, as loaded, isn't `null` or `{ repository }`, or undefined if it's one of them. */
export function imageStoreProblem(imageStore: unknown): string | undefined {
  if (imageStore === null) return undefined;
  if (typeof imageStore !== "object" || Array.isArray(imageStore)) {
    return `must be { repository: "<registry>/<name>" }, or null to keep images local, got ${show(imageStore)}`;
  }
  const { repository } = imageStore as { repository?: unknown };
  if (typeof repository !== "string") return `repository must be a string, got ${show(repository)}`;
  return repositoryProblem(repository);
}

// A build secret's ID, as `docker build --secret id=…` takes it.
const SECRET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Why `build`, as loaded, isn't BuildOptions, or undefined if it is. */
export function buildOptionsProblem(build: unknown): string | undefined {
  if (build === undefined) return undefined;
  if (typeof build !== "object" || build === null || Array.isArray(build)) {
    return `must be { secrets: [{ id, env }], ssh: true, concurrency: 2 }, any of them left out, got ${show(build)}`;
  }
  const { secrets, ssh, concurrency } = build as { secrets?: unknown; ssh?: unknown; concurrency?: unknown };
  if (ssh !== undefined && typeof ssh !== "boolean") return `ssh must be true or false, got ${show(ssh)}`;
  if (concurrency !== undefined && !isConcurrency(concurrency)) return `concurrency must be a whole number, 1 or more, got ${show(concurrency)}`;
  if (secrets === undefined) return undefined;
  if (!Array.isArray(secrets)) return `secrets must be a list of { id, env }, got ${show(secrets)}`;
  const ids = new Set<string>();
  for (const secret of secrets) {
    const { id, env } = (secret ?? {}) as { id?: unknown; env?: unknown };
    if (typeof id !== "string" || !SECRET_ID.test(id)) return `secrets: ${show(id)} is not a secret ID: letters, digits, ".", "_" and "-"`;
    if (typeof env !== "string" || !ENV_NAME.test(env)) return `secrets: ${show(env)}, secret ${show(id)}'s env, is not an environment variable name`;
    if (ids.has(id)) return `secrets: ${show(id)} is given twice`;
    ids.add(id);
  }
  return undefined;
}

/** Whether `value` can be a concurrency: how many containers run, or images build, at once. */
export const isConcurrency = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1;

/** Whether `value` is a command: a program and its arguments, none of them empty. */
const isCommand = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === "string" && part.length > 0);

/** Each runtime hook's old name, then its name: they run once per execution, not once per run. */
const HOOK_RENAMES = [
  ["beforeRun", "beforeExecution"],
  ["afterRun", "afterExecution"],
] as const;

/** A warning for each of `runtime`'s hooks given by its old name. */
const hookDeprecations = (runtime: RuntimeConfig): string[] =>
  HOOK_RENAMES.filter(([oldName]) => runtime[oldName] !== undefined).map(
    ([oldName, name]) => `${CONFIG_FILE}: runtime.${oldName} is deprecated, rename it ${name}. It runs once per execution, not once per run.`,
  );

/** `runtime`'s hooks, by their names, whether it gives them by those or by their old ones. */
function hooksOf(runtime: RuntimeConfig): Pick<RuntimeConfig, "beforeExecution" | "afterExecution"> {
  const before = runtime.beforeExecution ?? runtime.beforeRun;
  const after = runtime.afterExecution ?? runtime.afterRun;
  return { ...(before !== undefined && { beforeExecution: [...before] }), ...(after !== undefined && { afterExecution: [...after] }) };
}

/** Why `runner`, a runtime's, isn't a RunnerConfig, or undefined if it is. */
function runnerProblem(runner: unknown): string | undefined {
  if (runner === undefined) return undefined;
  if (typeof runner !== "object" || runner === null || Array.isArray(runner)) return `runner must be an object, e.g. {}, got ${show(runner)}`;
  const { env, registryLogin, runOptions } = runner as Record<string, unknown>;
  const isNames = (value: unknown): value is string[] => Array.isArray(value) && value.every((name) => typeof name === "string" && ENV_NAME.test(name));
  if (env !== undefined && !isNames(env)) return `runner.env must be a list of environment variable names, got ${show(env)}`;
  if (registryLogin !== undefined) {
    const { usernameEnv, passwordEnv } = (registryLogin ?? {}) as Record<string, unknown>;
    if (!isNames([usernameEnv, passwordEnv])) return `runner.registryLogin must be { usernameEnv, passwordEnv }, each an environment variable name, got ${show(registryLogin)}`;
  }
  if (runOptions !== undefined && !(Array.isArray(runOptions) && runOptions.every((option) => typeof option === "string" && option !== ""))) {
    return `runner.runOptions must be a list of non-empty strings, got ${show(runOptions)}`;
  }
  return undefined;
}

/** Why `runtime`, as loaded, isn't a RuntimeConfig that can be used with `imageStore`, or undefined if it is. */
export function runtimeProblem(runtime: unknown, imageStore: unknown): string | undefined {
  if (runtime === undefined) return undefined;
  if (typeof runtime !== "object" || runtime === null || Array.isArray(runtime)) {
    return `must be { command: ["docker", "--context", "<context>"] }, got ${show(runtime)}`;
  }
  const fields = runtime as Record<string, unknown>;
  const { command, concurrency, keepPostrunImages } = fields;
  if (!isCommand(command)) {
    return `command must be a non-empty list of non-empty strings, e.g. ["docker", "--context", "cloud"], got ${show(command)}`;
  }
  for (const [oldName, name] of HOOK_RENAMES) {
    if (fields[oldName] !== undefined && fields[name] !== undefined) return `give ${name} or ${oldName}, its old name, not both`;
    for (const field of [name, oldName]) {
      const hook = fields[field];
      if (hook !== undefined && !isCommand(hook)) return `${field} must be a non-empty list of non-empty strings, e.g. ["./scripts/start-runtime.sh"], got ${show(hook)}`;
    }
  }
  if (concurrency !== undefined && !isConcurrency(concurrency)) return `concurrency must be a whole number, 1 or more, got ${show(concurrency)}`;
  if (keepPostrunImages !== undefined && typeof keepPostrunImages !== "boolean") return `keepPostrunImages must be true or false, got ${show(keepPostrunImages)}`;
  if (imageStore === null) return "needs an imageStore: the runtime pulls the images it runs from it";
  return runnerProblem(fields.runner);
}

/** Why `runDataStore` isn't a run data store, or undefined if it is. */
export function runDataStoreProblem(runDataStore: unknown): string | undefined {
  const { kind, path, urlEnv } = (runDataStore ?? {}) as { kind?: unknown; path?: unknown; urlEnv?: unknown };
  if (kind === "sqlite") return typeof path === "string" && path !== "" ? undefined : "sqliteStore's path must be a file path";
  if (kind === "postgres") {
    return typeof urlEnv === "string" && ENV_NAME.test(urlEnv) ? undefined : `postgresStore's urlEnv, ${show(urlEnv)}, is not an environment variable name`;
  }
  return 'must be a store, e.g. sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }) or postgresStore({ urlEnv: "THUNDERJAR_DB_URL" })';
}

export type ProjectConfig = {
  imageStore: ImageStore | null;
  /** Where `run` runs containers, and how many at once, or `null` for the local Docker daemon. */
  runtime:
    | (Required<Pick<RuntimeConfig, "command" | "concurrency" | "keepPostrunImages">> &
        Pick<RuntimeConfig, "beforeExecution" | "afterExecution"> & {
          /** How its runner is started, if executions run in one on the runtime: see `RuntimeConfig.runner`. */
          runner?: Required<Pick<RunnerConfig, "env" | "runOptions">> & Pick<RunnerConfig, "registryLogin">;
        })
    | null;
  /**
   * The run data store, as the config gives it: a SQLite file, relative to the project folder
   * (the one holding `.thunderjar/`) unless absolute, or the variable holding a Postgres URL.
   */
  runDataStore: { kind: "sqlite"; path: string } | { kind: "postgres"; urlEnv: string };
  /** What prerun builds are given, and how many build at once: no secrets, no SSH agent and 1, unless the config gives them. */
  build: Required<BuildOptions>;
  /** A warning for each deprecated field the config gives, e.g. a runtime hook by its old name. */
  deprecations: string[];
};

/**
 * Checks that the variable of each of `build`'s secrets is set in `env`. Throws a ConfigError
 * naming each that isn't, so it can be called before anything is built. An empty value counts as unset.
 */
export function checkBuildSecrets(build: Required<BuildOptions>, env: Record<string, string | undefined> = Bun.env): void {
  const missing = build.secrets.filter(({ env: name }) => !env[name]).map(({ id, env: name }) => `Build secret "${id}" needs ${name}, which is not set.`);
  if (missing.length === 0) return;
  const hint = `Export ${missing.length === 1 ? "it" : "them"} in the shell that runs thunderjar.`;
  throw new ConfigError(...missing.slice(0, -1), `${missing.at(-1)}\n${hint}`);
}

/** The project's config, from `<root>/thunderjar.config.ts`. Throws a ConfigError if it's missing or wrong. */
export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  const problems: Problem[] = [];
  const config = (await loadDeclaration(root, CONFIG_FILE, "declareConfig", problems)) as ConfigDeclaration | undefined;
  if (config) {
    const problem = imageStoreProblem(config.imageStore);
    if (problem) problems.push({ file: CONFIG_FILE, field: "imageStore", message: problem });
    const buildProblem = buildOptionsProblem(config.build);
    if (buildProblem) problems.push({ file: CONFIG_FILE, field: "build", message: buildProblem });
    const runtime = runtimeProblem(config.runtime, config.imageStore);
    if (runtime) problems.push({ file: CONFIG_FILE, field: "runtime", message: runtime });
    const storeProblem = runDataStoreProblem(config.runDataStore);
    if (storeProblem) problems.push({ file: CONFIG_FILE, field: "runDataStore", message: storeProblem });
  }
  if (problems.length > 0) throw problemsError(problems);
  const { imageStore, build, runtime, runDataStore } = config as ConfigDeclaration;
  return {
    imageStore: imageStore === null ? null : { repository: imageStore.repository },
    runDataStore: runDataStore.kind === "postgres" ? { kind: "postgres", urlEnv: runDataStore.urlEnv } : { kind: "sqlite", path: runDataStore.path },
    runtime:
      runtime === undefined
        ? null
        : {
            command: [...runtime.command],
            concurrency: runtime.concurrency ?? 1,
            keepPostrunImages: runtime.keepPostrunImages ?? false,
            ...hooksOf(runtime),
            ...(runtime.runner !== undefined && {
              runner: {
                env: [...(runtime.runner.env ?? [])],
                runOptions: [...(runtime.runner.runOptions ?? [])],
                ...(runtime.runner.registryLogin !== undefined && {
                  registryLogin: { usernameEnv: runtime.runner.registryLogin.usernameEnv, passwordEnv: runtime.runner.registryLogin.passwordEnv },
                }),
              },
            }),
          },
    build: { secrets: (build?.secrets ?? []).map(({ id, env }) => ({ id, env })), ssh: build?.ssh ?? false, concurrency: build?.concurrency ?? 1 },
    deprecations: runtime === undefined ? [] : hookDeprecations(runtime),
  };
}
