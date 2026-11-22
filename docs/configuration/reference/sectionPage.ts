// A reference page made of some sections of the declaration reference, e.g. `declareBaseImage`.
import data from "../../.vitepress/data.generated.json" with { type: "json" };
import type { DocsData } from "../../../scripts/docs-data.ts";

export function sectionPage(title: string, sections: string[]): string {
  const { declarationSections = {} } = data as DocsData;
  return [`# ${title}`, "", "<AiPlaceholder />", "", ...sections.map((name) => declarationSections[name] ?? "")].join("\n");
}
