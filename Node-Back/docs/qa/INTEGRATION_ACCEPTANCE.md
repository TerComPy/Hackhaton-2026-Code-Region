# PR #2 real MySQL acceptance ? 2026-11-11

Result: **118 assertions/HTTP checks passed** on MySQL Community 8.4.13.
Canonical revision: `4ce04c4870c43a65fe1f0265f0c75d3f4265c603`.
All four files were loaded in order: 01_schema.sql, 08_prompt_schema.sql,
09_ai_schema.sql, 03_seed.sql. 17 tables verified. Canonical files unchanged;
only CREATE DATABASE/USE directives are redirected to a newly generated DB,
as in the upstream mysql2 test harness.

Container: starter-pr2-mysql84, localhost:33316. Official mysql:8.4 image digest:
`sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902`.
Successful final test DB: `starter_pr2_35f2fe13c0be` (retained).
Prior debugging DBs are also retained. No database/volume/container deletion ran.

## Reproduce from Node-Back (PowerShell)

Use a dedicated test MySQL INSTANCE: the suite creates a random database/user,
changes the test server global timezone temporarily (restored in finally), grants
and revokes profile INSERT rights to induce a real transactional failure, and
sets a large auto-increment value in its own test tables. Do not use a working DB.
No existing schema is reused, dropped or truncated. Repeated runs retain new DBs.

```powershell
# Run Docker on the developer host if the agent sandbox cannot access its pipe.
# Choose a NEW container name/unused port if this name already exists.
docker run -d --name starter-pr2-mysql84 --label starter.task=pr2-acceptance -e MYSQL_ROOT_PASSWORD=pr2_isolated_test_only -p 127.0.0.1:33316:3306 mysql:8.4
# Repeat ping until it succeeds before proceeding (first initialization takes time).
docker exec starter-pr2-mysql84 mysqladmin -uroot -ppr2_isolated_test_only ping

git clone https://github.com/manhattanattack/hackaton-sql-scheme.git ../canonical-pr2
git -C ../canonical-pr2 checkout 4ce04c4870c43a65fe1f0265f0c75d3f4265c603
$env:CANONICAL_DB_DIR=(Resolve-Path ../canonical-pr2).Path
$env:RUN_ISOLATED_MYSQL_TESTS='yes'
$env:TEST_MYSQL_HOST='127.0.0.1'
$env:TEST_MYSQL_PORT='33316'
$env:TEST_MYSQL_USER='root'
$env:TEST_MYSQL_PASSWORD='pr2_isolated_test_only'
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:integration
node scripts/smoke.mjs
```

## Verified coverage

| Area | Evidence |
| --- | --- |
| Auth | Argon2id, normalized email, duplicate/conflicting concurrent registration, login, wrong password, JWT signature/subject/version/expiry, invalid/expired tokens |
| Accounts | Blocked login and access rejected; incremented token_version rejects old JWT; re-login sees current role/version |
| Atomicity/FK | Profile FK rejects orphan; real profile INSERT permission failure rolls back users INSERT |
| Catalog | Five active seed rows, archived exclusion, explicit card/skills, missing/invalid IDs, literal SQL injection input |
| Filters | Text, city, country, region name/code, includeRemote, profession, typical position, specialisation, format, schedule, employment, contract, salary/gross, experience, combinations |
| Skills | Required skill filter, 100 percent match, isolation of personalized ranking |
| Pagination | Distinct deterministic pages, empty page, invalid page/pageSize |
| Favorites | Repeated PUT/DELETE, owner isolation, marker, retained archived cards/saves, archived new save rejected |
| Clicks | Returned original URL and DB owner; archived failure leaves count unchanged |
| Precision | Profile and vacancy IDs 9007199254740993 and above; exact salary 1234567890.12; favorites with large ID |
| UTC | Ten simultaneous pool connections use +00:00 with server default +03:00; seeded timestamp remains unchanged |
| Data exposure | Explicit public fields; no password/auth subject/raw payload/contact-list fields in catalog/card |

One backend defect found and fixed: EXISTS returns a BIGINT string under mysql2
bigNumberStrings. Card is_favorite now explicitly returns numeric 0/1 as documented.
Other observed string types (IDs, aggregates, DECIMAL, DATETIME) are retained.
List text protocol includes .000000 on DATETIME; card prepared protocol can omit it.

npm ci (0 audit vulnerabilities), typecheck and build passed. Independent Python
pytest, importer SQL, load testing and refresh/logout are outside this evidence.
PR #2 is ready for code review/merge based on this developer integration acceptance;
no merge was performed. Independent QA can run its own suite against a fresh DB.
