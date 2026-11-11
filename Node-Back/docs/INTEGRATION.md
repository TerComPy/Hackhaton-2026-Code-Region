# Trudvsem integration

Integration base: origin/main ff35dd7 (owner merged PR #2), including Claude merge bcb56bc.
Canonical DB: manhattanattack/hackaton-sql-scheme@4ce04c4870c43a65fe1f0265f0c75d3f4265c603.

`npm run import:trudvsem -- <options>` runs the existing standalone CLI.
`npm run test:import` runs 58 tests: all original 57 plus one privacy regression.
`npm run test:import:integration` runs the real MySQL + mock HTTP + authorized
Express check after `npm run build`. See import/INTEGRATION_ACCEPTANCE.md for setup.

CLI lazily imports the shared db from src/config/db.ts; dry-run/probe need no DB.
Reusable repository borrows and releases UTC connections, never closes the pool.
Only CLI owns db.end(). Its local stderr logger is retained so stdout stays a single
JSON report; injected shared pino logger remains supported. No new env keys are
required for normal CLI operation; import arguments are validated by Zod.
BIGINT and DECIMAL remain exact strings on reads. Date strings work with stale
snapshot checks. Optional canonical fields and MySQL 8.4 row-alias upserts work.

Verified: fixture insert/repeat/update/stale skip, real SQL rollback, canonical FK,
all imported cards/catalog, per-user favorites/click ownership. Contact cleanup
now covers all source text labels and skills as well as description/requirements.
No canonical SQL edits, new HTTP endpoints, importer rewrite, import_runs,
multipage synchronization, cursor, LLM or recommendation features were added.
Live offset probe failed (timeout/network error); up to 100 live records were not
imported. Mock probe verifies page semantics only for the scripted mock.

## Journaled synchronization v1

Use `npm run sync:trudvsem -- --max-pages 5 --limit 20 --max-records 100`
for journaled runs; legacy single-page import remains compatible. Same-scope runs
are locked; partial/failed runs never advance cursor. Live TLS currently stalls.
See [sync behavior, tests and recovery](import/SYNC_V1.md) for safe limits, mock incremental
and reproduction. No archive-by-absence, AI or worker changes.
