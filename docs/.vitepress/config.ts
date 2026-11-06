import { defineConfig } from "vitepress";
import type { Command } from "commander";

// Imported at runtime, not bundled: the CLI imports "bun" and HTML files, which Vite can't
// bundle. This needs VitePress to run under Bun (`bun --bun vitepress ...`).
const programPath = new URL("../../src/cli/program.ts", import.meta.url).href;
const { createProgram } = (await import(/* @vite-ignore */ programPath)) as {
  createProgram: () => Command;
};
const commands = createProgram().commands;

export default defineConfig({
  title: "Thunderjar",
  base: "/thunderjar/",
  themeConfig: {
    nav: [{ text: "CLI", link: "/cli/" }],
    sidebar: {
      "/cli/": [
        {
          text: "CLI reference",
          link: "/cli/",
          items: commands.map((cmd) => ({
            text: cmd.name(),
            link: `/cli/${cmd.name()}`,
          })),
        },
      ],
    },
  },
});
