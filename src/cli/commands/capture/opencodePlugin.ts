/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// The OpenCode plugin `capture install --harness opencode` writes. OpenCode has no shell hooks, so the
// plugin builds the same snake_case JSON the other harnesses pass their hooks, and pipes it to
// `thunderjar capture prompt|stop --harness opencode`.
//
// Written against OpenCode 1.19.5's plugin API, version 1: the `chat.message` hook, and `session.idle`
// through `event`. Version 2 (`ctx.session.hook`, `ctx.event.subscribe`) is different.

/** OpenCode's version this plugin was written and checked against. */
export const OPENCODE_VERSION = "1.19.5";

/** The plugin's source, running `command` for thunderjar, e.g. `thunderjar`. */
export function opencodePlugin(command: string): string {
  return `// Thunderjar capture for OpenCode: records each session's prompts and code as git refs under
// refs/thunderjar/capture/. Written by \`thunderjar capture install --harness opencode\`; remove it with
// \`thunderjar capture uninstall --harness opencode\`.
//
// Written against OpenCode ${OPENCODE_VERSION}'s plugin API (\`chat.message\`, and \`session.idle\` through
// \`event\`). Later versions may change it.

const COMMAND = ${JSON.stringify(command)};

export const ThunderjarCapture = async ({ $, directory }) => {
  // Each session's model, from its prompts, for the end of its turn.
  const models = new Map();

  // Never fails the session: thunderjar logs its own errors to .thunderjar/logs/capture.log.
  const run = async (hook, payload) => {
    try {
      await $\`\${{ raw: COMMAND }} capture \${hook} --harness opencode < \${new Response(JSON.stringify(payload))}\`.quiet().nothrow();
    } catch {}
  };

  return {
    "chat.message": async (input, output) => {
      const model = input.model ? \`\${input.model.providerID}/\${input.model.modelID}\` : undefined;
      if (model) models.set(input.sessionID, model);
      const prompt = output.parts
        .filter((part) => part.type === "text" && !part.synthetic)
        .map((part) => part.text)
        .join("\\n");
      await run("prompt", { session_id: input.sessionID, cwd: directory, prompt, model });
    },
    event: async ({ event }) => {
      if (event.type !== "session.idle") return;
      const sessionID = event.properties.sessionID;
      await run("stop", { session_id: sessionID, cwd: directory, model: models.get(sessionID) });
    },
  };
};
`;
}
