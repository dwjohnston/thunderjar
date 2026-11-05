// Loads `.thunderjar/thunderjar.config.ts`: where images are pushed, if anywhere.
import type { ConfigDeclaration, ImageStore } from "../api/declarations.ts";
import { loadDeclaration, type Problem, problemsError } from "./loader.ts";

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

export type ProjectConfig = { imageStore: ImageStore | null };

/** The project's config, from `<root>/thunderjar.config.ts`. Throws a ConfigError if it's missing or wrong. */
export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  const problems: Problem[] = [];
  const config = (await loadDeclaration(root, CONFIG_FILE, "declareConfig", problems)) as ConfigDeclaration | undefined;
  if (config) {
    const problem = imageStoreProblem(config.imageStore);
    if (problem) problems.push({ file: CONFIG_FILE, field: "imageStore", message: problem });
  }
  if (problems.length > 0) throw problemsError(problems);
  const { imageStore } = config as ConfigDeclaration;
  return { imageStore: imageStore === null ? null : { repository: imageStore.repository } };
}
