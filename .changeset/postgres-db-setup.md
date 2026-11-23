---
"thunderjar": minor
---

A `postgresStore` no longer creates its tables on first use. Run the new `thunderjar db setup` once, with an admin URL in `THUNDERJAR_DB_URL_ADMIN` (or the store's `adminUrlEnv`), to create them. The URL in `urlEnv` then needs only SELECT, INSERT and UPDATE. `doctor` checks that the tables exist.

The tables are now in the `thunderjar` schema, or the store's `schema`, instead of the connection's search path, usually `public`. To keep existing runs, move them before upgrading:

```sql
CREATE SCHEMA thunderjar;
ALTER TABLE public.thunderjar_executions SET SCHEMA thunderjar;
ALTER TABLE public.thunderjar_container_runs SET SCHEMA thunderjar;
```

Or keep them where they are with `postgresStore({ urlEnv: "THUNDERJAR_DB_URL", schema: "public" })`.
