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
import { describe, expect, test } from "bun:test";
import { writeFile, writeModel, writePrompt, writeRunScript } from "./files.ts";

describe("writeFile", () => {
  test("is a COPY heredoc, its delimiter quoted, so nothing in it is expanded", () => {
    expect(writeFile("/thunderjar/x.txt", "$HOME `whoami`")).toBe("COPY <<'THUNDERJAR_EOF' /thunderjar/x.txt\n$HOME `whoami`\nTHUNDERJAR_EOF");
  });

  test("an executable file is copied in with --chmod=755", () => {
    expect(writeFile("/thunderjar/x.sh", "true", { executable: true })).toStartWith("COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/x.sh\n");
  });

  test("keeps a newline the contents end with, rather than adding another", () => {
    expect(writeFile("/thunderjar/x.txt", "a\n")).toBe("COPY <<'THUNDERJAR_EOF' /thunderjar/x.txt\na\nTHUNDERJAR_EOF");
  });

  test("picks a delimiter that isn't a line of the contents", () => {
    expect(writeFile("/thunderjar/x.txt", "THUNDERJAR_EOF\nTHUNDERJAR_EOF_1")).toBe(
      "COPY <<'THUNDERJAR_EOF_2' /thunderjar/x.txt\nTHUNDERJAR_EOF\nTHUNDERJAR_EOF_1\nTHUNDERJAR_EOF_2",
    );
  });
});

describe("the files a run needs", () => {
  test("writePrompt writes /thunderjar/prompt.txt", () => {
    expect(writePrompt("Hi")).toBe("COPY <<'THUNDERJAR_EOF' /thunderjar/prompt.txt\nHi\nTHUNDERJAR_EOF");
  });

  test("writeModel writes /thunderjar/model.txt", () => {
    expect(writeModel("claude-haiku-5-5")).toBe("COPY <<'THUNDERJAR_EOF' /thunderjar/model.txt\nclaude-haiku-5-5\nTHUNDERJAR_EOF");
  });

  test("writeRunScript writes an executable /thunderjar/thunderjar-run.sh", () => {
    expect(writeRunScript("agent > /thunderjar/result.json")).toBe(
      "COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/thunderjar-run.sh\n#!/bin/sh\nagent > /thunderjar/result.json\nTHUNDERJAR_EOF",
    );
  });
});
