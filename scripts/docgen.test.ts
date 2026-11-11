import { describe, expect, test } from "bun:test";
import { parseDocsComments, renderDocs } from "./docgen.ts";

describe("parseDocsComments", () => {
  test("reads only comments tagged @docs", () => {
    const source = `
/** Not documented. */
/**
 * @docs
 * @kind heading
 * @name declareConfig
 * @file thunderjar.config.ts
 * @description
 * Where things are kept.
 */
type A = {
  /** @docs @name imageStore @type {{ repository: string } | null} @description The registry. */
  imageStore: unknown;
};`;
    expect(parseDocsComments(source)).toEqual([
      { kind: "heading", name: "declareConfig", file: "thunderjar.config.ts", description: "Where things are kept." },
      { name: "imageStore", type: "{ repository: string } | null", description: "The registry." },
    ]);
  });

  test("keeps a description's code blocks and indentation", () => {
    const source = `/**
 * @docs
 * @name cli
 * @description
 * Runs it.
 *
 * \`\`\`ts
 * cli: (ctx) => "go",
 *   // indented
 * \`\`\`
 */`;
    expect(parseDocsComments(source)[0]?.description).toBe(
      'Runs it.\n\n```ts\ncli: (ctx) => "go",\n  // indented\n```',
    );
  });

  test("unescapes */ written as *\\/", () => {
    const source = "/** @docs @name glob @description `**\\\\/isPrime.ts` */".replace("\\\\", "\\");
    expect(parseDocsComments(source)[0]?.description).toBe("`**/isPrime.ts`");
  });
});

describe("renderDocs", () => {
  test("renders headings, options, and their type and default", () => {
    expect(
      renderDocs([
        { kind: "heading", name: "declareConfig", file: "thunderjar.config.ts", description: "Where." },
        { name: "build", type: "{ ssh?: boolean }", default: "{}", description: "Secrets." },
      ]),
    ).toBe(
      "## declareConfig\n\n**File:** `thunderjar.config.ts`\n\nWhere.\n\n" +
        "### build\n\n**Type:** `{ ssh?: boolean }`<br>\n**Default:** `{}`\n\nSecrets.\n",
    );
  });

  test("wraps a type holding backticks in double backticks", () => {
    expect(renderDocs([{ name: "harnessModel", type: "`${h}/${m}`[]" }])).toContain("**Type:** `` `${h}/${m}`[] ``");
  });
});
