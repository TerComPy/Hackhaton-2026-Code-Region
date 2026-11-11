# Python QA test requirements — starter API 0.2.0 proposal

Owner: independent Python QA engineer; stack pytest + httpx.
Use a disposable MySQL 8.4 DB with official `01_schema.sql` + Node auth adapter.
Do not import Express internals. Use `STARTER_API_URL` to configure target.
Never log real passwords, JWTs or third-party raw payloads.

## Auth / profile
- Registration creates unique `auth_users` account and `user_profiles` row atomically.
- Duplicate email including different case -> 409.
- Password validation; malformed JSON; missing keys -> 400.
- Login valid/wrong password; Bearer `/me`; token signature/expiration; no password hash in JSON.
- `id` UUID string, `profileId` string BIGINT, consistent across register/login/me.
- GET/PATCH profile; city null; empty updates rejected; no editing another account.
- Role cannot be chosen in registration request.

## Jobs & skills
- Listing requires Bearer; empty catalog, filters and pagination.
- workFormat, scheduleType, contractType independent; unknown excluded when strict filter.
- salary min only RUB/month; missing salary should not be treated as zero.
- skill score not misrepresented as hiring probability.
- Archived vacancies hidden from list, accessible via detail/history.
- Detail returns requirements + source + company and skills.

## Favorites / clicks
- Add same favorite twice stays one row; remove twice is harmless.
- Can't favorite archived/nonexistent job; list can contain archived saved jobs.
- Outbound click logged once per call; response is original URL only after DB commit.
- Click is not recorded as application sent.

## Security & integration
- Verify account isolation across TWO users; never trust client-provided userId.
- SQL injection payloads stay data; oversized query/body handled gracefully.
- Inconsistent API responses vs OpenAPI: report as contract defects.
- Account removal/refresh/role-based admin actions are not implemented.

## Bug report
Method/path, environment, sanitized request/response, expected vs actual,
steps to reproduce, impact, upstream SQL commit.

## Stage 1 verification ? 2026-11-11

- Fixed pino-http ESM import; npm install (workspace cache), typecheck and build pass. package-lock.json added. Argon2id hash/verify passes.
- Registration rejects unknown fields (including role) with 400 VALIDATION_ERROR. Email is trimmed before validation and lowercased. Password 8?128 characters; displayName trimmed, 1?150 characters.
- JWT verification requires sub, iss, aud, exp and HS256. Lifetime: 3600 seconds.
- HTTP smoke: health 200; ready 503 (no DB); me without/invalid Bearer 401 UNAUTHORIZED; catalog without Bearer 401; register with role 400.
- Docker Engine unavailable; localhost:3306 refuses connections. Registration success/duplicate, login success/failure, authenticated me, SQL grants, FK and rollback on real MySQL remain UNVERIFIED. Do not treat stage as accepted.
- QA: use a dedicated empty DB and unique emails; register returns 201 {user:{id,profileId,email,displayName,role},accessToken,tokenType,expiresIn}; duplicate email including case variants returns 409 EMAIL_EXISTS; login returns same shape with 200 or 401 INVALID_CREDENTIALS; me returns 200 {user} or 401 UNAUTHORIZED. Never expose password_hash. Check atomic account/profile creation and role=user.
- DB setup: compose up -d mysql; wait for health; apply pinned upstream 01_schema.sql, then local 01_auth_users.sql, then 02_link_profile.sql, optionally upstream 08_prompt_schema.sql and 03_seed.sql. Never run Identity scripts. Use database vacancy_aggregator: adapter SQL hardcodes this name. Compose grants starter access to that database only; inspect SHOW GRANTS and actual upstream database name before applying. Existing volumes are not reinitialized; never remove them for this task.
- Upstream baseline could not be downloaded in this session, so compatibility is based on existing handoff only. DBA must confirm UUID string auth_users, unchanged BIGINT profile ID and business relationships, matching auth_subject collation and FK ON DELETE RESTRICT. Adapter remains pending DBA approval. No upstream schema or user data changed. Python suite belongs to QA.

## Task 1A

Rechecked npm ci, typecheck, build and Argon2id successfully in feat/core-auth worktree. HTTP smoke: health 200, ready 503 with unavailable MySQL, me/catalog without Bearer 401. Real-DB auth, FK, grants and rollback tests remain blocked by missing Docker Engine. Test shutdown with active requests and repeated signals; deadline is 10 seconds, MySQL connect timeout 5 seconds. Shared logger and CLI integration contract: docs/INTEGRATION.md. No importer or Python suite added.
