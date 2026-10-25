import { expect, test } from "bun:test";
import getReleasePlan from "@changesets/get-release-plan";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("pending changesets still produce the stable version after an RC merge", async () => {
  const directory = await mkdtemp(join(tmpdir(), "thunderjar-rc-plan-"));
  try {
    await mkdir(join(directory, ".changeset"));
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "thunderjar", version: "0.2.0-rc.0" }));
    await writeFile(join(directory, ".changeset/config.json"), JSON.stringify({
      changelog: false,
      commit: false,
      fixed: [],
      linked: [],
      access: "public",
      baseBranch: "main",
      updateInternalDependencies: "patch",
      ignore: [],
    }));
    await writeFile(join(directory, ".changeset/feature.md"), '---\n"thunderjar": minor\n---\n\nFeature\n');
    const plan = await getReleasePlan(directory);
    expect(plan.releases.find((release) => release.name === "thunderjar")?.newVersion).toBe("0.2.0");
    expect(plan.changesets.map((changeset) => changeset.id)).toEqual(["feature"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
