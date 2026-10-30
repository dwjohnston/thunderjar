import type { Command } from "commander";
import { createProgram } from "../../src/cli/program.ts";

function commandPage(cmd: Command, parent: Command): string {
  return [
    `# ${parent.name()} ${cmd.name()}`,
    "",
    cmd.description(),
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
    program.description(),
    "",
    "## Commands",
    "",
    ...program.commands.map(
      (cmd) => `- [\`${cmd.name()}\`](./${cmd.name()}) — ${cmd.description()}`,
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
