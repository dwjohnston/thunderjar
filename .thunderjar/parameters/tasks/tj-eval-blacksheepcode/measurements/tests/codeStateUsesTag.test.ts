import { expect, test } from "bun:test";
import { measure } from "thunderjar/testing";
import codeStateUsesTag from "../codeStateUsesTag.ts";

const NEW_CODE_STATE = ".thunderjar/parameters/codeStates/new/index.ts";
const fixture = (name: string) => `${import.meta.dir}/fixtures/${name}`;

test("a code state that names the tag in resolve uses it", async () => {
  const result = await measure(codeStateUsesTag, { files: { [NEW_CODE_STATE]: fixture("index_good.ts") } });
  expect(result.metrics.usesTag).toBe(true);
});
