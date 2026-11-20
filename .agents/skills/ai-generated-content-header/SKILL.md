---
name: ai-generated-content-header
description: Use when creating new files, or populating empty files. When writing creating content elsewhere - eg. PR descriptions. 
---

When creating a new file add the following header to the top of it

```typescript
/**
 * 🤖
 * This file was created with AI
 *
 * Harness: <harness name>
 * Model: <model name>
 * Session Id: <session id>
 * Supervising engineer: (get this from git config)
 * 
 *
 * Humans: add your notes here
 *
 *
 */

```

Exceptions:
- JSON files and anything else that would break with the presence of the header


If the file has a shebang, place the header _below_ the shebang. 
If the file has frontmatter metadata, place the header _below_ the header. 

If the file is a markdown file, use 

```markdown 
<!-- -- >
```

style comments. 


## Pull requests and other web content 

Place this header at the start of the content: 

```
🤖 AI generated content. 
<harness>/<model>
Session ID: <session id>
```
