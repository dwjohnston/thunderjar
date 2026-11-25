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
import { FakeEnv } from "./FakeEnv";

describe(FakeEnv, () => {
    test("Its defaults: a made-up folder, no variables, no concurrency, a backlog cap of 4, and /tmp", () => {
        expect(FakeEnv()).toEqual({ cwd: "/fake/cwd", variables: {}, uploadBacklogCap: 4, tmpDir: "/tmp" });
    });

    test("A test overrides only what it cares about", () => {
        const env = FakeEnv({ concurrency: 3, tmpDir: "/scratch" });

        expect([env.concurrency, env.tmpDir, env.uploadBacklogCap, env.cwd]).toEqual([3, "/scratch", 4, "/fake/cwd"]);
    });
});
