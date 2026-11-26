// Unit tests of the built-in instruments, each against a context over a temporary folder on the
// host, standing in for a measurement container.
import { afterAll, describe, expect, test } from "bun:test";
import { $, Glob } from "bun";
import type { MeasurementContext, Reply, SkillsInvoked, ToolCall, ToolCalls } from "../api/declarations.ts";
import { TMP_DIR } from "../testing/cli.ts";
import { bunTestFile, fileCreated, fileRead, grep, instruments, isInstrumentName, jsAst, replyMatches, shell, skillInvoked, STDOUT_LIMIT, toolCalled } from "./instruments.ts";

const ROOT = `${TMP_DIR}/instruments-${crypto.randomUUID()}`;

afterAll(async () => {
  await $`rm -rf ${ROOT}`.quiet();
});

/** A folder holding `files`, `""` each if given as a list. */
async function folderWith(files: string[] | Record<string, string>): Promise<string> {
  const dir = `${ROOT}/${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  const contents = Array.isArray(files) ? Object.fromEntries(files.map((file) => [file, ""])) : files;
  for (const [file, content] of Object.entries(contents)) await Bun.write(`${dir}/${file}`, content);
  return dir;
}

const NO_REPLY: Reply = { outcome: "unavailable", reason: "its harness has no collectReply" };

const NO_TOOL_CALLS: ToolCalls = { outcome: "unavailable", reason: "its harness has no collectToolCalls" };

const NO_SKILLS: SkillsInvoked = { outcome: "unavailable", reason: "its harness has no collectSkillsInvoked" };

/** A context whose workdir is a folder holding `files`, of a run whose reply is `reply`, and whose skills invoked are `skills`. */
async function contextWith(files: string[] | Record<string, string>, reply: Reply = NO_REPLY, skills: SkillsInvoked = NO_SKILLS): Promise<MeasurementContext> {
  const workdir = await folderWith(files);
  return {
    workdir,
    harnessResult: "",
    reply,
    replies: [reply],
    skillsInvoked: async () => skills,
    toolCalls: async () => NO_TOOL_CALLS,
    exec: async (command) => {
      const { stdout, stderr, exitCode } = await $`sh -c ${command}`.cwd(workdir).quiet().nothrow();
      return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode };
    },
    readFile: (path) => Bun.file(`${workdir}/${path}`).text(),
    writeFile: async (path, contents) => {
      await Bun.write(`${workdir}/${path}`, contents);
    },
    glob: async (pattern) => (await Array.fromAsync(new Glob(pattern).scan({ cwd: workdir, dot: true }))).toSorted(),
  };
}

describe("skillInvoked", () => {
  const invoking = (skills: string[]) => contextWith([], NO_REPLY, { outcome: "collected", skills });

  test("is, for each skill, whether the agent invoked it, by its exact name", async () => {
    expect(await skillInvoked.evaluate({ skills: ["tj-test-case", "tj-test", "tj-config"] }, await invoking(["tj-general", "tj-test-case"]))).toEqual({
      outcome: "measured",
      data: { "tj-test-case": true, "tj-test": false, "tj-config": false },
    });
    expect(await skillInvoked.evaluate({ skills: ["tj-test-case"] }, await invoking([]))).toEqual({ outcome: "measured", data: { "tj-test-case": false } });
  });

  test("is skipped, saying why, when the skills can't be read", async () => {
    expect(await skillInvoked.evaluate({ skills: ["tj-test-case"] }, await contextWith([]))).toEqual({
      outcome: "skipped",
      reason: "no skills invoked to read: its harness has no collectSkillsInvoked",
    });
  });

  test("needs a list of at least one skill's name", () => {
    expect(skillInvoked.checkConfig({ skills: ["tj-test-case"] })).toEqual([]);
    const problem = (got: string): [string, string][] => [["config.skills", `must be a list of skills' names, at least one, got ${got}`]];
    expect(skillInvoked.checkConfig({})).toEqual(problem("undefined"));
    expect(skillInvoked.checkConfig({ skills: "tj-test-case" })).toEqual(problem('"tj-test-case"'));
    expect(skillInvoked.checkConfig({ skills: [] })).toEqual(problem("[]"));
    expect(skillInvoked.checkConfig({ skills: ["a", ""] })).toEqual(problem('["a",""]'));
  });
});

/** A context of a run whose tool calls are `calls`, in `/workspace`. */
const calling = async (calls: ToolCall[]): Promise<MeasurementContext> => ({ ...(await contextWith([])), workdir: "/workspace", toolCalls: async () => ({ outcome: "collected", calls }) });

describe("toolCalled", () => {
  const calls: ToolCall[] = [
    { tool: "Read", kind: "read", paths: ["a.ts"] },
    { tool: "Bash", kind: "shell", paths: [], command: "ls" },
    { tool: "Bash", kind: "shell", paths: [], command: "pwd" },
    { tool: "TodoWrite", kind: "other", paths: [] },
  ];

  test("counts the calls of each kind, or of each tool by its harness's name", async () => {
    expect(await toolCalled.evaluate({ tools: ["shell", "read", "Read", "TodoWrite", "web", "view"] }, await calling(calls))).toEqual({
      outcome: "measured",
      data: { shell: 2, read: 1, Read: 1, TodoWrite: 1, web: 0, view: 0 },
    });
  });

  test("is skipped, saying why, when the tool calls can't be read", async () => {
    expect(await toolCalled.evaluate({ tools: ["shell"] }, await contextWith([]))).toEqual({ outcome: "skipped", reason: "no tool calls to read: its harness has no collectToolCalls" });
  });

  test("needs a list of at least one tool", () => {
    expect(toolCalled.checkConfig({ tools: ["shell"] })).toEqual([]);
    const problem = (got: string): [string, string][] => [["config.tools", `must be a list of tool kinds or names, at least one, got ${got}`]];
    expect(toolCalled.checkConfig({})).toEqual(problem("undefined"));
    expect(toolCalled.checkConfig({ tools: [] })).toEqual(problem("[]"));
    expect(toolCalled.checkConfig({ tools: ["shell", ""] })).toEqual(problem('["shell",""]'));
  });
});

describe("fileRead", () => {
  test("is, for each path or glob, whether a read tool or a shell command read a matching file", async () => {
    const ctx = await calling([
      { tool: "Read", kind: "read", paths: ["/workspace/AGENTS.md"] },
      { tool: "Bash", kind: "shell", paths: [], command: "cat docs/guide.md | head -5" },
      { tool: "Write", kind: "edit", paths: ["/workspace/notes.txt"] },
    ]);
    expect(await fileRead.evaluate({ paths: ["AGENTS.md", "docs/*.md", "notes.txt", "/workspace/AGENTS.md", "README.md"] }, ctx)).toEqual({
      outcome: "measured",
      data: { "AGENTS.md": true, "docs/*.md": true, "notes.txt": false, "/workspace/AGENTS.md": true, "README.md": false },
    });
  });

  test("is skipped, saying why, when the tool calls can't be read", async () => {
    expect(await fileRead.evaluate({ paths: ["AGENTS.md"] }, await contextWith([]))).toEqual({ outcome: "skipped", reason: "no tool calls to read: its harness has no collectToolCalls" });
  });

  test("needs a list of at least one path, not from ~", () => {
    expect(fileRead.checkConfig({ paths: ["AGENTS.md", "/etc/hosts"] })).toEqual([]);
    const problem = (got: string): [string, string][] => [["config.paths", `must be a list of paths or globs, relative to the workdir or absolute, at least one, got ${got}`]];
    expect(fileRead.checkConfig({ paths: [] })).toEqual(problem("[]"));
    expect(fileRead.checkConfig({ paths: ["~/.bashrc"] })).toEqual(problem('["~/.bashrc"]'));
  });
});

describe("replyMatches", () => {
  const replying = (text: string) => contextWith([], { outcome: "collected", text });

  test("is whether the agent's reply matches the pattern", async () => {
    expect(await replyMatches.evaluate({ pattern: "\\bEli\\b" }, await replying("The boy's name is Eli."))).toEqual({ outcome: "measured", data: true });
    expect(await replyMatches.evaluate({ pattern: "\\bEli\\b" }, await replying("The boy's name is Elias."))).toEqual({ outcome: "measured", data: false });
    // Case-sensitive, as a JavaScript RegExp without flags is.
    expect(await replyMatches.evaluate({ pattern: "^arr" }, await replying("Arr, matey"))).toEqual({ outcome: "measured", data: false });
    expect(await replyMatches.evaluate({ pattern: "^Arr" }, await replying("Arr, matey"))).toEqual({ outcome: "measured", data: true });
  });

  test("measures the reply to `turn`, counting from 1, or by default the last", async () => {
    const replies: Reply[] = [
      { outcome: "collected", text: "I'll remember that your rubber ducky is called Eli." },
      { outcome: "collected", text: "I don't know." },
    ];
    const ctx = { ...(await contextWith([])), reply: replies[1] as Reply, replies };

    expect(await replyMatches.evaluate({ pattern: "Eli" }, ctx)).toEqual({ outcome: "measured", data: false });
    expect(await replyMatches.evaluate({ pattern: "Eli", turn: 1 }, ctx)).toEqual({ outcome: "measured", data: true });
    expect(await replyMatches.evaluate({ pattern: "Eli", turn: 3 }, ctx)).toEqual({ outcome: "skipped", reason: "no turn 3: the initial prompt has 2" });
    expect(replyMatches.checkConfig({ pattern: "Eli", turn: 0 })).toEqual([["config.turn", "must be a turn, counting from 1, got 0"]]);
  });

  test("a run without a reply is skipped, saying why", async () => {
    expect(await replyMatches.evaluate({ pattern: "Eli" }, await contextWith([]))).toEqual({
      outcome: "skipped",
      reason: "no reply: its harness has no collectReply",
    });
  });

  test("a pattern that isn't a regular expression is a config problem", () => {
    expect(replyMatches.checkConfig({ pattern: "Eli(" })).toEqual([["config.pattern", '"Eli(" is not a valid regular expression: missing )']]);
    expect(replyMatches.checkConfig({})).toEqual([["config.pattern", "must be a JavaScript regular expression, got undefined"]]);
    expect(replyMatches.checkConfig({ pattern: "Eli" })).toEqual([]);
  });
});

describe("shell", () => {
  const ran = (exitCode: number, stdout = "") => ({ outcome: "measured" as const, data: { exitCode, stdout, stdoutTruncated: false } });

  test("is the command's exit code and stdout, as they are, and a non-zero exit is still measured", async () => {
    const ctx = await contextWith({ "isPrime.ts": "export const isPrime = (n: number) => n > 1;\n" });
    expect(await shell.evaluate({ command: "test -f isPrime.ts" }, ctx)).toEqual(ran(0));
    expect(await shell.evaluate({ command: "test -f isEven.ts" }, ctx)).toEqual(ran(1));
    expect(await shell.evaluate({ command: "echo 'not JSON' && exit 3" }, ctx)).toEqual(ran(3, "not JSON\n"));
  });

  test("runs any shell command, with pipes and quotes, in the workdir", async () => {
    const ctx = await contextWith({ "src/isPrime.ts": "line 1\nline 2\nline 3\n" });
    expect(await shell.evaluate({ command: `test "$(wc -l < src/isPrime.ts)" -lt 5` }, ctx)).toEqual(ran(0));
    expect(await shell.evaluate({ command: "cat src/isPrime.ts | grep 'line 2'" }, ctx)).toEqual(ran(0, "line 2\n"));
  });

  test("a command that isn't found is a non-zero exit, not an error", async () => {
    expect(await shell.evaluate({ command: "no-such-command" }, await contextWith([]))).toEqual(ran(127));
  });

  test("keeps the first 64 KiB of stdout, without splitting a character, and says it was cut", async () => {
    const ctx = await contextWith([]);
    // 65,535 bytes of "a", then "é", two bytes, across the limit.
    const result = await shell.evaluate({ command: `printf 'a%.0s' $(seq ${STDOUT_LIMIT - 1}); printf 'é and more'` }, ctx);
    expect(result).toEqual({ outcome: "measured", data: { exitCode: 0, stdout: "a".repeat(STDOUT_LIMIT - 1), stdoutTruncated: true } });
    expect(await shell.evaluate({ command: `printf 'a%.0s' $(seq ${STDOUT_LIMIT})` }, ctx)).toEqual({
      outcome: "measured",
      data: { exitCode: 0, stdout: "a".repeat(STDOUT_LIMIT), stdoutTruncated: false },
    });
  });

  test("its default score is whether the command exited 0", () => {
    expect(shell.defaultScore).toMatchObject({ kind: "boolean" });
    expect(shell.defaultScore!.score({ exitCode: 0, stdout: "", stdoutTruncated: false })).toBe(true);
    expect(shell.defaultScore!.score({ exitCode: 2, stdout: "", stdoutTruncated: false })).toBe(false);
  });

  test("checks its config is a command", () => {
    expect(shell.checkConfig({ command: "bunx tsc --noEmit" })).toEqual([]);
    expect(shell.checkConfig({})).toEqual([["config.command", "must be a shell command, got undefined"]]);
    expect(shell.checkConfig({ command: "" })).toEqual([["config.command", 'must be a shell command, got ""']]);
  });
});

describe("fileCreated", () => {
  test("is true when the glob matches a file, and false when nothing does", async () => {
    expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, await contextWith(["isPrime.ts", "README.md"]))).toEqual({
      outcome: "measured",
      data: true,
    });
    expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, await contextWith(["isprime.ts", "src/isPrime.js"]))).toEqual({
      outcome: "measured",
      data: false,
    });
    expect(await fileCreated.evaluate({ glob: "**/*" }, await contextWith([]))).toEqual({ outcome: "measured", data: false });
  });

  test("finds a nested match, which a top-level glob doesn't", async () => {
    const ctx = await contextWith(["src/lib/isPrime.ts"]);
    expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: true });
    expect(await fileCreated.evaluate({ glob: "isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: false });
  });

  test("checks its config is a glob", () => {
    expect(fileCreated.checkConfig({ glob: "**/isPrime.ts" })).toEqual([]);
    expect(fileCreated.checkConfig({ path: "isPrime.ts" })).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
    expect(fileCreated.checkConfig(undefined)).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
    expect(fileCreated.checkConfig({ glob: 3 })).toEqual([["config.glob", "must be a glob pattern, got 3"]]);
  });
});

describe("grep", () => {
  test("is skipped when no file matches the glob, rather than counting 0", async () => {
    const ctx = await contextWith({ "README.md": "// @ts-ignore\n" });
    expect(await grep.evaluate({ glob: "**/*.ts", pattern: "@ts-ignore" }, ctx)).toEqual({
      outcome: "skipped",
      reason: "no file matches **/*.ts",
    });
  });

  test("counts matching lines across every file the glob matches", async () => {
    const ctx = await contextWith({
      "isPrime.ts": "// @ts-ignore\nexport const a = 1;\n// @ts-ignore\n",
      "src/util.ts": "// @ts-ignore\n",
      "src/none.ts": "export {};\n",
      "notes.md": "// @ts-ignore\n",
    });
    expect(await grep.evaluate({ glob: "**/*.ts", pattern: "@ts-ignore" }, ctx)).toEqual({ outcome: "measured", data: 3 });
    expect(await grep.evaluate({ glob: "src/*.ts", pattern: "@ts-ignore" }, ctx)).toEqual({ outcome: "measured", data: 1 });
    expect(await grep.evaluate({ glob: "src/none.ts", pattern: "@ts-ignore" }, ctx)).toEqual({ outcome: "measured", data: 0 });
  });

  test("takes the pattern as a JavaScript regular expression, and counts lines rather than matches", async () => {
    const ctx = await contextWith({ "a.ts": "any any\nanyway\n  any\nAny\n" });
    const count = async (pattern: string) => grep.evaluate({ glob: "*.ts", pattern }, ctx);
    expect(await count("any")).toEqual({ outcome: "measured", data: 3 });
    expect(await count("\\bany\\b")).toEqual({ outcome: "measured", data: 2 });
    expect(await count("^any")).toEqual({ outcome: "measured", data: 2 });
    expect(await count("^$")).toEqual({ outcome: "measured", data: 0 });
  });

  test("checks its config is a glob and a valid regular expression", () => {
    expect(grep.checkConfig({ glob: "**/*.ts", pattern: "@ts-ignore" })).toEqual([]);
    expect(grep.checkConfig({ glob: "**/*.ts" })).toEqual([["config.pattern", "must be a JavaScript regular expression, got undefined"]]);
    expect(grep.checkConfig({ pattern: "x" })).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
    expect(grep.checkConfig({ glob: "*.ts", pattern: "(" })).toEqual([
      ["config.pattern", `"(" is not a valid regular expression: missing )`],
    ]);
  });
});

describe("bunTestFile", () => {
  const CASES = `test("2 is prime", () => expect(isPrime(2)).toBe(true));
test("17 is prime", () => expect(isPrime(17)).toBe(true));
test("15 is not prime", () => expect(isPrime(15)).toBe(false));
test("0 is not prime", () => expect(isPrime(0)).toBe(false));
test("1 is not prime", () => expect(isPrime(1)).toBe(false));
`;

  /** A test of the subject's `isPrime`, which falls back to a reference implementation when run without one. */
  const TEST = `import { expect, test } from "bun:test";

const { isPrime } = await import(Bun.env.THUNDERJAR_SUBJECT ?? "./isPrime.reference.ts");

${CASES}`;

  const CORRECT = `export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
`;

  /** Says 1 is prime. */
  const BUGGY = CORRECT.replace("n < 2", "n < 1");

  /** `test` in a file of its own on the host, as a measurement brings it. */
  const testFile = async (test = TEST) => `${await folderWith({ "isPrime.test.ts": test })}/isPrime.test.ts`;

  const erroredWith = async (promise: Promise<unknown>) => {
    const result = (await promise) as { outcome: string; error?: Error };
    expect(result.outcome).toBe("erroredWhileMeasuring");
    return result.error?.message;
  };

  test("is skipped when nothing matches the subject", async () => {
    const ctx = await contextWith({ "src/prime.ts": CORRECT });
    expect(await bunTestFile.evaluate({ subject: "**/isPrime.ts", test: await testFile() }, ctx)).toEqual({
      outcome: "skipped",
      reason: "no file matches **/isPrime.ts",
    });
  });

  test("counts the tests passing and failing against a correct subject, and a buggy one", async () => {
    const test = await testFile();
    expect(await bunTestFile.evaluate({ subject: "**/isPrime.ts", test }, await contextWith({ "isPrime.ts": CORRECT }))).toEqual({
      outcome: "measured",
      data: { passed: 5, total: 5 },
    });
    expect(await bunTestFile.evaluate({ subject: "**/isPrime.ts", test }, await contextWith({ "src/lib/isPrime.ts": BUGGY }))).toEqual({
      outcome: "measured",
      data: { passed: 4, total: 5 },
    });
  }, 20_000);

  test("counts a skipped test, or a todo, in the total, but not as passing", async () => {
    const test = await testFile(`${TEST}test.skip("3 is prime", () => {});\ntest.todo("4 is not prime");\n`);
    expect(await bunTestFile.evaluate({ subject: "isPrime.ts", test }, await contextWith({ "isPrime.ts": BUGGY }))).toEqual({
      outcome: "measured",
      data: { passed: 4, total: 7 },
    });
  }, 20_000);

  test("takes a default export, when the test does", async () => {
    const test = await testFile(`import { expect, test } from "bun:test";

const subject = await import(Bun.env.THUNDERJAR_SUBJECT ?? "./isPrime.reference.ts");
const isPrime = subject.isPrime ?? subject.default;

${CASES}`);
    const ctx = await contextWith({ "isPrime.ts": CORRECT.replace("export function", "export default function") });
    expect(await bunTestFile.evaluate({ subject: "isPrime.ts", test }, ctx)).toEqual({ outcome: "measured", data: { passed: 5, total: 5 } });
  }, 20_000);

  test("takes a subject with several exports", async () => {
    const ctx = await contextWith({ "isPrime.ts": `${CORRECT}export const isComposite = (n: number) => n > 1 && !isPrime(n);\n` });
    expect(await bunTestFile.evaluate({ subject: "isPrime.ts", test: await testFile() }, ctx)).toEqual({
      outcome: "measured",
      data: { passed: 5, total: 5 },
    });
  }, 20_000);

  test("sums the counts over every subject the glob matches", async () => {
    const ctx = await contextWith({ "a/isPrime.ts": CORRECT, "b/isPrime.ts": BUGGY });
    expect(await bunTestFile.evaluate({ subject: "**/isPrime.ts", test: await testFile() }, ctx)).toEqual({
      outcome: "measured",
      data: { passed: 9, total: 10 },
    });
  }, 20_000);

  test("writes the test into a folder of its own in the workdir, nothing beside the subject, and removes the folder once it has run", async () => {
    const ctx = await contextWith({ "src/isPrime.ts": CORRECT });
    const written: Record<string, string> = {};
    const writing = { ...ctx, writeFile: async (path: string, contents: string) => ((written[path] = contents), ctx.writeFile(path, contents)) };
    await bunTestFile.evaluate({ subject: "**/isPrime.ts", test: await testFile() }, writing);
    expect(written).toEqual({ ".thunderjar-measure/isPrime.test.ts": TEST });
    expect(await ctx.glob("**")).toEqual(["src/isPrime.ts"]);
  }, 20_000);

  test("is erroredWhileMeasuring, saying why, when the subject doesn't load", async () => {
    const ctx = await contextWith({ "src/isPrime.ts": "export const isPrime = (\n" });
    expect(await erroredWith(bunTestFile.evaluate({ subject: "**/isPrime.ts", test: await testFile() }, ctx))).toBe(
      "isPrime.test.ts didn't run against src/isPrime.ts: error: Unexpected end of file",
    );
  }, 20_000);

  test("measures a test of no tests as a total of 0", async () => {
    const ctx = await contextWith({ "isPrime.ts": CORRECT });
    const test = await testFile(`import "bun:test";\n`);
    expect(await bunTestFile.evaluate({ subject: "isPrime.ts", test }, ctx)).toEqual({ outcome: "measured", data: { passed: 0, total: 0 } });
  }, 20_000);

  test("its default score is the pass rate, which doesn't apply to a run of no tests", () => {
    expect(bunTestFile.defaultScore).toMatchObject({ kind: "number" });
    expect(bunTestFile.defaultScore!.score({ passed: 3, total: 5 })).toBe(0.6);
    expect(bunTestFile.defaultScore!.score({ passed: 0, total: 0 })).toBeUndefined();
  });

  test("is erroredWhileMeasuring, saying why, when there is no bun to run the test with", async () => {
    const ctx = await contextWith({ "isPrime.ts": CORRECT });
    const withoutBun: MeasurementContext = { ...ctx, exec: (command) => ctx.exec(command.replace(" bun test ", " no-such-bun test ")) };
    expect(await erroredWith(bunTestFile.evaluate({ subject: "isPrime.ts", test: await testFile() }, withoutBun))).toMatch(
      /^isPrime\.test\.ts didn't run against isPrime\.ts: .*no-such-bun.*not found$/,
    );
  });

  test("checks its config is a subject glob and a test path", () => {
    expect(bunTestFile.checkConfig({ subject: "**/isPrime.ts", test: "./isPrime.test.ts" })).toEqual([]);
    expect(bunTestFile.checkConfig({ subject: "**/isPrime.ts" })).toEqual([
      ["config.test", "must be a path relative to the measurement's file, got undefined"],
    ]);
    expect(bunTestFile.checkConfig({})).toEqual([
      ["config.subject", "must be a glob pattern, got undefined"],
      ["config.test", "must be a path relative to the measurement's file, got undefined"],
    ]);
  });
});

describe("jsAst", () => {
  test("checks its config is a glob and a set of valid esquery selectors", () => {
    expect(jsAst.checkConfig({ glob: "src/**/*.ts", selectors: { calls: "CallExpression" } })).toEqual([]);
    expect(jsAst.checkConfig({ glob: "", selectors: {} })).toEqual([
      ["config.glob", 'must be a glob pattern, got ""'],
      ["config.selectors", "must name at least one esquery selector, got {}"],
    ]);
    expect(jsAst.checkConfig({ glob: "*.ts", selectors: { ok: "Identifier", bad: "Call[", empty: "" } })).toEqual([
      ["config.selectors.bad", expect.stringMatching(/^"Call\[" is not a valid esquery selector: /)],
      ["config.selectors.empty", 'must be an esquery selector, got ""'],
    ]);
  });
});

test("every instrument versions its value, and every built-in one but commits, filesChanged, jsAst, skillInvoked, toolCalled and fileRead has a default score", () => {
  for (const [name, instrument] of Object.entries(instruments)) {
    expect(instrument.version).toBeGreaterThanOrEqual(1);
    // Lists of commits or files, counts per file by selector, and answers per skill, tool or file, have no obvious score: each metric reads them with its own.
    if (["commits", "filesChanged", "jsAst", "skillInvoked", "toolCalled", "fileRead"].includes(name)) expect(instrument.defaultScore).toBeUndefined();
    else expect(instrument.defaultScore).toBeDefined();
  }
  // Version 1's value was whether the command exited 0.
  expect(shell.version).toBe(2);
  expect(isInstrumentName("grep")).toBe(true);
  expect(isInstrumentName("fileCraeted")).toBe(false);
  expect(isInstrumentName("toString")).toBe(false);
});
