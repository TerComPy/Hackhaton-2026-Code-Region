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
