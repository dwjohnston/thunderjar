#!/usr/bin/env bun
// AI-generated script. Review before relying on it.
//
// Writes docs/.vitepress/data.generated.json: what the docs site needs from the CLI and its declarations.
// The docs read that file, never src/, so VitePress runs under Node, which can't run all of the
// CLI's TypeScript.
import { file, write } from "bun";
import type { Command } from "commander";

export type CommandData = { name: string; description: string; help: string };
export type DocsData = {
  program: { name: string; description: string; help: string };
  commands: CommandData[];
  /** The declaration reference as Markdown, from the `@docs` comments in src/api/declarations.ts. */
  declarationReference?: string;
  /** Each `@kind heading` section of it on its own, by heading name, e.g. `declareBaseImage`. */
  declarationSections?: Record<string, string>;
};

const OUTPUT = "docs/.vitepress/data.generated.json";

function help() {
  console.log(`
Write ${OUTPUT}, the CLI and declaration data the docs site reads.

Usage:
  bun scripts/docs-data.ts [root]

Arguments:
  root           The checkout to read src/ from and write into. Default: this repo.
                 The versioned docs build passes an older release's copy.

Options:
  -h, --help     Show this message
`);
}

function describe(cmd: Command): CommandData {
  return { name: cmd.name(), description: cmd.description(), help: cmd.helpInformation().trimEnd() };
}

export async function docsData(root: string): Promise<DocsData> {
  const { createProgram } = (await import(`${root}/src/cli/program.ts`)) as {
    createProgram: () => Command;
  };
  const program = createProgram();
  const data: DocsData = { program: describe(program), commands: program.commands.map(describe) };

  // Older releases may have no declarations, or no generator for them.
  const declarations = file(`${root}/src/api/declarations.ts`);
  const docgenPath = `${root}/scripts/docgen.ts`;
  if ((await declarations.exists()) && (await file(docgenPath).exists())) {
    const { parseDocsComments, renderDocs } = (await import(docgenPath)) as typeof import("./docgen.ts");
    const entries = parseDocsComments(await declarations.text());
    data.declarationReference = renderDocs(entries);
    const sections: Record<string, typeof entries> = {};
    let current: typeof entries | undefined;
    for (const entry of entries) {
      if (entry.kind === "heading") current = sections[entry.name ?? "(unnamed)"] = [];
      current?.push(entry);
    }
    data.declarationSections = Object.fromEntries(
      Object.entries(sections).map(([name, section]) => [name, renderDocs(section)]),
    );
  }
  return data;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    help();
    process.exit(0);
  }
  if (args.length > 1) {
    console.error(`Unexpected arguments: ${args.join(" ")}`);
    help();
    process.exit(1);
  }
  const arg = args[0];
  const root = (arg === undefined
    ? Bun.fileURLToPath(new URL("..", import.meta.url))
    : arg.startsWith("/") ? arg : `${process.cwd()}/${arg}`
  ).replace(/\/$/, "");
  await write(`${root}/${OUTPUT}`, `${JSON.stringify(await docsData(root), null, 2)}\n`);
  console.log(`Wrote ${root}/${OUTPUT}`);
}
