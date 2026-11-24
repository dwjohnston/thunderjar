/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// oxlint rules of Thunderjar's own, for what oxlint's built-in rules can't express. Loaded by the
// `jsPlugins` of .oxlintrc.json.
//
// `thunderjar/no-ambient`: the ambient APIs of scripts/ambient.ts that aren't a global or a
// property: `new Date()` with no arguments, `import { $ } from "bun"`, and imports of a banned
// module. oxlint has no `no-restricted-syntax`, and `no-restricted-imports` is taken by the layers.
// Its options, written by `bun run lint:generate`, are `{ bans: [{ id, kind, message }] }`.

type Ban = { id: string; kind: string; message: string };
type Node = { type: string; [key: string]: any };
type Context = { options: [{ bans: Ban[] }?]; report(problem: { node: Node; message: string }): void };

const noAmbient = {
  meta: { schema: false },
  create(context: Context) {
    const bans = context.options[0]?.bans ?? [];
    const report = (node: Node, ban: Ban, how = "") => context.report({ node, message: `'${ban.id}' is restricted${how}. ${ban.message}` });
    const date = bans.find((b) => b.kind === "date");
    const modules = bans.filter((b) => b.kind === "module");
    const fromBun = new Map(bans.filter((b) => b.kind === "property" && b.id.startsWith("Bun.")).map((b) => [b.id.slice(4), b]));
    const checkDate = (node: Node) => {
      if (date && node.callee.type === "Identifier" && node.callee.name === "Date" && node.arguments.length === 0) report(node, date);
    };
    return {
      NewExpression: checkDate,
      CallExpression: checkDate,
      ImportDeclaration(node: Node) {
        const source = node.source.value;
        const module = modules.find((b) => b.id === source);
        if (module) return report(node, module);
        if (source !== "bun") return;
        for (const specifier of node.specifiers) {
          const name = specifier.type === "ImportSpecifier" ? (specifier.imported.name ?? specifier.imported.value) : undefined;
          const ban = name === undefined ? undefined : fromBun.get(name);
          if (ban) report(specifier, ban, ` (imported from "bun")`);
        }
      },
    };
  },
};

export default { meta: { name: "thunderjar" }, rules: { "no-ambient": noAmbient } };
