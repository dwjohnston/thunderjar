// Builds the configuration reference from the `@docs` comments in a source file, the way Astro
// builds its configuration reference: https://github.com/withastro/docs/blob/main/scripts/docgen.mjs
//
// Only comments tagged `@docs` are read. Each is either a heading (`@kind heading`), which starts a
// section, or an option, which belongs to the heading before it. The tags:
//
//   @name         the heading or option's name
//   @kind heading this comment starts a section
//   @file         the file a section's declaration lives in
//   @type         the option's type, in braces: `{string[]}`
//   @default      the option's default
//   @description  Markdown, to the end of the comment

const TAGS = ["docs", "kind", "name", "file", "type", "default", "description"] as const;
type Tag = (typeof TAGS)[number];

export type DocsEntry = Partial<Record<Exclude<Tag, "docs">, string>>;

/** The `@docs` comments in `source`, in order, with their tags. */
export function parseDocsComments(source: string): DocsEntry[] {
  const comments = source.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
  return comments.map(commentText).filter((text) => /(^|\s)@docs\b/.test(text)).map(parseTags);
}

/** The text of a `/** … *\/` comment, without its delimiters and leading asterisks. */
function commentText(comment: string): string {
  return comment
    .slice(3, -2)
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, ""))
    .join("\n")
    .replaceAll("*\\/", "*/")
    .trim();
}

function parseTags(text: string): DocsEntry {
  const tagPattern = new RegExp(`(?:^|\\s)@(${TAGS.join("|")})\\b`, "g");
  const entry: DocsEntry = {};
  const matches = [...text.matchAll(tagPattern)];
  matches.forEach((match, i) => {
    const tag = match[1] as Tag;
    const start = match.index + match[0].length;
    const end = matches[i + 1]?.index ?? text.length;
    const value = text.slice(start, end);
    if (tag === "docs") return;
    entry[tag] = tag === "description" ? dedent(value) : value.trim().replace(/^\{([\s\S]*)\}$/, "$1");
  });
  return entry;
}

function dedent(text: string): string {
  return text.replace(/^[ \t]*\n?/, "").trimEnd();
}

/** Inline code that survives backticks in `text`. */
function code(text: string): string {
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}

/** The entries as Markdown: a `##` per heading, a `###` per option. */
export function renderDocs(entries: DocsEntry[]): string {
  const out: string[] = [];
  for (const entry of entries) {
    const heading = entry.kind === "heading";
    out.push(`${heading ? "##" : "###"} ${entry.name ?? "(unnamed)"}`, "");
    const meta = [
      entry.file && `**File:** ${code(entry.file)}`,
      entry.type && `**Type:** ${code(entry.type)}`,
      entry.default && `**Default:** ${code(entry.default)}`,
    ].filter(Boolean);
    if (meta.length) out.push(meta.join("<br>\n"), "");
    if (entry.description) out.push(entry.description, "");
  }
  return out.join("\n").trimEnd() + "\n";
}
