# STARTER — Backend agent instructions

Project: intelligent vacancy aggregator with AI explanations and recommendations.
Backend: Node.js 22+, Express 5, TypeScript, mysql2, Zod, JWT + Argon2id.
Client: Blazor Hybrid / .NET MAUI. DB: MySQL 8.4.
Canonical business schema: https://github.com/manhattanattack/hackaton-sql-scheme
Baseline reviewed: `efe6b9d199ef602c4f97282b998e953b21cebe8d`.

## Architecture contract
- Business schema and SQL semantics come from the DB engineer. Do not silently
  invent business tables or overwrite canonical business migrations.
- Current upstream still says ASP.NET Identity; see `docs/db/UPSTREAM_ALIGNMENT.md`.
  Node auth (`auth_users`) is a PROPOSED compatible adapter pending DBA approval.
- `auth_users.id` is string UUID; `user_profiles.id` is BIGINT. Use profile ID
  for favorites, user_skills, search_requests, clicks. BIGINT remains string in JS.
- Thin route layer; business logic in services, DB access in repositories as it grows.
- Use parameterized mysql2 `?` placeholders and transactions for multi-step writes.
- Validate inputs with Zod; consistent `{ error: { code, message } }`.
- Users cannot pick role or owner. JWT subject from verified Bearer only.
- Auth endpoints alone are anonymous; catalog and personal actions need Bearer.
- Do not conflate work format, weekly schedule, employment time and contract duration.
- The skill match percentage is not a probability of employment.

## Handoff after every API change
1. Update docs/api/openapi.yaml, including status codes and auth/security schemes.
2. Update docs/qa/CHANGELOG.md with new/changed/breaking behavior.
3. Update docs/qa/TEST_REQUIREMENTS.md with positive, negative and edge cases.
4. Update docs/qa/HANDOFF.md with fixtures, setup and known limitations.
5. Summarize changed files, SQL setup/migrations, smoke checks.
6. Do NOT implement Python test suite: independent QA engineer owns it.
7. Developer still runs typecheck, build and basic smoke checks.

## Next stages
- DBA agrees/merges Node auth schema, re-runs MySQL verification.
- Import Trudvsem data with adapter and idempotent Q01/Q02 transaction.
- Implement prompt parsing + history against 08_prompt_schema and JSON_CONTRACT.
- Harden auth (rate limit, refresh/revocation) before public production release.
