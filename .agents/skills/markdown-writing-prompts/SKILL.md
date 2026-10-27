---
name: markdown-writing-prompts
description: "Conventions for writing Markdown prompts (SKILL.md, AGENTS.md) so a human can read them: emoji-marked do and don't blocks, plus a rationale for each instruction. Use when authoring or reviewing agent instructions."
---

- Markdown prompts (eg. SKILL.md and AGENTS.md files are intended for human consumption)
- Add 'do this' and 'don't do that' blocks. Denote them with emoji
- Add a rationale - this helps the human reader understand why the instruction is there. 




## Skills

### Naming convention 

Skills are kebab-cased and starts with a common topic. 

eg. 

```
markdown-general
markdown-writing-prompts

ts-general
ts-testing
```

**Rationale:** Lexicographic ordering means related skills all exist in the same place, allows user muscle memory to bring up related skills. 


### Prompt format

- Give each instruction a ✅ **Do this** and a ❌ **Don't do that** block, where it helps.
- Give each instruction a rationale. It helps the human reader understand why the instruction is there, and so judge when it no longer applies.