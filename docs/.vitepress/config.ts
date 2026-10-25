import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Thunderjar",
  base: process.env.THUNDERJAR_DOCS_BASE ?? "/thunderjar/",
  outDir: process.env.THUNDERJAR_DOCS_OUT_DIR,
  themeConfig: {
    versionInfo: {
      current: process.env.THUNDERJAR_DOCS_CURRENT ?? "development",
      versions: JSON.parse(process.env.THUNDERJAR_DOCS_VERSIONS ?? "[]") as string[],
      root: "/thunderjar/",
    },
  },
});
