## HUMANS.md 

This project contains HUMANS.md files. 

HUMANS.md files are like AGENTS.md, they're instructions for you, but they should also well maintained instructions files for the human maintainers of the project. 

If an AGENTS.md file is present at directory, the file structure looks like this: 

```
HUMANS.md 
AGENTS.md  // Contains @HUMANS.md at the top, additional instructions later. 
```

HUMANS.md files should be considered canoncial. 

If the human gives you instructions that contradict the HUMANS.md - then get their attention informing them so.

### Other sources of human files

- `**/*.humans.*`
    - These are commonly test files. eg. `fixtures/02_regular/0201_minimal_existing_setup/parameterNames.humans.test.ts`
    - The intention of these files is to serve a reliable pointers for the humans to understand how the codebase is working. 
        - These tests should be considered canonical. 
        - Do not modify these tests. 
        - However, do copy the format of tests to an equivilent file beside it:
            - Rule, if doing this, give the file an identical name, with `comprehensive` instead of `humans` 
                eg. `fixtures/02_regular/0201_minimal_existing_setup/parameterNames.comprehensive.test.ts`
- `project-md/human-safe-space/**/*` 
    - This is an area of human maintained documentation
    - This documentation should be considered canonical

### If human files are outdated or wrong

- For example, if you have made a change that makes some human documentation out of date, because a function name has changed etc then: 

 - In a chat session get the users attention with 🔔📄 emoji at the end of the message 
 - In a PR  🔔📄 emoji at the end of the PR description 

 Informing the user of what needs to be changed. 

### You can modify AGENTS.md 

Feel free to modify AGENTS.md as will be helpful to yourself or future agents. 

If instructions or details already exist in HUMANS.md - you can expand on them in the AGENTS.md.  


## Top level instructions 

Always invoke: 

/write-for-the-human
/concise-output 


## Thunderjar 

Thunderjar is a coding harness eval framework. 

## Harnesses we are supporting

| Harness     | API key              |
| ----------- | -------------------- |
| Claude Code | `ANTHROPIC_API_KEY`  |
| Copilot     | `OPENROUTER_API_KEY` |
| Codex       | `OPENROUTER_API_KEY` |
| Opencode    | `OPENROUTER_API_KEY` |

Whenever instructions relate to creating hooks, creating skills, modifications that are harness specfic, then build support for these four harnesses. 

## API Keys 

The following environment variables should be available to you: 

- ANTHROPIC_API_KEY 
- OPENROUTER_API_KEY
- FLYIO_TOKEN
- THUNDERJAR_DB_URL
- GITHUB_TOKEN

## Canonical documentation 

Maintained by humans only, in [project-md/human-safe-space/](project-md/human-safe-space/).

- [Tag and ref conventions](project-md/human-safe-space/conventions/tags-and-refs.md)
- [Parameter apply order](project-md/human-safe-space/parameters/apply_order.md)
- [Measurements philosophy](project-md/human-safe-space/measurements-philosophy/index.md)
- [Not supported: parameter behaviour](project-md/human-safe-space/not-supported/parameter-behaviour.md)
- [Things that are a bit messy: skills](project-md/human-safe-space/things-that-are-a-bit-messy/skills.md)

## Idealised architecture 

### Dependency injection

All non-deterministic functionality is injected, except the logger.

- **No framework.** `main` is the composition root. It's the only place that reads `process.env` or builds real adapters, and it builds every service up front and passes them down.
- **Take only what you use.** Functions declare the slice they need, e.g. `Pick<Dependencies, "runtimeDocker" | "clock">`, so tests build only those.
- **Every service has a fake.** It lives next to the real one, e.g. `src/services/Clock/Clock.ts` and `FakeClock.ts`. Tests pass fakes and check state, not output.
- **The exception is the logger.** Import `moduleLogger` from [src/log/logger.ts](src/log/logger.ts) directly. Logging is a side channel, never something a test checks, so it isn't worth threading through every signature.

See [the run architecture plan](project-md/human-safe-space/refactor-work/architecture-plan.md).


## Working style 

### Writing tests 
- Do not use snapshots, inline snapshots. Test snapshots are allowed online in `*.humans.*`
- When writing tests for general purpose things, don't refer to domain specific concepts

```typescript 

// 👎 Bad - this adds cognitive friction by refering to a real thign 
async function findTestCase(fs: Fs, root: string, name: string): Promise<string | undefined> {
    const path = `${root}/.thunderjar/test-cases/${name}.ts`;
    if (!(await fs.exists(path))) return undefined;
    await fs.write(`${root}/.thunderjar/logs/found.txt`, name);
    return fs.readText(path);
}

describe(findTestCase, () => {
    it("reads the test case and writes a note, all in memory", async () => {
        const fs = new FakeFs({ "/p/.thunderjar/test-cases/smoke.ts": "export default {}" });

        expect(await findTestCase(fs, "/p", "smoke")).toBe("export default {}");
        expect(fs.files()).toMatchInlineSnapshot(`
          {
            "/p/.thunderjar/logs/found.txt": "smoke",
            "/p/.thunderjar/test-cases/smoke.ts": "export default {}",
          }
        `);
    });
});

```

```typescript 

// 👍 Good - a plain, everyday example
async function readTodo(fs: Fs, path: string): Promise<string> {
    return fs.readText(path);
}

describe(readTodo, () => {
    it("reads the todo list", async () => {
        const fs = new FakeFs({ "/todo.txt": "buy milk" });

        expect(await readTodo(fs, "/todo.txt")).toBe("buy milk");
    });
});

```


## Memory 

Auto memory is disabled. 

You're welcome to use memory. Your memory file is [project-md/MEMORY.md](./project-md/MEMORY.md)