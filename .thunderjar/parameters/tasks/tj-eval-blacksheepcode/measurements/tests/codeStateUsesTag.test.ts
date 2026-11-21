import { expect, test } from "bun:test";
import { measure } from "thunderjar/testing";
import codeStateUsesTag from "../codeStateUsesTag.ts";

const NEW_CODE_STATE = ".thunderjar/parameters/codeStates/new/index.ts";
const fixture = (name: string) => `${import.meta.dir}/fixtures/${name}`;

test("a code state that names the tag in resolve uses it", async () => {
  const result = await measure(codeStateUsesTag, { files: { [NEW_CODE_STATE]: fixture("index_good.ts") } });
  expect(result.metrics.usesTag).toBe(true);
});

test("a code state that names the tag only in applyParameter doesn't", async () => {
  const result = await measure(codeStateUsesTag, { files: { [NEW_CODE_STATE]: fixture("index_tag_in_apply_only.ts") } });
  expect(result.metrics.usesTag).toBe(false);
});

test("a code state that doesn't name the tag doesn't", async () => {
  const result = await measure(codeStateUsesTag, { files: { [NEW_CODE_STATE]: fixture("index_no_tag.ts") } });
  expect(result.metrics.usesTag).toBe(false);
});

test("no code state file at all doesn't", async () => {
  const result = await measure(codeStateUsesTag, {});
  expect(result.metrics.usesTag).toBe(false);
});

test("with two code states naming the tag, both must name it in resolve", async () => {
  const result = await measure(codeStateUsesTag, {
    files: {
      [NEW_CODE_STATE]: fixture("index_good.ts"),
      ".thunderjar/parameters/codeStates/other/index.ts": fixture("index_tag_in_apply_only.ts"),
    },
  });
  expect(result.metrics.usesTag).toBe(false);
});
