# QA handoff — импортёр «Работы России» (этап 1B, ветка `feat/trudvsem-import`)

Подробное описание модуля: `docs/import/TRUDVSEM.md`. Этот документ — то, что нужно для независимых Python-тестов (pytest + httpx). HTTP API бэкенда **не менялся**: импортёр — отдельная CLI-команда, тестируется как внешний процесс.

## 1. Что появилось

CLI `src/modules/import/cli/trudvsem.ts`:

1. Загружает до 100 вакансий из `GET /api/v1/vacancies` (или `/vacancies/region/{код}`).
2. Проверяет HTTP-статус и поле `status` внутри JSON.
3. Нормализует вакансии.
4. Сохраняет компании, вакансии и навыки в MySQL. Каждая вакансия сохраняется в своей транзакции.

Повторный запуск обновляет строки, а не дублирует их.

## 2. Как запускать

Из `Node-Back/`:

```bash
npx tsx src/modules/import/cli/trudvsem.ts [--dry-run] [--limit N] [--region 13цифр] [--text Q] \
  [--offset N] [--preview N] [--timeout-ms MS] [--retries N] [--api-base-url URL] [--probe-offset]
```

После интеграции Codex: `npm run import:trudvsem -- <те же аргументы>`.

Из pytest удобно запускать через `subprocess.run([...], capture_output=True, text=True, cwd="Node-Back", timeout=120)`:

- **stdout** — один JSON-отчёт (`json.loads(proc.stdout)`).
- **stderr** — JSON-логи, по одной строке на событие.
- **exit code**: `0` — успех, `1` — фатальная ошибка, `2` — частичный результат.

`--api-base-url http://127.0.0.1:<port>/api/v1/vacancies` направляет импортёр на ваш mock-сервер (например `pytest-httpserver`). Так тесты не зависят от живого API и могут симулировать ошибки.

## 3. Окружение

- Node.js 22+, `npm ci` в `Node-Back/`.
- **Dry-run**: MySQL и `.env` не нужны.
- **Запись**: нужен `.env` с полями из `src/config/env.ts`: `CORS_ORIGIN`, `JWT_SECRET` (≥ 32 символов), `MYSQL_*`. Нужна MySQL 8.4 с канонической схемой.
- Тестовая БД: отдельная база или отдельный контейнер. Не используйте общий volume. Применить по порядку:
  1. `01_schema.sql` из `manhattanattack/hackaton-sql-scheme`. Поддерживаются ревизия `efe6b9d` и новая `4ce04c4`, см. п. 9.
  2. `03_seed.sql` (или хотя бы строка `sources` с `code='trudvsem'`, `is_enabled=1`).
  3. Node auth-скрипты для импорта не нужны: импортёр работает только с `sources`, `companies`, `vacancies`, `skills`, `vacancy_skills`.
- Нужные права MySQL-пользователя: `SELECT, INSERT, UPDATE, DELETE` на эти таблицы и чтение `information_schema.COLUMNS` (есть по умолчанию).

## 4. Входные данные

Фикстура реального ответа: `test/fixtures/trudvsem/vacancies.page.json`, 10 вакансий. Контактные данные в ней заменены на фиктивные (`Тестова Анна Петровна`, `+7(900) 000-00-NN`, `*@example.invalid`). Структура ответа:

```json
{ "status": "200", "meta": { "total": 479541, "limit": 10 },
  "results": { "vacancies": [ { "vacancy": { "id": "…", "company": { "companycode": "…" }, "job-name": "…", "vac_url": "https://trudvsem.ru/vacancy/card/…", … } } ] } }
```

Ошибка API приходит с HTTP 200: `{"status":"500","meta":{"error":"…"}}`.

## 5. Нормализованный объект и отчёт

Dry-run выводит `preview[]` с объектами `NormalizedVacancy`; поля — canonical колонки в camelCase (`externalId`, `salaryMin`, `experienceMonthsMin`, `scheduleType`, …). Отчёт:

```json
{ "source": "trudvsem", "dryRun": true, "received": 10, "totalReportedBySource": 479541,
  "normalized": 10, "rejected": [{"index": 1, "externalId": null, "reason": "…"}],
  "duplicatesInBatch": 0, "inserted": 0, "updated": 0, "skippedStale": 0,
  "failed": [{"externalId": "…", "code": "DB_ERROR", "message": "…"}], "aborted": false, "preview": [ … ] }
```

## 6. Сценарии

### Можно проверять сразу (dry-run + mock-сервер, без MySQL)

| # | Сценарий | Ожидание |
|---|---|---|
| D1 | Фикстура, `--dry-run --limit 10 --preview 10` | exit 0; `received=normalized=10`; `rejected=[]`; MySQL не трогается |
| D2 | Нет персональных данных | ни одно значение `contact_person`, `contact_list[].contact_value`, `company.email` из фикстуры не встречается в stdout и stderr |
| D3 | В `duty` подставлены «Тестова А.П.», `+7 (900) 123-45-67`, `boss@example.invalid` | в `description` и `responsibilities` их нет, вместо них «(контакты — на сайте источника)» |
| D4 | `externalId` | `"{company.companycode}:{id}"` |
| D5 | Валюта `«руб.»` | `currency = "RUB"`; `salaryPeriod = "unknown"`; `salaryGross = null` |
| D6 | `salary_min = 0` и `salary_max = 0` | обе суммы `null`, `currency = null` |
| D7 | Валюта `у.е.` при суммах | суммы и валюта `null` |
| D8 | `salary_min > salary_max` | `salaryMin` сохранён, `salaryMax = null` |
| D9 | `experience: 0` / `1` / нет ключа / `"много"` | `0` / `12` / `null` / `null` |
| D10 | `schedule = "Полный рабочий день"` | `scheduleType = "unknown"` (не `five_two`) |
| D11 | `employment = "Полная занятость"` | `employmentType = "full_time"`, `contractType = "unknown"` |
| D12 | `employment = "Дистанционная (удаленная) работа"` / `"Временная работа"` | `workFormat = "remote"` / `contractType = "fixed_term"` |
| D13 | `date_modify = "2026-11-10T13:39:39+0300"` | `sourceUpdatedAt = "2026-11-10 10:39:39.000000"` |
| D14 | `creation-date = "2026-11-03"` | `publishedAt = "2026-11-02 21:00:00.000000"` |
| D15 | Повторяющиеся навыки с разным регистром | один навык; `skillsComplete = true` |
| D16 | Нет `companycode`, нет `job-name`, `vac_url` на чужом хосте | запись в `rejected[]`, остальные нормализованы, exit 0 |
| D17 | HTTP 503 на все запросы, `--retries 1` | 2 запроса к mock-серверу; exit 1; в stderr `"code":"HTTP_ERROR"` |
| D18 | HTTP 503, затем 200 | exit 0 |
| D19 | HTTP 400 | ровно 1 запрос; exit 1 |
| D20 | HTTP 200, `{"status":"500"}` | `API_ERROR`; запросов = retries + 1; exit 1; текст `meta.error` не попадает в логи |
| D21 | HTTP 200, тело не JSON (HTML) | `INVALID_JSON`, exit 1 |
| D22 | Сервер не отвечает, `--timeout-ms 1000 --retries 0` | `TIMEOUT` примерно через 1 с; exit 1 |
| D23 | `--limit 0`, `--limit 101`, `--region 78`, неизвестный флаг | exit 1, сообщение об аргументе, запросов нет |
| D24 | `--region 7800000000000 --text "инженер по тестированию"` | путь `/region/7800000000000`, `text` URL-закодирован |
| D25 | `--probe-offset` | 2 запроса (`offset=0`, `offset=1`, `limit=5`); JSON с `semantics` = `page` / `record` / `unknown` |

### Только с MySQL (тестовая БД)

| # | Сценарий | Ожидание |
|---|---|---|
| M1 | Первый импорт фикстуры | exit 0; `inserted = 10`; 10 строк в `vacancies` с `source_id` источника `trudvsem`; строки в `companies` по числу уникальных `companycode` |
| M2 | Повторный импорт той же фикстуры | `updated = 10`, `inserted = 0`; `COUNT(*)` в `vacancies`, `companies`, `skills`, `vacancy_skills` не изменился; `id` не изменились; `last_seen_at` обновлён |
| M3 | Изменили `job-name` и повторили | заголовок обновился, дубликата нет |
| M4 | `date_modify` старше сохранённого | `skippedStale = 1`, строка не изменилась |
| M5 | Колонки | `raw_payload` NULL (ревизия `efe6b9d`) или отсутствует (`4ce04c4`); ни в одной текстовой колонке нет телефонов, e-mail и ФИО контактов из входа |
| M6 | `published_at`, `source_updated_at` | UTC, совпадают с D13/D14 |
| M7 | `vacancy_skills.is_required` | всегда 0 |
| M8 | Пустой `skills: []` при повторном импорте | связи вакансии удалены, сами `skills` остаются |
| M9 | Нет строки `sources.code='trudvsem'` | exit 1, `SOURCE_NOT_FOUND`, mock-сервер **не** получил ни одного запроса |
| M10 | `sources.is_enabled = 0` | exit 1, `SOURCE_DISABLED`, запросов к API нет |
| M11 | БД недоступна (неверный порт) | exit 1, `DB_ERROR`, запросов к API нет |
| M12 | Ошибка API после успешного импорта | exit 1; ранее сохранённые вакансии не тронуты и не архивированы |
| M13 | Транзакционность: перед импортом создать `BEFORE INSERT` триггер на `vacancy_skills` с `SIGNAL SQLSTATE '45000'` | вакансия с навыками в `failed[]`, `code = DB_ERROR`; её строки нет ни в `vacancies`, ни в новой `companies`; exit 2. Вакансии без навыков сохранены |
| M14 | Неполная схема (тестовая БД без колонки `contract_type`) | exit 1, `SCHEMA_MISMATCH`, запросов к API нет |
| M15 | Схема `4ce04c4` | заполнены `typical_position`, `code_profession` (строкой), `specialisation`, `region_code`, `latitude`, `longitude` |
| M16 | Только `vacancies` исследуемого источника | строки других источников (`demo` из seed) не изменены |

## 7. Тестовые пользователи

Импорту не нужны: он не использует авторизацию. Каталог `GET /api/vacancies` после импорта проверяется с обычным пользователем из сценариев этапа 1A.

## 8. Что зависит от Codex

- `npm run import:trudvsem` / `npm run test:import` появятся после правки `package.json` Codex'ом. До этого используйте `npx tsx …`.
- Видимость импортированных вакансий в `GET /api/vacancies` — маршрут Codex. Он уже читает `vacancies`, но SQL-интеграционные тесты каталога на реальной БД в этапе 1A не выполнялись.

## 9. Известные ограничения

- Один запрос за запуск, не больше 100 вакансий. Единица `offset` не подтверждена (сценарий D25 это проверяет).
- Синтаксис SQL и права на реальной MySQL 8.4 разработчиком **не проверены**: в среде не было MySQL/Docker. Сценарии M* — первые реальные проверки.
- Живой API разработчиком не вызывался (сеть среды блокирует `opendata.trudvsem.ru`). Маппинг проверен на реальном ответе из 100 вакансий от 11.11.2026.
- Схемы: базовая `efe6b9d` и новая `4ce04c4` поддерживаются автоматически (поиск колонок через `information_schema`).
- `import_runs` и `sources.last_success_at` не обновляются.
- `city` известен только для Москвы, Санкт-Петербурга и Севастополя.
- Имена людей в свободном тексте удаляются, только если это контактное лицо из `contact_person`.

## 10. Юнит-тесты разработчика (для справки)

`npx tsx --test test/import/*.test.ts` — 57 тестов (node:test). MySQL эмулируется in-memory заглушкой, поэтому эти тесты не заменяют сценарии M*.
