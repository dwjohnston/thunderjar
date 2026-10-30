import { defineConfig } from "vitepress";
import { createProgram } from "../../src/cli/program.ts";

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
