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

// The registry client, against a fake registry served in this process: never a real one.
import { $ } from "bun";
import { afterEach, describe, expect, test } from "bun:test";
import { TMP_DIR } from "../testing/cli.ts";
import { fakeRegistry } from "../testing/fakeRegistry.ts";
import { dockerCredentials, locate, registryClient, RegistryError, splitReference } from "./registry.ts";

const noLogin = async () => undefined;

describe("locate", () => {
  test("a registry's API is at its host, over HTTPS, or HTTP for localhost; Docker Hub's at registry-1.docker.io", () => {
    expect(locate("ghcr.io/acme/images")).toEqual({ base: "https://ghcr.io", name: "acme/images", host: "ghcr.io" });
    expect(locate("localhost:5000/acme/images")).toEqual({ base: "http://localhost:5000", name: "acme/images", host: "localhost:5000" });
    expect(locate("acme/images")).toEqual({ base: "https://registry-1.docker.io", name: "acme/images", host: "docker.io" });
    expect(locate("busybox")).toEqual({ base: "https://registry-1.docker.io", name: "library/busybox", host: "docker.io" });
  });

  test("a reference splits at its tag, not at a registry's port", () => {
    expect(splitReference("localhost:5000/acme/images:postrun-e1")).toEqual({ repository: "localhost:5000/acme/images", tag: "postrun-e1" });
    expect(() => splitReference("localhost:5000/acme/images")).toThrow(RegistryError);
  });
});

describe("deleteImage", () => {
  test("resolves the tag to its digest and deletes the manifest; one already gone is absent", async () => {
    await using registry = fakeRegistry();
    registry.add("acme/images", "postrun-1");
    registry.add("acme/images", "postrun-2");
    const client = registryClient(noLogin);

    expect(await client.deleteImage(`${registry.host}/acme/images:postrun-1`)).toEqual({ outcome: "deleted" });
    expect(await client.deleteImage(`${registry.host}/acme/images:postrun-1`)).toEqual({ outcome: "absent" });
    expect(registry.tags("acme/images")).toEqual(["postrun-2"]);
    expect(registry.requests.filter((request) => request.startsWith("DELETE"))).toEqual([expect.stringMatching(/^DELETE \/v2\/acme\/images\/manifests\/sha256:[0-9a-f]{64}$/)]);
  });

  test("a registry that refuses deletes is a refusal, with its reason", async () => {
    await using registry = fakeRegistry({ deletes: false });
    registry.add("acme/images", "postrun-1");

    expect(await registryClient(noLogin).deleteImage(`${registry.host}/acme/images:postrun-1`)).toEqual({ outcome: "refused", reason: "405 UNSUPPORTED: The operation is unsupported." });
    expect(registry.tags("acme/images")).toEqual(["postrun-1"]);
  });

  test("answers a Bearer challenge with a token asked for with the login, and keeps it", async () => {
    await using registry = fakeRegistry({ login: { username: "me", password: "secret" } });
    registry.add("acme/images", "a");
    registry.add("acme/images", "b");
    const client = registryClient(async (host) => (host === registry.host ? { username: "me", secret: "secret" } : undefined));

    expect(await client.deleteImage(`${registry.host}/acme/images:a`)).toEqual({ outcome: "deleted" });
    expect(await client.deleteImage(`${registry.host}/acme/images:b`)).toEqual({ outcome: "deleted" });
    expect(registry.requests.filter((request) => request.startsWith("GET /token"))).toHaveLength(2);
  });

  test("without a login for a registry that needs one, it can't read the image: a refusal", async () => {
    await using registry = fakeRegistry({ login: { username: "me", password: "secret" } });
    registry.add("acme/images", "a");

    expect(await registryClient(noLogin).deleteImage(`${registry.host}/acme/images:a`)).toEqual({ outcome: "refused", reason: "can't read it: 401 Unauthorized" });
  });

  test("a registry that can't be reached is a RegistryError", async () => {
    expect(await registryClient(noLogin).deleteImage("localhost:1/acme/images:a").catch((error) => error)).toBeInstanceOf(RegistryError);
  });
});

test("tagsOf lists every tag, a page at a time; none for a repository that doesn't exist", async () => {
  await using registry = fakeRegistry({ pageSize: 2 });
  for (const tag of ["e", "a", "d", "c", "b"]) registry.add("acme/images", tag);
  const client = registryClient(noLogin);

  expect(await client.tagsOf(`${registry.host}/acme/images`)).toEqual(["a", "b", "c", "d", "e"].map((tag) => `${registry.host}/acme/images:${tag}`));
  expect(await client.tagsOf(`${registry.host}/acme/none`)).toEqual([]);
});

describe("dockerCredentials", () => {
  const dirs: string[] = [];
  const saved = Bun.env.DOCKER_CONFIG;
  afterEach(async () => {
    if (saved === undefined) delete Bun.env.DOCKER_CONFIG;
    else Bun.env.DOCKER_CONFIG = saved;
    for (const dir of dirs.splice(0)) await $`rm -rf ${dir}`.quiet();
  });

  test("reads a login from the Docker config's auths, and none for another host or no config", async () => {
    const dir = `${TMP_DIR}/docker-config-${crypto.randomUUID()}`;
    dirs.push(dir);
    Bun.env.DOCKER_CONFIG = dir;
    expect(await dockerCredentials("localhost:5000")).toBeUndefined();

    await Bun.write(`${dir}/config.json`, JSON.stringify({ auths: { "localhost:5000": { auth: btoa("me:se:cret") } } }));
    expect(await dockerCredentials("localhost:5000")).toEqual({ username: "me", secret: "se:cret" });
    expect(await dockerCredentials("ghcr.io")).toBeUndefined();
  });
});
