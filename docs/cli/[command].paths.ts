import type { Command } from "commander";

// Imported at runtime, not bundled: see the note in .vitepress/config.ts.
const programPath = new URL("../../src/cli/program.ts", import.meta.url).href;
const { createProgram } = (await import(/* @vite-ignore */ programPath)) as {
  createProgram: () => Command;
};

// Descriptions go into markdown, which Vue compiles: `<session>` would be read as an unclosed tag.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function commandPage(cmd: Command, parent: Command): string {
  return [
    `# ${parent.name()} ${cmd.name()}`,
    "",
    "<AiPlaceholder />",
    "",
    escapeHtml(cmd.description()),
    "",
    "```text",
    cmd.helpInformation().trimEnd(),
    "```",
  ].join("\n");
}

function overviewPage(program: Command): string {
  return [
    "# CLI reference",
    "",
    "<AiPlaceholder />",
    "",
    escapeHtml(program.description()),
    "",
    "## Commands",
    "",
    ...program.commands.map(
      (cmd) => `- [\`${cmd.name()}\`](./${cmd.name()}) — ${escapeHtml(cmd.description())}`,
    ),
    "",
    "## Usage",
    "",
    "```text",
    program.helpInformation().trimEnd(),
    "```",
  ].join("\n");
}

export default {
  paths() {
    const program = createProgram();
    return [
      { params: { command: "index" }, content: overviewPage(program) },
      ...program.commands.map((cmd) => ({
        params: { command: cmd.name() },
        content: commandPage(cmd, program),
      })),
    ];
  },
};
