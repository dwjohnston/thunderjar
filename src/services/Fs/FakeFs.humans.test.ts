import type { Fs } from "./Fs";
import { FakeFs } from "./FakeFs";
import { describe, expect, it } from "bun:test";

/** Finds a test case by name, as `run` does, and notes that it looked. */
async function findTestCase(fs: Fs, root: string, name: string): Promise<string | undefined> {
    const path = `${root}/.thunderjar/test-cases/${name}.ts`;
    if (!(await fs.exists(path))) return undefined;
    await fs.write(`${root}/.thunderjar/logs/found.txt`, name);
    return fs.readText(path);
}

describe(findTestCase, () => {
    it("reads the test case and writes a note, all in memory", async () => {
        const fs = new FakeFs({ "/p/.thunderjar/test-cases/smoke.ts": "export default {}" });

        expect(await findTestCase(fs, "/p", "smoke")).toBe("export default {}");
        expect(fs.files()).toMatchInlineSnapshot(`
          {
            "/p/.thunderjar/logs/found.txt": "smoke",
            "/p/.thunderjar/test-cases/smoke.ts": "export default {}",
          }
        `);
    });

    it("gives nothing for a missing test case", async () => {
        expect(await findTestCase(new FakeFs(), "/p", "missing")).toBeUndefined();
    });
});
