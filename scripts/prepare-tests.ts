// Makes sure every fixture image the Docker image tests start from exists —
// spec/120-test-boundaries.md#fixture-images. Skips images already present.
//
//   bun run test:prepare
//
// So far that is only the fixtures' base image; the fake harnesses install nothing.
import { spawnSync } from "node:child_process";

const FIXTURE_IMAGES = ["node:20-bookworm"];

for (const image of FIXTURE_IMAGES) {
  if (spawnSync("docker", ["image", "inspect", image], { stdio: "ignore" }).status === 0) {
    console.log(`exists   ${image}`);
    continue;
  }
  console.log(`pulling  ${image}`);
  const pull = spawnSync("docker", ["pull", image], { stdio: "inherit" });
  if (pull.status !== 0) process.exit(pull.status ?? 1);
}
