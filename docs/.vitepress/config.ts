import { defineConfig } from "vitepress";
import data from "./data.generated.json" with { type: "json" };
import type { DocsData } from "../../scripts/docs-data.ts";

// The docs never import src/: the CLI's TypeScript needs Bun, and VitePress runs under Node.
// `bun run docs:data` (scripts/docs-data.ts) writes what they need from it to data.generated.json, which the
// docs scripts run first.
const { commands } = data as DocsData;

export default defineConfig({
  title: "Thunderjar",
  base: "/thunderjar/",
  // The base differs per docs version, so the icon's path is built from it.
  transformHead: ({ siteConfig }) => [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${siteConfig.site.base}favicon.svg` }],
  ],
  // Dark by default, with the light/dark toggle in the nav.
  appearance: "dark",
  themeConfig: {
    nav: [{ text: "Docs", link: "/getting-started" }],
    socialLinks: [{ icon: "github", link: "https://github.com/dwjohnston/thunderjar" }],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/getting-started" },
          { text: "Motivation", link: "/motivation" },
          { text: "How it works", link: "/how-it-works" },
          {
            text: "What it's not suitable for",
            link: "/what-its-not-suitable-for",
          },
          { text: "Roadmap", link: "/roadmap" },
        ],
      },
      {
        text: "Configuration",
        items: [
          { text: ".thunderjar/", link: "/configuration/" },
          {
            text: "Declaration reference",
            collapsed: true,
            items: [
              { text: "Base image", link: "/configuration/reference/base-image" },
              { text: "Code state", link: "/configuration/reference/code-state" },
              { text: "Prompt set", link: "/configuration/reference/prompt-set" },
              { text: "Harness models", link: "/configuration/reference/harness-models" },
              {
                text: "Tasks",
                collapsed: true,
                items: [
                  { text: "Initial prompt", link: "/configuration/reference/tasks/initial-prompt" },
                  { text: "Measurement", link: "/configuration/reference/tasks/measurement" },
                ],
              },
              { text: "Test case", link: "/configuration/reference/test-case" },
              { text: "Existing", link: "/configuration/reference/existing" },
            ],
          },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Tweak skill descriptions", link: "/guides/tweak-skill-descriptions" },
          { text: "Compare models", link: "/guides/compare-models" },
        ],
      },
      {
        text: "Writing measurements",
        items: [{ text: "Overview", link: "/writing-measurements/" }],
      },
      {
        text: "Thunderjar capture",
        items: [
          { text: "Overview", link: "/thunderjar-capture/" },
          { text: "/tj-oneshot", link: "/thunderjar-capture/tj-oneshot" },
          {
            text: "Creating test cases from captures",
            link: "/thunderjar-capture/creating-test-cases-from-captures",
          },
        ],
      },
      {
        text: "Remote runtimes",
        items: [{ text: "Overview", link: "/remote-runtimes/" }],
      },
      {
        text: "CLI reference",
        link: "/cli/",
        items: commands.map((cmd) => ({
          text: cmd.name,
          link: `/cli/${cmd.name}`,
        })),
      },
    ],
  },
});
