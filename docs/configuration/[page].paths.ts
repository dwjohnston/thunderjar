// The declaration reference, built from the `@docs` comments in src/api/declarations.ts.
// To change it, change those comments: see scripts/docgen.ts for the tags.
import { file } from "bun";
import { parseDocsComments, renderDocs } from "../../scripts/docgen.ts";

const source = new URL("../../src/api/declarations.ts", import.meta.url);

const INTRO = `# Declaration reference

Every file in \`.thunderjar/\` default-exports one of these functions. Each returns its argument
unchanged: its only job is to type-check the declaration. See [Project structure](./) for which
file declares what.

\`\`\`ts
import { declareTestCase } from "thunderjar";
\`\`\`
`;

export default {
  async paths() {
    const entries = parseDocsComments(await file(source).text());
    return [{ params: { page: "reference" }, content: `${INTRO}\n${renderDocs(entries)}` }];
  },
};
