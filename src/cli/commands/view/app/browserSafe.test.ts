// The viewer's app runs in a browser, which has no `process`. It imports CLI modules, such as
// format.ts, so none of what it imports may touch `process` as it loads.
import { expect, test } from "bun:test";

test("App.tsx and what it imports load without `process`", async () => {
  const built = await Bun.build({ entrypoints: [`${import.meta.dir}/App.tsx`], target: "browser", format: "iife", minify: false });
  expect(built.success).toBe(true);
  const code = await built.outputs[0]!.text();

  expect(() => new Function("process", code)(undefined)).not.toThrow();
});
