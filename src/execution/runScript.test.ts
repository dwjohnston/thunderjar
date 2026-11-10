/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: Claude
 * Session Id: session_01LCLeLkGEjKg1CyLY5YY6bJ
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { declareHarness, declareInitialPrompt } from "../api/declarations.ts";
import { TMP_DIR } from "../testing/cli.ts";
import { bakedFileList, bakedFiles, copyPromptsAndScript, runScript, scriptTurns } from "./runScript.ts";

const harness = declareHarness({
  version: "1.0.0",
  cli: (ctx) => `agent --model ${ctx.modelId} --session ${ctx.sessionId} --prompt-file ${ctx.promptPath} > ${ctx.resultPath}`,
});

describe("scriptTurns", () => {
  test("a single prompt reads /thunderjar/prompt.txt and leaves /thunderjar/result.json", () => {
    const turns = scriptTurns(harness, "model-a", declareInitialPrompt({ prompt: "Hi", timeoutSeconds: 1 }), undefined);

    expect(turns).toEqual([
      {
        prompt: "Hi",
        promptPath: "/thunderjar/prompt.txt",
        resultPath: "/thunderjar/result.json",
        command: "agent --model model-a --session $THUNDERJAR_SESSION_ID --prompt-file /thunderjar/prompt.txt > /thunderjar/result.json",
      },
    ]);
  });

  test("turns read /thunderjar/prompts/<n>.txt and leave /thunderjar/turns/<n>/result.json, apart, so COPY's root-owned files are never written to", () => {
    const turns = scriptTurns(harness, "model-a", declareInitialPrompt({ turns: ["One", "Two"], timeoutSeconds: 1 }), undefined);

    expect(turns.map(({ promptPath, resultPath }) => [promptPath, resultPath])).toEqual([
      ["/thunderjar/prompts/1.txt", "/thunderjar/turns/1/result.json"],
      ["/thunderjar/prompts/2.txt", "/thunderjar/turns/2/result.json"],
    ]);
  });
});

describe("bakedFiles", () => {
  test("the model ID, each prompt exactly, and the run script, by their path in the image", () => {
    const turns = scriptTurns(harness, "model-a", declareInitialPrompt({ prompt: "No newline", timeoutSeconds: 1 }), undefined);

    expect(Object.keys(bakedFileList(bakedFiles("model-a", turns)))).toEqual([
      "/thunderjar/model.txt",
      "/thunderjar/prompt.txt",
      "/thunderjar/thunderjar-run.sh",
    ]);
    expect(bakedFileList(bakedFiles("model-a", turns))["/thunderjar/prompt.txt"]).toBe("No newline");
  });

  test("turns are copied in as a folder, and the script as an executable", () => {
    const turns = scriptTurns(harness, "model-a", declareInitialPrompt({ turns: ["One", "Two"], timeoutSeconds: 1 }), undefined);

    expect(copyPromptsAndScript(bakedFiles("model-a", turns))).toBe(
      "COPY thunderjar/prompts/ /thunderjar/prompts/\nCOPY --chmod=755 thunderjar/thunderjar-run.sh /thunderjar/thunderjar-run.sh",
    );
  });
});

describe("runScript", () => {
  /** Runs `script`, with /thunderjar mapped to a fresh folder, and returns that folder. */
  const run = async (script: string, env: Record<string, string> = {}) => {
    const dir = `${TMP_DIR}/run-script-${crypto.randomUUID()}`;
    await $`mkdir -p ${dir}`.quiet();
    const mapped = script.replaceAll("/thunderjar", dir);
    const result = await $`sh -c ${mapped}`.cwd(dir).env({ PATH: Bun.env.PATH ?? "/usr/bin:/bin", ...env }).quiet().nothrow();
    return { dir, exitCode: result.exitCode };
  };

  test("records how it ran, and gives each turn the session ID it's given", async () => {
    const { dir } = await run(runScript([{ resultPath: "/thunderjar/result.json", command: 'echo "$THUNDERJAR_SESSION_ID" > /thunderjar/result.json' }]), {
      THUNDERJAR_SESSION_ID: "session-1",
    });

    expect(await Bun.file(`${dir}/result.json`).text()).toBe("session-1\n");
    const ran = await Bun.file(`${dir}/run.json`).json();
    expect(ran).toEqual({ startedAt: expect.any(Number), finishedAt: expect.any(Number), exitCode: 0 });
    await $`rm -rf ${dir}`.quiet();
  });

  test("run by hand, without a session ID, it makes one", async () => {
    const { dir } = await run(runScript([{ resultPath: "/thunderjar/result.json", command: 'echo "$THUNDERJAR_SESSION_ID" > /thunderjar/result.json' }]));

    expect((await Bun.file(`${dir}/result.json`).text()).trim()).toMatch(/^[0-9a-f-]{36}$/);
    await $`rm -rf ${dir}`.quiet();
  });

  test("stops at the first turn that exits non-zero, recording each turn that ran", async () => {
    const { dir } = await run(
      runScript([
        { resultPath: "/thunderjar/turns/1/result.json", command: "exit 3" },
        { resultPath: "/thunderjar/turns/2/result.json", command: "touch /thunderjar/turns/2/ran" },
      ]),
    );

    const ran = await Bun.file(`${dir}/run.json`).json();
    expect(ran.exitCode).toBe(3);
    expect(ran.turns).toHaveLength(1);
    expect(await Bun.file(`${dir}/turns/2/ran`).exists()).toBe(false);
    await $`rm -rf ${dir}`.quiet();
  });
});
