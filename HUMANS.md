## HUMANS.md 

This project contains HUMANS.md files. 

HUMANS.md files are like AGENTS.md, they're instructions for you, but they should also well maintained instructions files for the human maintainers of the project. 

If an AGENTS.md file is present at directory, the file structure looks like this: 

```
HUMANS.md 
AGENTS.md  // Contains @HUMANS.md at the top, additional instructions later. 
CLAUDE.md  // Just contains @AGENTS.md
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


## Working style 