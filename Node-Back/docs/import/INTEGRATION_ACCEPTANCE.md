# Importer integration acceptance - 2026-11-11

Base: ff35dd7 (main contains bcb56bc + PR #2 owner merge).
MySQL: Community 8.4.13, existing dedicated starter-pr2-mysql84 container at 33316.
Canonical revision: 4ce04c4870c43a65fe1f0265f0c75d3f4265c603; files unchanged.

## Results

- npm ci: passed, 0 audit vulnerabilities; typecheck/build passed with real mysql2 types.
- npm run test:import: 58 passed (original 57 + contact-label regression).
- npm run test:import:integration: 48 counted assertions/HTTP checks passed.
- npm run test:integration: all 118 backend regression checks passed on combined code.
- CLI imports all 10 fixture records, repeats as updates with stable IDs and table
  counts, updates title, rejects stale snapshot; other seeded sources unchanged.
- Real SQL failure on vacancy_skills INSERT rolls back new company/vacancy/skill
  and preserves old vacancy on failed update. CLI partial failure returns exit 2.
- All imported IDs appear in authenticated catalog and each card opens. Anonymous
  requests rejected. Two users cannot delete/read each other's favorites; clicks
  reference the authenticated user's profile.
- Source contact names/phones/emails from fixture absent from stored tables and API.
  An injected email canary exposed un-scrubbed schedule/company/position/skills;
  minimal mapper fix applies existing scrubContacts to these and region/category/shift
  labels. Regression proves sanitized mapper, DB and API output.
- Shared pool stays available after reusable importer operations; existing backend
  suite re-verifies BIGINT >2^53, DECIMAL and UTC across all ten pool sessions.

Retained passing test DBs: starter_import_a437d83f8f36, starter_pr2_6338a95f7b17.
Earlier debug DBs also retained. No existing databases, containers or volumes deleted.

## Reproduce (PowerShell, from Node-Back)

Use only the dedicated test MySQL INSTANCE. Suite creates and retains unique DB/user,
loads all 17 tables using 01_schema.sql -> 08_prompt_schema.sql -> 09_ai_schema.sql
-> 03_seed.sql, redirects only CREATE DATABASE/USE to its own DB, manipulates its own
fixtures and user grants, temporarily changes server default timezone and restores
it. Never point at a working server. Admin rights are required for this harness;
normal importer only needs its documented table privileges.

```powershell
# If the previous dedicated test container is running, reuse it. Otherwise create
# a NEW name/unused port. No volume deletion or reuse of working DB is needed.
docker run -d --name starter-import-mysql84 -e MYSQL_ROOT_PASSWORD=local_import_test -p 127.0.0.1:33316:3306 mysql:8.4.13
# Repeat until ready:
docker exec starter-import-mysql84 mysqladmin -uroot -plocal_import_test ping

git clone https://github.com/manhattanattack/hackaton-sql-scheme.git ../canonical-import
git -C ../canonical-import checkout 4ce04c4870c43a65fe1f0265f0c75d3f4265c603
$env:CANONICAL_DB_DIR=(Resolve-Path ../canonical-import).Path
$env:RUN_ISOLATED_MYSQL_TESTS='yes'
$env:TEST_MYSQL_HOST='127.0.0.1'
$env:TEST_MYSQL_PORT='33316'
$env:TEST_MYSQL_USER='root'
$env:TEST_MYSQL_PASSWORD='local_import_test' # use actual dedicated container value
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:import
npm.cmd run test:import:integration
npm.cmd run test:integration
```

The harness starts its own mock HTTP and Express servers on random local ports,
runs the compiled CLI as child processes, and stops both servers at completion.
Its --probe-offset mock produces page semantics, then fixture imports use one page.

## Live API limitation

Live --probe-offset was attempted with 10-second then 30-second timeout from the
host context; results TIMEOUT and NETWORK_ERROR. Live offset semantics remain
unverified. No live vacancies were imported. The fixture/mock path is fully verified.
Once connectivity returns, in an isolated DB configured via MYSQL_* and normal env:

```powershell
npm.cmd run import:trudvsem -- --probe-offset --timeout-ms 30000 --retries 0
npm.cmd run import:trudvsem -- --limit 100 --offset 0
```

Then register/login and compare returned imported IDs with authenticated
GET /api/vacancies?pageSize=100 and GET /api/vacancies/:id. A mixed demo/live DB
can exceed 100 rows: follow API pages to find every ID.
Known names are scrubbed using contact_person. Unreported names in arbitrary prose
cannot be guaranteed absent by regex; independent QA should retain adversarial cases.
No import_runs/multipage/cursor changes or live pagination claims are included.

For machine-readable stdout use `npm run --silent import:trudvsem -- <args>`
or `node dist/modules/import/cli/trudvsem.js <args>` after build. Normal npm run
prints npm banners before the JSON report; CLI itself emits one JSON report.
