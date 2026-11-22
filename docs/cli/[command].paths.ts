// Read from the data `bun run docs:data` writes: see the note in .vitepress/config.ts.
import data from "../.vitepress/data.generated.json" with { type: "json" };
import type { CommandData, DocsData } from "../../scripts/docs-data.ts";

const { program, commands } = data as DocsData;

// Descriptions go into markdown, which Vue compiles: `<session>` would be read as an unclosed tag.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function commandPage(cmd: CommandData): string {
  return [
    `# ${program.name} ${cmd.name}`,
    "",
    "<AiPlaceholder />",
    "",
    escapeHtml(cmd.description),
    "",
    "```text",
    cmd.help,
    "```",
  ].join("\n");
}

function overviewPage(): string {
  return [
    "# CLI reference",
    "",
    "<AiPlaceholder />",
    "",
    escapeHtml(program.description),
    "",
    "## Commands",
    "",
    ...commands.map(
      (cmd) => `- [\`${cmd.name}\`](./${cmd.name}) — ${escapeHtml(cmd.description)}`,
    ),
    "",
    "## Usage",
    "",
    "```text",
    program.help,
    "```",
  ].join("\n");
}

export default {
  paths() {
    return [
      { params: { command: "index" }, content: overviewPage() },
      ...commands.map((cmd) => ({
        params: { command: cmd.name },
        content: commandPage(cmd),
      })),
    ];
  },
};
