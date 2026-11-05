// Loads `.thunderjar/thunderjar.config.ts`: where images are pushed, if anywhere, and what prerun
// builds are given beside their build context.
import type { BuildOptions, ConfigDeclaration, ImageStore } from "../api/declarations.ts";
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
    return `must be { secrets: [{ id, env }], ssh: true }, either of them left out, got ${show(build)}`;
  }
  const { secrets, ssh } = build as { secrets?: unknown; ssh?: unknown };
  if (ssh !== undefined && typeof ssh !== "boolean") return `ssh must be true or false, got ${show(ssh)}`;
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

export type ProjectConfig = {
  imageStore: ImageStore | null;
  /** What prerun builds are given: no secrets and no SSH agent, unless the config gives them. */
  build: Required<BuildOptions>;
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
  }
  if (problems.length > 0) throw problemsError(problems);
  const { imageStore, build } = config as ConfigDeclaration;
  return {
    imageStore: imageStore === null ? null : { repository: imageStore.repository },
    build: { secrets: (build?.secrets ?? []).map(({ id, env }) => ({ id, env })), ssh: build?.ssh ?? false },
  };
}
