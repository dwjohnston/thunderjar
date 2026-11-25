/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, it } from "bun:test";
import { plan } from "../plan/plan.ts";
import { config, fakes } from "../testing/fixtures.ts";
import { runManifest } from "./runManifest.ts";

/** Each distinct value, in the order it first appeared. */
const changes = <T>(values: T[]): T[] => values.filter((value, i) => i === 0 || JSON.stringify(value) !== JSON.stringify(values[i - 1]));

describe(runManifest, () => {
    it("happy path: records the execution as running, runs each run in turn, then records it complete", async () => {
        const deps = fakes();
        const testCase = config({ permutationCount: 2 });
        const manifest = plan(testCase, { concurrency: 1, executionId: "01exec" });

        const records = await runManifest(manifest, testCase, deps);

        // Every run completed.
        expect(records.map(({ runId, outcome }) => `${runId} ${outcome}`)).toEqual([
            "01exec-p1000000-i1 completed",
            "01exec-p2000000-i1 completed",
        ]);


        // The state at the end. toMatchObject ignores what isn't listed, such as each run's full record.
        expect(deps.state.get().run).toMatchObject({
            execution: {
                executionId: "01exec",
                testCase: "example",
                task: "is-prime",
                status: "complete",
                startedAt: "1970-01-01T00:16:40.000Z",
                finishedAt: "1970-01-01T00:16:40.000Z",
                matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 1 },
            },
            images: {},
            runs: {
                // 🙋‍♂️ nb. these is not the full objects  
                // There is also a record object that 
                "01exec-p1000000-i1": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
                "01exec-p2000000-i1": { status: "committed", startedAt: 1000001000000, finishedAt: 1000001000000 },
            },
            timings: {
                agent: { count: 2, maxMs: 0, totalMs: 0 },
                collect: { count: 2, maxMs: 0, totalMs: 0 },
                commit: { count: 2, maxMs: 0, totalMs: 0 },
            },
            uploadBacklog: 0,
        });

        // history() is the state after every update. There are 16 here:
        //   0      the empty state, before anything happens
        //   1      every run queued, in one update
        //   2      the execution recorded as running
        //   3-8    run 1: running → agent timed → output collected → committing → commit timed → committed, with its record
        //   9-14   run 2: the same 6 steps
        //   15     the execution recorded as complete
        // So each run is 6 updates: 3 status changes, and 3 timings (agent, collect, commit).
        expect(deps.state.history()).toHaveLength(16);


        // 0: the empty state, before anything happens
        expect(Object.keys(deps.state.history().at(0)!.run.runs).length).toBe(0);
        expect(deps.state.history().at(0)!.run.execution).toBeUndefined();

        // 1: every run queued, in one update
        expect(deps.state.history().at(1)!.run.runs["01exec-p1000000-i1"]?.status).toBe("queued");
        expect(deps.state.history().at(1)!.run.runs["01exec-p2000000-i1"]?.status).toBe("queued");
        expect(deps.state.history().at(1)!.run.execution).toBeUndefined();

        // 2: the execution recorded as running
        expect(deps.state.history().at(2)!.run.execution?.status).toBe("running");

        // 3-8: run 1: running, its agent timed, its output collected, committing, its commit timed, then committed with its record
        expect(deps.state.history().at(3)!.run.runs["01exec-p1000000-i1"]?.status).toBe("running");
        expect(deps.state.history().at(4)!.run.timings?.agent?.count).toBe(1);
        expect(deps.state.history().at(5)!.run.timings?.collect?.count).toBe(1);
        expect(deps.state.history().at(6)!.run.runs["01exec-p1000000-i1"]?.status).toBe("committing");
        expect(deps.state.history().at(7)!.run.timings?.commit?.count).toBe(1);
        expect(deps.state.history().at(7)!.run.runs["01exec-p1000000-i1"]?.record).toBeUndefined();
        expect(deps.state.history().at(8)!.run.runs["01exec-p1000000-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(8)!.run.runs["01exec-p1000000-i1"]?.record).toBeDefined();
        expect(deps.state.history().at(8)!.run.runs["01exec-p2000000-i1"]?.status).toBe("queued");

        // 9-14: run 2: running, its agent timed, its output collected, committing, its commit timed, then committed with its record
        expect(deps.state.history().at(9)!.run.runs["01exec-p2000000-i1"]?.status).toBe("running");
        expect(deps.state.history().at(10)!.run.timings?.agent?.count).toBe(2);
        expect(deps.state.history().at(11)!.run.timings?.collect?.count).toBe(2);
        expect(deps.state.history().at(12)!.run.runs["01exec-p2000000-i1"]?.status).toBe("committing");
        expect(deps.state.history().at(13)!.run.timings?.commit?.count).toBe(2);
        expect(deps.state.history().at(13)!.run.runs["01exec-p2000000-i1"]?.record).toBeUndefined();
        expect(deps.state.history().at(14)!.run.runs["01exec-p2000000-i1"]?.status).toBe("committed");
        expect(deps.state.history().at(14)!.run.runs["01exec-p2000000-i1"]?.record).toBeDefined();

        // 15: the execution recorded as complete
        expect(deps.state.history().at(15)!.run.execution?.status).toBe("complete");

        expect(deps.state.history()).toMatchInlineSnapshot(`
          [
            {
              "run": {
                "images": {},
                "runs": {},
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "status": "queued",
                  },
                  "01exec-p2000000-i1": {
                    "status": "queued",
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "status": "queued",
                  },
                  "01exec-p2000000-i1": {
                    "status": "queued",
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "startedAt": 1000000,
                    "status": "running",
                  },
                  "01exec-p2000000-i1": {
                    "status": "queued",
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "startedAt": 1000000,
                    "status": "running",
                  },
                  "01exec-p2000000-i1": {
                    "status": "queued",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "startedAt": 1000000,
                    "status": "running",
                  },
                  "01exec-p2000000-i1": {
                    "status": "queued",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "startedAt": 1000001000000,
                    "status": "committing",
                  },
                  "01exec-p2000000-i1": {
                    "status": "queued",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "startedAt": 1000001000000,
                    "status": "committing",
                  },
                  "01exec-p2000000-i1": {
                    "status": "queued",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-1",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage1000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState1000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-1/model",
                          "parameterHash": "harnessModel1000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt100000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet1000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 1,
                      "permutationHash": "p100000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-1-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                  "01exec-p2000000-i1": {
                    "status": "queued",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-1",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage1000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState1000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-1/model",
                          "parameterHash": "harnessModel1000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt100000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet1000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 1,
                      "permutationHash": "p100000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-1-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                  "01exec-p2000000-i1": {
                    "startedAt": 1000000,
                    "status": "running",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-1",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage1000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState1000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-1/model",
                          "parameterHash": "harnessModel1000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt100000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet1000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 1,
                      "permutationHash": "p100000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-1-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                  "01exec-p2000000-i1": {
                    "startedAt": 1000000,
                    "status": "running",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-1",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage1000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState1000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-1/model",
                          "parameterHash": "harnessModel1000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt100000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet1000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 1,
                      "permutationHash": "p100000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-1-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                  "01exec-p2000000-i1": {
                    "startedAt": 1000000,
                    "status": "running",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-1",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage1000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState1000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-1/model",
                          "parameterHash": "harnessModel1000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt100000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet1000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 1,
                      "permutationHash": "p100000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-1-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                  "01exec-p2000000-i1": {
                    "finishedAt": 1000001000000,
                    "startedAt": 1000001000000,
                    "status": "committing",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 1,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-1",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage1000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState1000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-1/model",
                          "parameterHash": "harnessModel1000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt100000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet1000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 1,
                      "permutationHash": "p100000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-1-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                  "01exec-p2000000-i1": {
                    "finishedAt": 1000001000000,
                    "startedAt": 1000001000000,
                    "status": "committing",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "running",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-1",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage1000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState1000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-1/model",
                          "parameterHash": "harnessModel1000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt100000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet1000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 1,
                      "permutationHash": "p100000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-1-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                  "01exec-p2000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-2",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage2000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState2000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-2/model",
                          "parameterHash": "harnessModel2000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt200000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet2000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 2,
                      "permutationHash": "p200000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-2-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
            {
              "run": {
                "execution": {
                  "executionId": "01exec",
                  "finishedAt": "1970-01-01T00:16:40.000Z",
                  "matrix": {
                    "iterations": 1,
                    "permutations": 2,
                    "shape": [
                      1,
                      1,
                      1,
                      2,
                      1,
                    ],
                  },
                  "startedAt": "1970-01-01T00:16:40.000Z",
                  "status": "complete",
                  "task": "is-prime",
                  "testCase": "example",
                },
                "images": {},
                "runs": {
                  "01exec-p1000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-1",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage1000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState1000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-1/model",
                          "parameterHash": "harnessModel1000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt100000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet1000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 1,
                      "permutationHash": "p100000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-1-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                  "01exec-p2000000-i1": {
                    "finishedAt": 1000001000000,
                    "record": {
                      "execution": {
                        "exitCode": 0,
                        "finishedAt": 1000001000000,
                        "startedAt": 1000001000000,
                        "timedOut": false,
                        "timeoutSeconds": 600,
                      },
                      "executionId": "01exec",
                      "harnessModel": {
                        "harness": "harness-2",
                        "modelId": "model",
                        "version": "1.0.0",
                      },
                      "harnessResult": null,
                      "harnessStderr": null,
                      "iteration": 1,
                      "parameters": {
                        "baseImage": {
                          "name": "node20",
                          "parameterHash": "baseImage2000000000000000000000000000000000000000000000000000000",
                        },
                        "codeState": {
                          "name": "baseline",
                          "parameterHash": "codeState2000000000000000000000000000000000000000000000000000000",
                        },
                        "harnessModel": {
                          "name": "harness-2/model",
                          "parameterHash": "harnessModel2000000000000000000000000000000000000000000000000000",
                        },
                        "initialPrompt": {
                          "name": "plain",
                          "parameterHash": "initialPrompt200000000000000000000000000000000000000000000000000",
                        },
                        "promptSet": {
                          "name": "none",
                          "parameterHash": "promptSet2000000000000000000000000000000000000000000000000000000",
                        },
                      },
                      "permutation": 2,
                      "permutationHash": "p200000000000000000000000000000000000000000000000000000000000000",
                      "postrunImage": "thunderjar-postrun:01exec-2-1",
                      "ranAt": "2001-09-09T02:03:20.000Z",
                      "reply": {
                        "outcome": "unavailable",
                        "reason": "the agent left no result file",
                      },
                      "result": {},
                      "task": "is-prime",
                      "testCase": "example",
                      "tokenCosts": {
                        "outcome": "unavailable",
                        "reason": "absent",
                      },
                    },
                    "startedAt": 1000001000000,
                    "status": "committed",
                  },
                },
                "timings": {
                  "agent": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "collect": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                  "commit": {
                    "count": 2,
                    "maxMs": 0,
                    "totalMs": 0,
                  },
                },
                "uploadBacklog": 0,
              },
            },
          ]
        `)


        // The run data store has the execution, complete, and a record of each run.
        expect(await deps.runStore.listExecutions()).toMatchObject([{ executionId: "01exec", status: "complete", matrix: { permutations: 2, iterations: 1 } }]);
        expect(await deps.runStore.containerRunsOf("01exec")).toMatchObject([{ permutation: 1 }, { permutation: 2 }]);
    });
});
