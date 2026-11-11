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

BLOCKER: Docker Engine is unavailable under both sandbox and host contexts.
No MySQL/MariaDB service, executable or listener on 3306/33306 was found.
Real MySQL registration/FK/catalog/favorites/click/isolation scenarios remain
UNVERIFIED. This stage is not fully integration-verified. No working DB or volume
was modified. Independent QA should run the scenarios below on isolated MySQL 8.4.

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
