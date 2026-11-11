# Trudvsem synchronization v1

Base: origin/main 11e3077, new feat/trudvsem-sync-v1 worktree. Canonical schema is
manhattanattack/hackaton-sql-scheme@4ce04c4870c43a65fe1f0265f0c75d3f4265c603.
No SQL schema changes. No AI modules, workers or vacancy_ai_summaries operations.

## Commands

From Node-Back with normal .env for the target database:

```powershell
npm.cmd run diagnose:trudvsem
npm.cmd run import:trudvsem -- --probe-offset --timeout-ms 10000 --retries 0
npm.cmd run sync:trudvsem -- --limit 20 --max-pages 5 --max-records 100 --pause-ms 500 --retries 0
npm.cmd run import:runs
```

`sync:trudvsem` is `import:trudvsem --sync`. It opts into journaled synchronization.
Legacy `import:trudvsem` remains the compatible single-page importer without a run
journal (existing scripts/tests retain their contract). Use sync:trudvsem for
scheduled/operator synchronization. Dry-run and standalone probe do not create runs.
No new environment variables are needed for ordinary CLI operation.
Machine consumers should use npm run --silent, or node dist/modules/import/cli/trudvsem.js
once built, so npm banners do not precede the one JSON report. Logs go to stderr.

New options: --sync, --max-pages (1..100, default 1), --max-records (1..10000,
default 1000), --pause-ms (0..60000, default 500), --mode full|incremental (default full).
Sync-only arguments require --sync; no silent fallback to an unjournaled import.
Exit codes: 0 succeeded; 2 partial (including safety limits/unknown offset); 1 failed.
Report preserves import counters and adds runId, status, pages, scopeHash,
windowFrom/windowTo and errorCode. Missing/disabled source or invalid configuration
fails before creating a run. Journal DB failures fail closed; never claim success.

## Journal, scope, cursor

MysqlRunRepository implements canonical QI01-QI04 with parameterized values:

- QI01 reads MAX(window_to) only from succeeded rows of the SAME source + scope_hash.
- QI02 creates running before page fetching, captures database UTC time, uses
  the canonical unique active_scope_hash key as a cross-process same-scope lock.
- QI03 finishes succeeded/partial/failed with finished_at, safe error_code and counters.
  Progress counters checkpoint after every completely processed page.
- QI04 is an operator DB CLI (`import:runs`), not a public HTTP endpoint. It uses
  provisioned DB credentials; no HTTP access to logs/cursors was added.

Scope JSON has fixed key order: version, endpoint, regionCode, text. Text is NFC and
trimmed; endpoint URL and trailing slash normalized. SHA256 is encoded as binary32
via UNHEX. Endpoint is part of scope so mock/live runs cannot share a cursor.
Page size/caps, raw offset, mode and moving date windows are not filter identity.
Different region/text scopes have independent locks/cursors. A nonzero starting
offset cannot certify a complete scope. Source-provided contact content is never
placed in scope_json or errors; search text is stored as the intentional filter.

Counters: records_seen counts raw fetched records; inserted_count/updated_count
count committed saves; skipped_count includes stale snapshots, batch duplicates and
normalizer rejections. Failed saves are not counted as successful/skipped writes.
Per-vacancy transaction ownership and existing stale-update guard remain unchanged.

Only a fully traversed scope may succeed. Unknown offset restricts to one page.
A full page, contradictory source total, page/record cap, rejected record, save error,
repeated page or aborted traversal becomes partial and never moves the cursor.
First-fetch failure becomes failed; failure after pages becomes partial. No missing
vacancy is archived. Full success records window_to captured BEFORE the traversal.
Progress checkpoint and vacancy commits are separate: after a hard kill, counters
may omit the unfinished page; a running row is never interpreted as a valid cursor.

## Pagination and incremental safeguards

Before multiple pages the CLI probes offset=0/1 with limit=5 on that endpoint with the selected region/text filters.
A runtime `page`/`record` result selects +1/+limit, respectively. Unknown/failed probe
permits only one page. Page size stays fixed; repeated-page detection and hard caps
prevent loops when a source ignores offsets. A short/empty page is terminal only
when the reported total does not contradict it. An exact full page alone is not
completion evidence: another page is needed. The source may mutate while paginating;
this is bounded best-effort traversal, not a database snapshot guarantee.

Live date filter semantics have NOT been verified. --mode incremental is therefore
rejected against live endpoints, without inserting a misleading run. The adapter
and service are prepared to pass modifiedFrom/modifiedTo after verification.
The localhost mock-only --mock-modified-window capability enables integration tests:
windowFrom is the prior successful scoped window_to minus 60 seconds overlap,
windowTo is fixed before fetch; a scope with no prior success uses an epoch lower
bound. Live parameter names, timezone, inclusivity and behavior on boundaries must
be verified before enabling this capability for Trudvsem. It cannot be asserted
for a remote endpoint using the mock flag.

## Interruption and recovery

SIGINT/SIGTERM request cancellation; service finalizes failed/partial and preserves
committed vacancies. SIGKILL/power loss cannot run cleanup. The row stays running
and blocks that scope, even if old: there is no unsafe TTL/automatic lock stealing.
First establish the owning process has exited on ALL workers. Then use:

```powershell
npm.cmd run import:runs
npm.cmd run import:trudvsem -- --fail-run RUN_ID --confirm-stopped
```

Recovery only changes a matching running Trudvsem run to failed/PROCESS_STOPPED;
it never changes a succeeded cursor or deletes vacancies. A new run can then start.
Never recover a live process's row. The confirmation is an operator assertion, not
an automatic proof that a remote worker stopped. CLI recovery is privileged maintenance.

## Verification

MySQL Community 8.4.13 in the separate starter-pr2-mysql84 container at 127.0.0.1:33316.
All 17 canonical tables plus seed loaded in official order into newly named DBs.
No existing database/volume deleted, canonical checkout unchanged.

- npm ci: passed (0 vulnerabilities); typecheck/build passed.
- 74 importer unit tests: 58 existing + 16 synchronization safety tests.
- 28 real MySQL sync checks: multi-page fixture, repeat upsert, exact journal counters,
  scoped cursor/overlap, partial/failed non-advancement, same-scope exclusion,
  different-scope concurrency, real SQL rollback, graceful abort, real child-process
  kill, explicit recovery and operator audit.
- All existing 48 importer/API and 118 backend MySQL checks passed.
- Passing retained DBs: starter_sync_fe3a669a359b, starter_import_f90b52e8078f,
  starter_pr2_dd623bd9d80a. Earlier debug DBs also retained.

Reproduce using the dedicated-instance setup in INTEGRATION_ACCEPTANCE.md. Set
CANONICAL_DB_DIR to a CLEAN checkout of revision 4ce04c4, then:

```powershell
$env:RUN_ISOLATED_MYSQL_TESTS='yes'
$env:TEST_MYSQL_HOST='127.0.0.1'
$env:TEST_MYSQL_PORT='33316'
$env:TEST_MYSQL_USER='root'
$env:TEST_MYSQL_PASSWORD='your-isolated-test-root-password'
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:import
npm.cmd run test:sync:integration
npm.cmd run test:import:integration
npm.cmd run test:integration
```

The sync harness starts a bounded page-index mock, a local Express server and CLI
child processes. It verifies a mock date-window contract only. It also kills a
child process and temporarily adjusts test-user grants to force real SQL failures.
It creates and retains a unique DB/user, temporarily changes only the dedicated
server timezone and restores it. Never run this harness against a working server.
