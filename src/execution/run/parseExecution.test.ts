/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { DockerContainerError } from "../../services/Docker/errors.ts";
import { parseExecution } from "./parseExecution.ts";

describe("parseExecution", () => {
  test("reads the wrapper's run.json", () => {
    expect(parseExecution('{"startedAt":1793499264123,"finishedAt":1793499265000,"exitCode":3}\n', 600)).toEqual({
      startedAt: 1793499264123,
      finishedAt: 1793499265000,
      exitCode: 3,
      timedOut: false,
      timeoutSeconds: 600,
    });
  });

  test("a run killed for timing out has only its start, and finished when it was killed", () => {
    expect(parseExecution('{"startedAt":1793499264123}\n', 5, 1793499269200)).toEqual({
      startedAt: 1793499264123,
      finishedAt: 1793499269200,
      exitCode: null,
      timedOut: true,
      timeoutSeconds: 5,
    });
  });

  test("a finish before the start, from a clock stepped back mid-run, is taken as the start", () => {
    expect(parseExecution('{"startedAt":1793499264123,"finishedAt":1793499264100,"exitCode":0}\n', 600)).toMatchObject({
      startedAt: 1793499264123,
      finishedAt: 1793499264123,
    });
    expect(parseExecution('{"startedAt":1793499264123}\n', 5, 1793499264100)).toMatchObject({
      startedAt: 1793499264123,
      finishedAt: 1793499264123,
    });
  });

  test("a run that wasn't killed must have finished", () => {
    expect(() => parseExecution('{"startedAt":1793499264123}\n', 5)).toThrow(DockerContainerError);
  });

  test.each([
    ["seconds rather than ms", '{"startedAt":1793499264,"finishedAt":1793499265,"exitCode":0}'],
    ["a literal %3N", '{"startedAt":1793499260%3N,"finishedAt":1793499261%3N,"exitCode":0}'],
    ["a missing exit code", '{"startedAt":1793499264123,"finishedAt":1793499265000}'],
  ])("rejects %s", (_, text) => {
    expect(() => parseExecution(text, 600)).toThrow(DockerContainerError);
  });

  test("rejects a missing run.json", () => {
    expect(() => parseExecution(undefined, 600)).toThrow(DockerContainerError);
    expect(() => parseExecution(undefined, 600, 1793499269200)).toThrow(DockerContainerError);
  });
});
