# Message to Python QA engineer (prepared, not sent)

Backend targets canonical revision 4ce04c4870c43a65fe1f0265f0c75d3f4265c603. Please use the setup and scenarios
in HANDOFF.md and TEST_REQUIREMENTS.md. JWT now requires token_version; obtain new
tokens via registration/login. Blocked users and stale versions return 401.
New query parameters: regionCode, typicalPosition, codeProfession, specialisation.
Corresponding response fields use snake_case. All IDs are strings, salaries and
skill_match_percent are decimal strings, dates are UTC MySQL strings.
Please cover both users' isolation and archived favorites explicitly. Real SQL passed 118 developer integration checks on MySQL 8.4.13; see
INTEGRATION_ACCEPTANCE.md for reproduction and precise coverage. Your pytest
suite remains independent; no Python suite was implemented in this branch.

Card is_favorite is now a numeric 0/1 flag (mysql2 EXISTS string normalized).
UTC strings may include fractional seconds on lists and omit them on cards.

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

For machine-readable stdout use `npm run --silent import:trudvsem -- <args>`
or `node dist/modules/import/cli/trudvsem.js <args>` after build. Normal npm run
prints npm banners before the JSON report; CLI itself emits one JSON report.
