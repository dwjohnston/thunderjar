// Makes sure every fixture image the Docker image tests start from exists —
// spec/120-test-boundaries.md#fixture-images. Skips images already present.
//
//   bun run test:prepare
//
// So far that is only the fixtures' base image; the fake harnesses install nothing.
const FIXTURE_IMAGES = ["node:20-bookworm"];

for (const image of FIXTURE_IMAGES) {
  if (Bun.spawnSync(["docker", "image", "inspect", image], { stdout: "ignore", stderr: "ignore" }).exitCode === 0) {
    console.log(`exists   ${image}`);
    continue;
  }
  console.log(`pulling  ${image}`);
  const pull = Bun.spawnSync(["docker", "pull", image], { stdio: ["inherit", "inherit", "inherit"] });
  if (pull.exitCode !== 0) process.exit(pull.exitCode || 1);
}
