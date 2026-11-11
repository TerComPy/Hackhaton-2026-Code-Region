# Python QA handoff

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

Developer checks: npm ci passed (0 audit vulnerabilities). Typecheck and build passed. `node scripts/smoke.mjs` checks HTTP behavior without MySQL.

Real MySQL acceptance completed on 2026-11-11: MySQL Community 8.4.13,
Docker image mysql:8.4 (digest a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902).
118 assertions/HTTP checks passed against all 17 canonical tables and demo data.
Details and reproducible commands: [INTEGRATION_ACCEPTANCE.md](INTEGRATION_ACCEPTANCE.md).
Docker host requires execution outside the restricted sandbox. No existing databases
or volumes were deleted. Test container and generated databases remain for review.
The previous no-MySQL blocker is resolved. Importer SQL and independent Python QA
suite remain outside this acceptance scope.

Positive: register two users, assert UUID subjects and string profile IDs, one
profile per user and FK to users; login with normalized email; verify Argon2id stored
hash and no hash in HTTP. Check me/profile, catalog demo fixtures, each filter and
combinations, deterministic pages and empty pages, cards and skills, repeated save,
delete, outbound-click row ownership. Archive a saved vacancy: absent from catalog,
present in card/favorites with status archived, click/new save returns 404.

Negative: malformed JSON, invalid email/password and 255-character email; duplicate
normalized email (including concurrent registration) gives 409 and no orphan;
invalid/expired/tampered JWT, missing version, blocked account and incremented DB
version give 401. Unknown IDs give 404; invalid IDs/pages give 400. Injection strings
are literal parameters. User B cannot see/change A profile/favorites/click ownership;
reject role/owner in registration and profile PATCH. Verify hashes, tokens and
source contact/raw payload data never appear in API responses. Database outages
must produce generic errors, not credentials or SQL in HTTP.

Pagination is page/pageSize (1..100 per page); there is no total count. Decimal
money and skill_match_percent are strings, SQL aggregate counts are strings, boolean DB fields
are 0/1, nullable UTC DATETIME values are MySQL strings. Filters salary are RUB/month;
NULL experience is excluded by numeric experience filters. Exact profession filters
are distinct from MySQL natural-language fulltext tokenization.

## Task 3: importer + canonical backend integration

Owner merged PR #2; integration base is main ff35dd7 with Claude bcb56bc.
Commands: npm run import:trudvsem / test:import / test:import:integration.
58 importer tests, 48 real-MySQL importer/API checks, 118 backend regression checks
passed. See [acceptance](../import/INTEGRATION_ACCEPTANCE.md) for exact isolated
setup, test fixtures, retained databases and live API limitation. HTTP contract
unchanged; all imported cards and catalog use Bearer, ownership from profile only.
Privacy regression: source contacts in schedule, shift/company/position/region/category
labels and skills now pass through existing scrubContacts. Check an injected email,
phone and known contact name in these fields, plus DB and API output. Existing
fixture contacts are excluded. Never equate absence of known canaries with a full
arbitrary-prose PII guarantee. Live API timed out/failed; live 100-record import
remains unverified. Independent pytest suite remains owned by Python QA.
