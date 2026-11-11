# Independent Python QA requirements

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

## Developer acceptance evidence

118 real MySQL 8.4.13 assertions/HTTP checks passed; see INTEGRATION_ACCEPTANCE.md.
Card is_favorite must be numeric 0/1, while BIGINT IDs and aggregate counts remain
strings. DATETIME strings may have optional fractional seconds depending on the
mysql2 text/binary protocol. Include these observed types in independent pytest.
The developer suite forces a real SQL permission failure on the profile INSERT,
then asserts the users INSERT rolled back. It also checks concurrent email conflicts,
10 pooled UTC sessions despite a +03:00 server default, and IDs above 2^53.

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

## Sync v1 handoff (2026-11-11)

New CLI: sync:trudvsem (journaled), import:runs (operator-only audit),
diagnose:trudvsem. No HTTP contract changes or public audit endpoint.
See [SYNC_V1](../import/SYNC_V1.md) and [network diagnosis](../import/NETWORK_DIAGNOSTICS.md).
Python QA should cover stable scope hash, independent filter cursors, successful
terminal traversal, page/record limits, ignored offsets/repeated page, rejected and
failed saves, exact committed counters and scope lock across processes. Test both
page/record offset mocks. Partial/failed MUST leave QI01 cursor unchanged. Kill a
worker: running remains blocking; only confirmed-stopped operator recovery releases
it. Check last-page checkpoint limitations after abrupt kill. Incremental dates are
mock-only until the live contract is proven; assert remote incremental is rejected.
74 unit tests, 28 sync MySQL checks, 48 importer and 118 backend regressions passed.
Live API provided no vacancies: DNS IPv4 resolves but TLS handshake stalls before
HTTP; no proxy is configured and a control TLS host works. Offset/date semantics
remain unverified for live. No canonical schema, AI or working-volume changes.
