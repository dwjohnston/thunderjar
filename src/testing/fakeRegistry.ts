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

// A stand-in for a registry's HTTP API, served on localhost in the test's own process, so
// deleting from an image store can be tested without Docker or a network. It speaks as much of
// the OCI distribution API as src/docker/registry.ts uses:
//
//   HEAD|GET /v2/<name>/manifests/<tag or digest>   200 with Docker-Content-Digest, or 404
//   DELETE /v2/<name>/manifests/<digest>            202, every tag of it gone; 404; or, with
//                                                   `deletes: false`, 405 UNSUPPORTED, as some registries answer
//   GET /v2/<name>/tags/list                        `pageSize` tags a page, with a Link to the next
//
// With `login`, every /v2/ request needs `Authorization: Bearer <token>`: one without is a 401
// whose challenge names /token, which gives the token for the login's Basic credentials.

export type FakeRegistry = AsyncDisposable & {
  /** `localhost:<port>`: a repository in it is `<host>/<name>`. */
  host: string;
  /** Adds `<name>:<tag>`, with a digest of its own unless `digest` gives one, e.g. one another tag has. */
  add: (name: string, tag: string, digest?: string) => string;
  /** The tags of `name` that exist, sorted. */
  tags: (name: string) => string[];
  /** Each request it was sent, `<METHOD> <path>`, in order. */
  requests: string[];
  stop: () => Promise<void>;
};

export function fakeRegistry({ deletes = true, login, pageSize = 100 }: { deletes?: boolean; login?: { username: string; password: string }; pageSize?: number } = {}): FakeRegistry {
  const manifests = new Map<string, Map<string, string>>();
  const requests: string[] = [];
  const TOKEN = "fake-registry-token";
  const repo = (name: string) => manifests.get(name) ?? manifests.set(name, new Map()).get(name)!;
  const error = (status: number, code: string, message: string) => Response.json({ errors: [{ code, message }] }, { status });

  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push(`${request.method} ${url.pathname}${url.search}`);
      if (url.pathname === "/token") {
        const expected = login && `Basic ${btoa(`${login.username}:${login.password}`)}`;
        if (request.headers.get("authorization") !== expected) return error(401, "UNAUTHORIZED", "bad credentials");
        return Response.json({ token: TOKEN });
      }
      if (login && request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
        return new Response(null, { status: 401, headers: { "WWW-Authenticate": `Bearer realm="http://${url.host}/token",service="fake-registry"` } });
      }
      if (url.pathname === "/v2/") return Response.json({});
      const manifest = /^\/v2\/(.+)\/manifests\/([^/]+)$/.exec(url.pathname);
      if (manifest) {
        const [, name, reference] = manifest as unknown as [string, string, string];
        const tags = repo(name);
        const digest = reference.startsWith("sha256:") ? ([...tags.values()].includes(reference) ? reference : undefined) : tags.get(reference);
        if (request.method === "DELETE") {
          if (!deletes) return error(405, "UNSUPPORTED", "The operation is unsupported.");
          if (digest === undefined || !reference.startsWith("sha256:")) return error(404, "MANIFEST_UNKNOWN", "manifest unknown");
          for (const [tag, each] of tags) if (each === digest) tags.delete(tag);
          return new Response(null, { status: 202 });
        }
        if (digest === undefined) return error(404, "MANIFEST_UNKNOWN", "manifest unknown");
        return new Response(request.method === "HEAD" ? null : "{}", {
          headers: { "Docker-Content-Digest": digest, "Content-Type": "application/vnd.oci.image.manifest.v1+json" },
        });
      }
      const list = /^\/v2\/(.+)\/tags\/list$/.exec(url.pathname);
      if (list && request.method === "GET") {
        const all = [...repo(list[1]!).keys()].sort();
        const last = url.searchParams.get("last");
        const rest = last === null ? all : all.filter((tag) => tag > last);
        const page = rest.slice(0, pageSize);
        const more = rest.length > page.length;
        return Response.json(
          { name: list[1], tags: page },
          more ? { headers: { Link: `</v2/${list[1]}/tags/list?n=${pageSize}&last=${page.at(-1)}>; rel="next"` } } : {},
        );
      }
      return error(404, "NOT_FOUND", "not found");
    },
  });

  const stop = async () => {
    await server.stop(true);
  };
  return {
    host: `localhost:${server.port}`,
    add: (name, tag, digest) => {
      const value = digest ?? `sha256:${new Bun.CryptoHasher("sha256").update(`${name}:${tag}`).digest("hex")}`;
      repo(name).set(tag, value);
      return value;
    },
    tags: (name) => [...repo(name).keys()].sort(),
    requests,
    stop,
    [Symbol.asyncDispose]: stop,
  };
}
