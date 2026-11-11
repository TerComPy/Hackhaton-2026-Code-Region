# Задание инженеру БД — переход на Node.js/Express

**Бэкенд изменён:** ASP.NET Core Minimal API → Node.js 22 + Express 5 + TypeScript.
Остальная бизнес-схема MySQL 8.4 сохраняется.

## Требуется согласовать
1. Заменить зависимость от ASP.NET Identity (`AspNetUsers`) на backend-owned
   `auth_users(id VARCHAR(191) utf8mb4_bin PRIMARY KEY, email, normalized_email UNIQUE CI,
   password_hash, role, created_at)`. См. `db/node-adapter/01_auth_users.sql`.
2. Связь `user_profiles.auth_subject → auth_users.id` с `ON DELETE RESTRICT`.
   Не изменять `user_profiles.id BIGINT` и user_id в остальных таблицах.
3. Обновить `05_auth_queries.sql` (QA01–QA03), убрать JOIN AspNetUsers.
4. Обновить `README.md`, `AUTH_AND_IMPORT.md`, identity preflight/link и ER-диаграмму.
5. Выполнить SQL-регрессию MySQL 8.4 на новой схеме и передать отчёт QA.
6. Не создавать миграции старой БД: upstream описывает создание с нуля.

Обратите внимание: `auth_users` — временно предлагаемый контракт, до утверждения
инженером БД не расходиться с основной схемой команды в параллельных коммитах.

## Stage 1 verification ? 2026-11-11

- Fixed pino-http ESM import; npm install (workspace cache), typecheck and build pass. package-lock.json added. Argon2id hash/verify passes.
- Registration rejects unknown fields (including role) with 400 VALIDATION_ERROR. Email is trimmed before validation and lowercased. Password 8?128 characters; displayName trimmed, 1?150 characters.
- JWT verification requires sub, iss, aud, exp and HS256. Lifetime: 3600 seconds.
- HTTP smoke: health 200; ready 503 (no DB); me without/invalid Bearer 401 UNAUTHORIZED; catalog without Bearer 401; register with role 400.
- Docker Engine unavailable; localhost:3306 refuses connections. Registration success/duplicate, login success/failure, authenticated me, SQL grants, FK and rollback on real MySQL remain UNVERIFIED. Do not treat stage as accepted.
- QA: use a dedicated empty DB and unique emails; register returns 201 {user:{id,profileId,email,displayName,role},accessToken,tokenType,expiresIn}; duplicate email including case variants returns 409 EMAIL_EXISTS; login returns same shape with 200 or 401 INVALID_CREDENTIALS; me returns 200 {user} or 401 UNAUTHORIZED. Never expose password_hash. Check atomic account/profile creation and role=user.
- DB setup: compose up -d mysql; wait for health; apply pinned upstream 01_schema.sql, then local 01_auth_users.sql, then 02_link_profile.sql, optionally upstream 08_prompt_schema.sql and 03_seed.sql. Never run Identity scripts. Use database vacancy_aggregator: adapter SQL hardcodes this name. Compose grants starter access to that database only; inspect SHOW GRANTS and actual upstream database name before applying. Existing volumes are not reinitialized; never remove them for this task.
- Upstream baseline could not be downloaded in this session, so compatibility is based on existing handoff only. DBA must confirm UUID string auth_users, unchanged BIGINT profile ID and business relationships, matching auth_subject collation and FK ON DELETE RESTRICT. Adapter remains pending DBA approval. No upstream schema or user data changed. Python suite belongs to QA.
