# СТАРТЕР — Express 5 / MySQL 8.4, DB-aligned boilerplate

Node.js 22+ · TypeScript · mysql2 · JWT/Argon2id · Zod · Docker Compose.

**ВАЖНО:** upstream SQL (https://github.com/manhattanattack/hackaton-sql-scheme)
ориентирован на ASP.NET Core Identity. Здесь Node.js-адаптер **предложен**, но
пока не утверждён инженером БД. Смотрите `docs/db/UPSTREAM_ALIGNMENT.md`.

## Первоначальная установка

```bash
cp .env.example .env
# Установить длинный случайный JWT_SECRET (не коммитить .env)
docker compose up -d mysql
npm install
```

Получить отдельно SQL репозиторий инженера БД:

```bash
git clone https://github.com/manhattanattack/hackaton-sql-scheme.git ../hackaton-sql-scheme
# Для воспроизводимости использовать коммит проекта:
cd ../hackaton-sql-scheme && git checkout efe6b9d199ef602c4f97282b998e953b21cebe8d
cd ../starter-boilerplate-db-v2
```

После согласования схемы с инженером БД применить **по очереди**:

```bash
docker compose exec -T mysql mysql -ustarter -pstarter_dev_password < ../hackaton-sql-scheme/01_schema.sql
docker compose exec -T mysql mysql -ustarter -pstarter_dev_password < db/node-adapter/01_auth_users.sql
docker compose exec -T mysql mysql -ustarter -pstarter_dev_password < db/node-adapter/02_link_profile.sql
# История промптов пока не используется API, можно подключить заранее:
docker compose exec -T mysql mysql -ustarter -pstarter_dev_password < ../hackaton-sql-scheme/08_prompt_schema.sql
docker compose exec -T mysql mysql -ustarter -pstarter_dev_password < ../hackaton-sql-scheme/03_seed.sql
npm run dev
```

Уведомление: `identity/01_preflight.sql`, `identity/02_link_profile.sql`,
`tests/identity_stub.sql` из DB-репозитория для Node.js НЕ запускать.

Проверка API:
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
npm run typecheck
npm run build
```

## API (авторизация обязательна, кроме /auth/* и health/ready)
- `POST /api/auth/register` — email, password, displayName → account UUID, profileId, token.
- `POST /api/auth/login` — email, password → account UUID, profileId, token.
- `GET /api/auth/me` — user account/profile summary.
- `GET /api/profile`, `PATCH /api/profile` — current user's profile.
- `GET /api/vacancies` — filtered catalog using DB team fields.
- `GET /api/vacancies/:id` — vacancy card + skills.
- `POST /api/vacancies/:id/outbound-click` — record source link click and return originalUrl.
- `GET /api/favorites`, `PUT /api/favorites/:vacancyId`, `DELETE /api/favorites/:vacancyId`.

## Границы версии
- Нет внешнего импортёра, OpenAI-вызова, поиска по промпту, refresh-токенов,
  email-подтверждения и готовой публичной безопасности (rate limits).
- Нет встроенной Python QA suite: требования в docs/qa, тесты ведёт другой участник.
- SQL-скрипты upstream принадлежат инженеру БД. Локальная авторизационная
  надстройка — предлагаемый вариант для синхронизации команд.
- Файл package-lock.json появится после npm install — закоммить его;
  затем использовать npm ci в CI.

Windows PowerShell: use `npm.cmd install` (or `npm.cmd install --cache .npm-cache` if the default cache is inaccessible), `npm.cmd run typecheck`, `npm.cmd run build`. Current stage verification and DB limitations: docs/qa/HANDOFF.md.
