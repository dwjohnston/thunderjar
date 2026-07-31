# thunderjar

Thunderjar runs under [Bun](https://bun.com) or plain Node.js (>=20).

## Bun

```bash
bun install
bun src/cli --config <path-to-thunderjar.config.ts>
```

## Node

```bash
bun install    # or npm install — bun.lock is the source of truth for versions
npm run build  # bundles the CLI to dist/cli.js
node dist/cli.js --config <path-to-thunderjar.config.ts>
```

See `CLAUDE.md` for the full project overview and terminology.
