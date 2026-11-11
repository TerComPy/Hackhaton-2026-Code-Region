# API changes ? DB alignment

- Canonical users replaces the removed local authorization adapter.
- JWT now requires token_version and checks active status/current version per request.
  Existing JWTs require login again. Role is read from the database.
- Email is limited to 254 characters; duplicate normalized email returns 409.
- Added regionCode, typicalPosition, codeProfession and specialisation exact filters.
  regionCode honors includeRemote like other location filters.
- Lists/cards/favorites expose the four corresponding snake_case DB fields.
- DECIMAL values remain strings; dates are UTC MySQL strings, not ISO timestamps.
- Active catalog, archived cards/favorites, idempotent favorites and owner isolation retained.
- Refresh rotation/logout remain unimplemented.

## PR #2 real MySQL acceptance (2026-11-11)

- Fixed vacancy card is_favorite: mysql2 EXISTS expression was a BIGINT string,
  contradicting OpenAPI. Explicitly normalize this flag to numeric 0/1 only.
- Confirmed aggregate counters/percent are strings and DECIMAL stays exact.
- Added reproducible isolated real-MySQL developer suite: 118 checks passed.
- Previous Docker/MySQL verification blocker resolved; canonical SQL unchanged.

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
