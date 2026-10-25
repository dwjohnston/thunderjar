import { createHash } from "node:crypto";

export function stableVersionFromTag(tag: string): string | undefined {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  return match?.[1] === undefined ? undefined : tag.slice(1);
}

export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function nextRcVersion(stableVersion: string, publishedVersions: string[]): string {
  if (!stableVersionFromTag(`v${stableVersion}`)) {
    throw new Error(`Invalid stable version: ${stableVersion}`);
  }
  const prefix = `${stableVersion}-rc.`;
  const previous = latestRcVersion(stableVersion, publishedVersions);
  return `${prefix}${previous === undefined ? 0 : Number(previous.slice(prefix.length)) + 1}`;
}

export function latestRcVersion(stableVersion: string, publishedVersions: string[]): string | undefined {
  const prefix = `${stableVersion}-rc.`;
  return publishedVersions
    .filter((version) => version.startsWith(prefix) && /^(0|[1-9]\d*)$/.test(version.slice(prefix.length)))
    .sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length)))[0];
}

export function rcPrVersion(
  stableVersion: string,
  publishedVersions: string[],
  currentFingerprint: string | undefined,
  previousFingerprint: string | undefined,
): string | undefined {
  if (!currentFingerprint || (previousFingerprint && previousFingerprint === currentFingerprint)) return;
  return nextRcVersion(stableVersion, publishedVersions);
}

export function previewVersion(prNumber: number, sha: string): string {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1 || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("Invalid preview PR number or commit SHA");
  }
  return `0.0.0-pr.${prNumber}.g${sha}`;
}

export function canPreview(permission: string, state: string, sourceRepo: string, repository: string): boolean {
  return ["write", "maintain", "admin"].includes(permission) && state === "open" && sourceRepo === repository;
}

export function changesetFingerprint(files: { path: string; content: string }[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}
