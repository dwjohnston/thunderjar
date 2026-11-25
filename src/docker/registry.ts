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

// Deleting images from a registry, and listing a repository's tags, through the standard registry
// HTTP API (the OCI distribution spec), with the user's existing `docker login`. Nothing here knows
// any one registry: one that refuses deletes says so, and `purge image` falls back to the image
// store's `deleteCommand`.
//
//   resolve a tag     HEAD /v2/<name>/manifests/<tag>        its Docker-Content-Digest
//   delete it         DELETE /v2/<name>/manifests/<digest>   202 deleted, 404 already gone
//   list tags         GET /v2/<name>/tags/list               following Link headers
//
// A 401 is answered once per request with its challenge: a Bearer token from the realm it names,
// asked for with the login's user name and secret, or Basic with them. The login is read as
// Docker reads it, from $DOCKER_CONFIG/config.json, or ~/.docker/config.json: a credential
// helper's (`credHelpers`, then `credsStore`), or else `auths`. A registry on localhost is spoken
// to over plain HTTP, as Docker allows; any other over HTTPS.
import { $ } from "bun";
import { registryHost } from "../config/projectConfig.ts";
import { moduleLogger } from "../log/logger.ts";
import { RegistryError } from "../services/Docker/errors.ts";

const log = moduleLogger("registry");

// Lives with the Docker service's other errors: re-exported under its old path.
export { RegistryError };

/** How deleting one image went: deleted, already gone, or refused by the registry, with its reason. */
export type RegistryDelete = { outcome: "deleted" | "absent" } | { outcome: "refused"; reason: string };

/** Where a reference's repository is, for the API: its base URL, its name there, and the host its login is under. */
type Location = { base: string; name: string; host: string };

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

/** The API location of `repository`, e.g. `ghcr.io/acme/images`. Docker Hub's API is at registry-1.docker.io. */
export function locate(repository: string): Location {
  const host = registryHost(repository);
  const explicit = repository.startsWith(`${host}/`);
  let name = explicit ? repository.slice(host.length + 1) : repository;
  if (host === "docker.io" && !name.includes("/")) name = `library/${name}`;
  const apiHost = host === "docker.io" ? "registry-1.docker.io" : host;
  return { base: `${LOCAL_HOST.test(host) ? "http" : "https"}://${apiHost}`, name, host };
}

/** `reference`, `<repository>:<tag>`, split at its tag. */
export function splitReference(reference: string): { repository: string; tag: string } {
  const colon = reference.lastIndexOf(":");
  if (colon === -1 || reference.slice(colon).includes("/")) throw new RegistryError(`${reference} has no tag`);
  return { repository: reference.slice(0, colon), tag: reference.slice(colon + 1) };
}

type Credentials = { username: string; secret: string };

/** The Docker config folder: $DOCKER_CONFIG, or ~/.docker. */
const dockerConfigDir = () => Bun.env.DOCKER_CONFIG ?? `${Bun.env.HOME ?? "~"}/.docker`;

/** Docker Hub's logins are kept under its old index URL. */
const authKeys = (host: string) => (host === "docker.io" ? ["https://index.docker.io/v1/", "docker.io", "index.docker.io"] : [host, `https://${host}`, `http://${host}`]);

/** The user's `docker login` for `host`, or undefined if there's none. */
export async function dockerCredentials(host: string): Promise<Credentials | undefined> {
  const file = Bun.file(`${dockerConfigDir()}/config.json`);
  if (!(await file.exists())) return undefined;
  let config: { auths?: Record<string, { auth?: string }>; credsStore?: string; credHelpers?: Record<string, string> };
  try {
    config = await file.json();
  } catch {
    return undefined;
  }
  const keys = authKeys(host);
  const helper = keys.map((key) => config.credHelpers?.[key]).find(Boolean) ?? config.credsStore;
  if (helper) {
    const binary = `docker-credential-${helper}`;
    for (const key of keys) {
      const result = await $`${binary} get < ${new Response(key)}`.quiet().nothrow();
      if (result.exitCode !== 0) continue;
      try {
        const { Username, Secret } = JSON.parse(result.stdout.toString()) as { Username: string; Secret: string };
        if (Secret) return { username: Username, secret: Secret };
      } catch {
        continue;
      }
    }
  }
  for (const key of keys) {
    const auth = config.auths?.[key]?.auth;
    if (!auth) continue;
    const decoded = atob(auth);
    const colon = decoded.indexOf(":");
    if (colon > 0) return { username: decoded.slice(0, colon), secret: decoded.slice(colon + 1) };
  }
  return undefined;
}

/** A challenge's parameters, e.g. `Bearer realm="…",service="…",scope="…"`. */
function parseChallenge(header: string): { scheme: string; params: Record<string, string> } {
  const scheme = header.trim().split(/\s+/)[0]!.toLowerCase();
  const params: Record<string, string> = {};
  for (const [, key, value] of header.matchAll(/(\w+)="([^"]*)"/g)) params[key!] = value!;
  return { scheme, params };
}

const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

/** The `message` of a registry's error body, `{ errors: [{ code, message }] }`, or its status. */
async function reasonOf(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const [first] = (JSON.parse(text) as { errors?: { code?: string; message?: string }[] }).errors ?? [];
    if (first) return `${response.status} ${[first.code, first.message].filter(Boolean).join(": ")}`;
  } catch {
    // Not JSON.
  }
  return `${response.status} ${response.statusText}`.trim();
}

/**
 * A client of registries, keeping the tokens it was given for the rest of a command. `credentials`
 * finds the login for a host: the user's Docker login by default.
 */
export function registryClient(credentials: (host: string) => Promise<Credentials | undefined> = dockerCredentials) {
  const tokens = new Map<string, string>();
  const logins = new Map<string, Promise<Credentials | undefined>>();
  const loginFor = (host: string) => logins.get(host) ?? logins.set(host, credentials(host)).get(host)!;
  const basic = ({ username, secret }: Credentials) => `Basic ${btoa(`${username}:${secret}`)}`;

  /** `fetch`, but a RegistryError if the registry can't be reached. */
  const send = async (url: string, init: RequestInit): Promise<Response> => {
    try {
      return await fetch(url, { ...init, redirect: "follow" });
    } catch (error) {
      throw new RegistryError(`Can't reach ${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** The Authorization header for a 401's challenge, or undefined if it can't be answered. */
  async function answer(challenge: string, location: Location, actions: string): Promise<string | undefined> {
    const { scheme, params } = parseChallenge(challenge);
    const login = await loginFor(location.host);
    if (scheme === "basic") return login && basic(login);
    if (scheme !== "bearer" || !params.realm) return undefined;
    const url = new URL(params.realm);
    if (params.service) url.searchParams.set("service", params.service);
    url.searchParams.set("scope", params.scope ?? `repository:${location.name}:${actions}`);
    const response = await send(url.toString(), { headers: login ? { Authorization: basic(login) } : {} });
    if (!response.ok) {
      log.debug({ realm: params.realm, status: response.status }, "token request refused");
      return undefined;
    }
    const body = (await response.json()) as { token?: string; access_token?: string };
    const token = body.token ?? body.access_token;
    return token && `Bearer ${token}`;
  }

  /** `method` on `path` of `location`, answering one 401, with a token kept per repository and actions. */
  async function request(location: Location, method: string, path: string, actions: string, headers: Record<string, string> = {}): Promise<Response> {
    const url = `${location.base}/v2/${location.name}/${path}`;
    const key = `${location.base} ${location.name} ${actions}`;
    const cached = tokens.get(key);
    let response = await send(url, { method, headers: { ...headers, ...(cached && { Authorization: cached }) } });
    const challenge = response.headers.get("www-authenticate");
    if (response.status === 401 && challenge) {
      const authorization = await answer(challenge, location, actions);
      if (authorization) {
        tokens.set(key, authorization);
        response = await send(url, { method, headers: { ...headers, Authorization: authorization } });
      }
    }
    log.debug({ method, url, status: response.status }, "registry request");
    return response;
  }

  return {
    /**
     * Deletes `reference`, `<repository>:<tag>`, from its registry: resolves the tag to its
     * manifest's digest, then deletes the manifest, with every tag of it. An image already gone
     * is `absent`. Throws a RegistryError if the registry can't be reached, or fails otherwise.
     */
    async deleteImage(reference: string): Promise<RegistryDelete> {
      const { repository, tag } = splitReference(reference);
      const location = locate(repository);
      const head = await request(location, "HEAD", `manifests/${tag}`, "pull", { Accept: MANIFEST_TYPES });
      if (head.status === 404) return { outcome: "absent" };
      if (head.status >= 500) throw new RegistryError(`${location.host} answered ${head.status} for ${reference}`);
      if (!head.ok) return { outcome: "refused", reason: `can't read it: ${head.status} ${head.statusText}`.trim() };
      let digest = head.headers.get("docker-content-digest");
      if (!digest) {
        const get = await request(location, "GET", `manifests/${tag}`, "pull", { Accept: MANIFEST_TYPES });
        if (!get.ok) return { outcome: "refused", reason: `can't read it: ${await reasonOf(get)}` };
        digest = `sha256:${new Bun.CryptoHasher("sha256").update(await get.arrayBuffer()).digest("hex")}`;
      }
      const deleted = await request(location, "DELETE", `manifests/${digest}`, "pull,push,delete");
      if (deleted.status === 202 || deleted.status === 200) return { outcome: "deleted" };
      if (deleted.status === 404) return { outcome: "absent" };
      const reason = await reasonOf(deleted);
      if (deleted.status >= 500) throw new RegistryError(`${location.host} answered ${reason} for ${reference}`);
      return { outcome: "refused", reason };
    },

    /** Every tag of `repository`, as `<repository>:<tag>`; none if it doesn't exist. Throws a RegistryError. */
    async tagsOf(repository: string): Promise<string[]> {
      const location = locate(repository);
      const tags: string[] = [];
      let path: string | undefined = "tags/list?n=1000";
      while (path !== undefined) {
        const response = await request(location, "GET", path, "pull");
        if (response.status === 404) return tags;
        if (!response.ok) throw new RegistryError(`Can't list the tags of ${repository}: ${await reasonOf(response)}`);
        tags.push(...(((await response.json()) as { tags?: string[] | null }).tags ?? []));
        const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1];
        path = next === undefined ? undefined : next.slice(next.indexOf("/tags/list") + 1);
      }
      return tags.map((tag) => `${repository}:${tag}`);
    },
  };
}

export type RegistryClient = ReturnType<typeof registryClient>;
