// The declaration reference, built from the `@docs` comments in src/api/declarations.ts.
// To change it, change those comments: see scripts/docgen.ts for the tags. `bun run docs:data`
// renders it into .vitepress/data.generated.json: see the note in .vitepress/config.ts.
import data from "../../.vitepress/data.generated.json" with { type: "json" };
import type { DocsData } from "../../../scripts/docs-data.ts";
import { sectionPage } from "./sectionPage.ts";

const INTRO = `# Declaration reference

<AiPlaceholder />

Every file in \`.thunderjar/\` default-exports one of these functions. Each returns its argument
unchanged: its only job is to type-check the declaration. See [the \`.thunderjar/\` folder](../) for which
file declares what.

\`\`\`ts
import { declareTestCase } from "thunderjar";
\`\`\`
`;

// One page per kind of parameter, each with the sections of the reference that declare it. Tasks'
// pages are in tasks/.
const PAGES: { page: string; title: string; sections: string[] }[] = [
  { page: "base-image", title: "Base image", sections: ["declareBaseImage"] },
  { page: "code-state", title: "Code state", sections: ["declareCodeState"] },
  { page: "prompt-set", title: "Prompt set", sections: ["declarePromptSet"] },
  { page: "harness-models", title: "Harness models", sections: ["declareHarness"] },
  { page: "test-case", title: "Test case", sections: ["declareTestCase"] },
];

export default {
  paths() {
    const { declarationReference = "" } = data as DocsData;
    return [
      { params: { page: "existing" }, content: `${INTRO}\n${declarationReference}` },
      ...PAGES.map(({ page, title, sections }) => ({
        params: { page },
        content: sectionPage(title, sections),
      })),
    ];
  },
};
