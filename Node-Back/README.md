# STARTER ? Express / TypeScript / mysql2

Node.js 22+, MySQL 8.4, Argon2id, JWT, Zod.

Copy `.env.example` to `.env`, set database credentials and a random JWT_SECRET
(at least 32 characters). Never commit secrets. Prepare the isolated DB as below.
Run `npm ci`, `npm run typecheck`, `npm run build`, then `npm start`.
PowerShell users can use `npm.cmd`.

Canonical DB: https://github.com/manhattanattack/hackaton-sql-scheme/tree/4ce04c4870c43a65fe1f0265f0c75d3f4265c603

Use MySQL 8.4 in an isolated disposable instance. The SQL files explicitly USE
vacancy_aggregator; never apply them to an unknown server or an existing working DB.
Check out revision `4ce04c4870c43a65fe1f0265f0c75d3f4265c603`. Run once, in order:
1. `01_schema.sql` (12 tables)
2. `08_prompt_schema.sql` (4 tables)
3. `09_ai_schema.sql` (1 table)
4. `03_seed.sql` (fictional catalog)
5. Register accounts through the API; optionally run `07_demo_profile_seed.sql`
   with the registered account UUID as documented upstream.

No local adapter migrations are required. This is initial creation, not migration
of older databases. Do not remove existing volumes. Query catalogs 02/05/06/10 are
reference operations, not migrations to execute wholesale.

API contract: [OpenAPI](docs/api/openapi.yaml). Register/login are anonymous;
me, profile, catalog, favorites and outbound-click require Bearer JWT.
Catalog accepts text/location, profession, specialisation, salary, work format,
schedule and experience filters. Lists contain active vacancies; cards and saved
favorites retain archived vacancies. Only active vacancies accept new saves/clicks
(an existing favorite remains an idempotent success).

All personal ownership is derived from JWT subject. JWT lasts one hour and includes
 token_version; blocked users and mismatched versions receive 401. Old tokens lacking
this claim must be replaced through login. No refresh rotation or logout endpoint
is implemented; there is no claim of logout revoking JWT.
Trudvsem importer is available as a standalone CLI; LLM/recommendations remain separate.
QA status and limitations: [handoff](docs/qa/HANDOFF.md).

Developer real-MySQL acceptance: `npm run test:integration` after the isolated
setup in [acceptance commands](docs/qa/INTEGRATION_ACCEPTANCE.md).

## Trudvsem importer

`npm run import:trudvsem -- --dry-run --limit 10` fetches and normalizes one page.
`npm run import:trudvsem -- --limit 100` writes to the MYSQL_* database from .env.
`npm run import:trudvsem -- --probe-offset` probes source pagination without DB writes.
Run `npm run test:import` for 58 tests and `npm run test:import:integration` for
isolated MySQL/CLI/Express verification after build. Setup and results:
[import acceptance](docs/import/INTEGRATION_ACCEPTANCE.md),
[importer reference](docs/import/TRUDVSEM.md).
Live source access failed in this environment; integration passed with a mock and
sanitized fixture. Imports are one page, at most 100 vacancies; no incremental sync.

## Journaled synchronization v1

Use `npm run sync:trudvsem -- --max-pages 5 --limit 20 --max-records 100`
for journaled runs; legacy single-page import remains compatible. Same-scope runs
are locked; partial/failed runs never advance cursor. Live TLS currently stalls.
See [sync behavior, tests and recovery](docs/import/SYNC_V1.md) for safe limits, mock incremental
and reproduction. No archive-by-absence, AI or worker changes.
