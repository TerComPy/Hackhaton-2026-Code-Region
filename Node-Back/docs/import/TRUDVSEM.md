# Импорт вакансий «Работы России» (этап 1B)

Модуль `src/modules/import` загружает вакансии из открытого API «Работы России», приводит их к каноническому формату БД и идемпотентно сохраняет в MySQL. Работает отдельно от Express: CLI не импортирует `app.ts` / `server.ts`.

## Как запустить

Из каталога `Node-Back/`:

```bash
# Только загрузка и нормализация, БД не используется (.env не нужен)
npx tsx src/modules/import/cli/trudvsem.ts --dry-run --limit 20

# Сохранение в MySQL (нужен .env с MYSQL_* и прочими полями из src/config/env.ts)
npx tsx src/modules/import/cli/trudvsem.ts --limit 100
npx tsx src/modules/import/cli/trudvsem.ts --region 7800000000000 --limit 50
npx tsx src/modules/import/cli/trudvsem.ts --text "стажер" --limit 30

# Выяснить единицу offset (страница или запись) — см. «Ограничения»
npx tsx src/modules/import/cli/trudvsem.ts --probe-offset
```

После того как Codex добавит скрипт (см. ниже), то же самое: `npm run import:trudvsem -- --dry-run --limit 20`.

| Параметр | По умолчанию | Описание |
|---|---|---|
| `--limit` | 20 | 1..100 вакансий за один запрос |
| `--region` | все регионы | 13-значный код, например `7800000000000` |
| `--text` | — | текстовый фильтр API |
| `--offset` | 0 | передаётся в API как есть; единица не подтверждена |
| `--dry-run` | выкл. | загрузить, нормализовать, вывести отчёт; MySQL не открывается |
| `--preview` | 3 | сколько нормализованных вакансий вывести в dry-run |
| `--probe-offset` | — | сравнить `offset=0` и `offset=1` и выйти |
| `--timeout-ms` | 15000 | таймаут одной попытки, включая чтение тела |
| `--retries` | 2 | повторы временных ошибок (итого попыток = retries + 1) |
| `--api-base-url` | `https://opendata.trudvsem.ru/api/v1/vacancies` | подмена адреса API для mock-сервера QA; в рабочем запуске не используется |
| `--verbose` | выкл. | debug-логи |

Вывод: JSON-отчёт в **stdout**, JSON-логи в **stderr**. Коды выхода: `0` — успех, `1` — фатальная ошибка (API, конфигурация, нет источника, несовместимая схема), `2` — частичный результат (часть вакансий не сохранена или импорт остановлен после серии ошибок).

## Архитектура

```
cli/trudvsem.ts            разбор аргументов, логгер, жизненный цикл пула (db.end() только здесь)
services/import.service.ts поток: проверка источника → fetch → дедупликация → сохранение по одной
adapters/trudvsem.adapter.ts  HTTP-запрос, проверка JSON-статуса, вызов маппера
adapters/trudvsem.mapper.ts   JSON «Работы России» → NormalizedVacancy (чистые функции)
repositories/import.repository.ts  MySQL: QI14 → Q01 → Q02 → навыки, одна транзакция на вакансию
http.ts, normalize.ts, schemas.ts, types.ts, errors.ts  общие части
```

- Сервис и репозиторий не знают структуру JSON источника: они работают с `NormalizedVacancy`. Новый источник (SuperJob) = новый адаптер, реализующий `VacancySourceAdapter`.
- Зависимости внедряются: пул (`ImportDbPool` — подмножество mysql2, которому структурно соответствует общий `db`), логгер (`ImportLogger` — сигнатура pino, подойдёт общий `logger`), `fetch`, `sleep`.
- Второй пул не создаётся: в режиме записи CLI лениво импортирует общий `db` из `src/config/db.ts`. В dry-run БД и `env.ts` не загружаются вообще.
- HTTP-запрос к источнику выполняется **до** транзакции; транзакция не держится во время сетевого ввода-вывода.

## HTTP-клиент

- Встроенный `fetch`, таймаут через `AbortSignal.timeout`, внешняя отмена (Ctrl+C) через `AbortSignal.any`.
- HTTP 200 не считается успехом: проверяется поле `status` в JSON (`"200"`). Ошибка в теле → `API_ERROR`.
- Повторяются только временные ошибки: сеть, таймаут, HTTP 408/425/429/5xx, тело не JSON, `status` ≥ 500 в теле. HTTP 4xx и `status` 4xx в теле не повторяются.
- Экспоненциальная задержка с jitter (1 с, 2 с, … ≤ 10 с), `Retry-After` учитывается, но не больше 10 с.
- Ответ больше 20 МБ отклоняется. Тело ответа и SQL-значения в логи не пишутся.
- Один запрос за запуск (до 100 вакансий), параллельных запросов нет. `--probe-offset` делает 2 запроса с паузой 0,5 с.

## Нормализация

| Поле API | Колонка | Правило |
|---|---|---|
| `company.companycode` + `id` | `external_id` | `companycode:id`; без них запись отклоняется |
| `company.companycode`, `name`, `url` | `companies.*` | `company.email`, ИНН, КПП, ОГРН не сохраняются |
| `job-name` | `title` | обязательно, ≤ 255 символов |
| `duty` | `responsibilities` | контакты вычищаются |
| `requirements`, `qualification`, `requirement.qualification` | `requirements` | объединяются без дублей |
| всё перечисленное + `requirement.education`, `benefit`, `term.text`, `medicalDocuments`, `conditions` | `description` | полный текст по разделам «Обязанности / Требования / Образование / Условия»; сниппеты не используются |
| `vac_url` | `original_url` | только хост `trudvsem.ru`, иначе запись отклоняется |
| `region.name` | `region_name` | |
| `region.region_code` | `region_code`* | 13 цифр, строкой |
| — | `city` | только для городов федерального значения (77/78/92); из адреса город не угадывается |
| `addresses.address[0].location` | `address_text` | ≤ 500 символов, контакты вычищаются |
| `addresses.address[0].lat/lng` | `latitude/longitude`* | вне диапазона → оба NULL |
| `salary_min`, `salary_max` | `salary_min/max` | 0, отрицательные и мусор → NULL; если min > max, max → NULL; текст «от 30000» не разбирается |
| `currency` | `currency` | «руб.», RUR и т. п. → `RUB`; нераспознанная валюта → суммы и валюта NULL; конвертации нет |
| — | `salary_period` | всегда `unknown`: в API нет периода оплаты |
| — | `salary_gross` | всегда NULL: в API нет признака «до/после налогов» |
| `requirement.experience` | `experience_months_min` | целое число лет × 12; 0 → 0 («без опыта»); нет/мусор → NULL |
| `employment` | `employment_type` / `work_format` / `contract_type` | «Полная занятость» → `full_time`; «Частичная» → `part_time`; «Стажировка» → `internship`; «Дистанционная (удаленная)» → `work_format=remote`; «Временная» / «Сезонная» → `contract_type=fixed_term`; остальное `unknown`. Полная занятость **не** означает бессрочный договор |
| `schedule`, `scheduleTypeComment`, `shift[]` | `schedule_text`, `schedule_type` | «Сменная работа» / «По графику сменности» → `shift`; «Режим гибкого рабочего времени» → `flexible`; «Ненормированный», «Вахтовый метод», «Неполный рабочий день» → `other`; явные «5/2» / «6/1» в комментарии → `five_two` / `six_one`. «Полный рабочий день» **не** доказывает 5/2 → `unknown` |
| `typicalPosition` | `typical_position`* | |
| `code_profession` | `code_profession`* | строкой, ведущие нули сохраняются |
| `category.specialisation` | `specialisation`* | |
| `creation-date` | `published_at` | дата без времени = полночь по Москве → UTC (`2026-11-03` → `2026-11-02 21:00:00`) |
| `date_modify` | `source_updated_at` | `+0300` → UTC |
| `skills[]` | `skills`, `vacancy_skills` | очистка, дедупликация без учёта регистра и ё/е; длиннее 150 символов отбрасываются; `is_required = 0` всегда |
| — | `country_code`, `status` | `RU`, `active` |

\* — колонки есть в новой канонической схеме (upstream `4ce04c4`), но отсутствуют в закреплённой базовой ревизии `efe6b9d`. Репозиторий при старте читает `information_schema.COLUMNS` и пишет эти поля, **только если колонки уже есть в БД**. Новые колонки модуль не создаёт.

### Персональные данные

- `contact_list`, `contact_person`, `company.email` отбрасываются Zod-схемой ещё до маппинга (z.object удаляет неописанные ключи). Имя контактного лица читается только для того, чтобы вычистить его из свободного текста.
- Из свободного текста удаляются e-mail, российские номера телефонов (+7/8 и 10 цифр; местные вида `775-05-43`) и имя контактного лица (полностью, «Фамилия И.О.», «И.О. Фамилия», «Имя Отчество», «Фамилия Имя»). На их место ставится «(контакты — на сайте источника)».
- `raw_payload` не заполняется никогда (в новой схеме этой колонки уже нет).
- Ограничение: имена посторонних людей, не указанных в `contact_person`, по свободному тексту не распознаются.

## Запись в MySQL

Для каждой вакансии на одном соединении:

1. `SET time_zone = '+00:00'`, `BEGIN`.
2. **QI14**: `SELECT id, source_updated_at … FOR UPDATE` по `(source_id, external_id)`. Если сохранённая версия новее входящей, транзакция откатывается, результат `skipped_stale`.
3. **Q01**: upsert компании, затем `SELECT LAST_INSERT_ID()` на том же соединении.
4. **Q02**: upsert вакансии, `last_seen_at = UTC_TIMESTAMP(6)`, затем `SELECT LAST_INSERT_ID()`.
5. Навыки (только если источник прислал полный список, то есть ключ `skills` есть в ответе): upsert каждого навыка → `DELETE FROM vacancy_skills WHERE vacancy_id = ?` → вставка связей.
6. `COMMIT`. При любой ошибке выполняется `ROLLBACK` и соединение освобождается; частично записанная вакансия не остаётся.

- Upsert использует синтаксис MySQL 8.0.19+ `VALUES (…) AS new_row ON DUPLICATE KEY UPDATE col = new_row.col` (функция `VALUES()` устарела). Отличие от текста Q01/Q02 только в способе передачи параметров (`?` вместо `:name`, потому что общий пул создан без `namedPlaceholders`).
- Значения передаются только через `?`. Имена колонок берутся из констант в коде.
- Перед началом проверяется, что источник `trudvsem` есть в `sources` и включён; иначе API даже не вызывается.
- Повторный импорт обновляет строку (`updated`), не создавая дубликатов. Вакансии, которых нет на текущей странице, **не архивируются**.
- После 5 ошибок сохранения подряд импорт останавливается (`aborted: true`, код выхода 2): обычно это означает, что БД недоступна.
- Журнал `import_runs` и `sources.last_success_at` пока не обновляются: таблица `import_runs` есть только в новой схеме. Это следующий этап.

## Отчёт (stdout)

```json
{
  "source": "trudvsem", "dryRun": false,
  "received": 100, "totalReportedBySource": 479541, "normalized": 100,
  "rejected": [], "duplicatesInBatch": 0,
  "inserted": 98, "updated": 2, "skippedStale": 0,
  "failed": [], "aborted": false, "durationMs": 1830
}
```

`rejected[]` = `{ index, externalId, reason }`. `failed[]` = `{ externalId, code, message }`. Персональных данных в отчёте нет. В dry-run добавляется `preview[]` с нормализованными вакансиями.

## Тесты разработчика

`test/import/*.test.ts` (node:test, новых зависимостей нет):

```bash
npx tsx --test test/import/*.test.ts
```

- `normalize.test.ts`: очистка текста, контакты, валюта, суммы, даты, навыки.
- `trudvsem.mapper.test.ts`: реальный ответ API (обезличенная фикстура `test/fixtures/trudvsem/vacancies.page.json`) и все правила маппинга.
- `trudvsem.adapter.test.ts`: URL, повторы, `Retry-After`, ошибки в теле, не-JSON, таймаут, отмена, `--probe-offset`.
- `import.service.test.ts`: транзакции, идемпотентность, откат, устаревшие снимки, несовместимая схема, обе ревизии схемы. Используется **in-memory заглушка MySQL** (`fake-db.ts`): она проверяет логику, но не синтаксис SQL.

## Ограничения

- **Семантика `offset` не подтверждена.** Импорт ограничен одним запросом (≤ 100 вакансий). Перед многостраничной загрузкой запустите `--probe-offset` и зафиксируйте результат.
- Синтаксис SQL не проверен на реальном MySQL 8.4: в среде разработки не было ни MySQL, ни Docker.
- Живой API `opendata.trudvsem.ru` из среды разработки недоступен (egress-прокси). Маппинг проверен на реальном ответе API из 100 вакансий, полученном 11.11.2026.
- Typecheck выполнен TypeScript 6.0 с заглушками типов `mysql2` / `dotenv`; проект использует TypeScript 5.9 и реальные типы — нужен прогон `npm run typecheck` в проекте.
- Одинаковые вакансии с разных сайтов остаются разными строками.

## Integration requirements for Codex

1. **`package.json` → `scripts`** (общий файл, его меняет Codex):
   ```json
   "import:trudvsem": "tsx src/modules/import/cli/trudvsem.ts",
   "test:import": "tsx --test test/import/*.test.ts"
   ```
   Аргументы передаются через `--`: `npm run import:trudvsem -- --dry-run --limit 20`. На Windows используйте `npm.cmd`.
2. **Логгер.** После слияния `feat/core-auth` в CLI можно заменить локальный `createCliLogger` на общий `logger` из `src/lib/logger.ts` (интерфейс `ImportLogger` совместим с pino). Это изменение в одну строку, и его можно сделать на любом этапе. До тех пор CLI пишет JSON-строки в stderr.
3. **Новые переменные окружения не нужны.** Все настройки передаются аргументами CLI. `src/config/env.ts` не менялся.
4. **`tsconfig.json`**: `include: ["src/**/*.ts"]`, поэтому тесты в `test/` не попадают в `build` и `typecheck`. Если тесты нужно проверять типами, добавьте `tsconfig.test.json`.
5. Изменения в `app.ts`, маршрутах, OpenAPI и `AGENTS.md` не требуются: HTTP API не менялся.
6. Общие `docs/qa/CHANGELOG.md`, `HANDOFF.md` и `TEST_REQUIREMENTS.md` не трогались. Добавьте в них ссылку на `docs/qa/handoffs/trudvsem-import.md` при объединении.

## Database engineer requests

1. **Расхождение ревизий.** Задание закреплено на `efe6b9d` (есть `raw_payload`, нет профессии и координат), а в upstream уже `4ce04c4`: `raw_payload` удалена; добавлены `typical_position`, `code_profession`, `specialisation`, `region_code`, `latitude`, `longitude`, `content_hash`, `import_runs`, `users`. Импортёр работает с обеими версиями. Какую ревизию команда разворачивает для демо?
2. **Единица `requirement.experience`.** В BACKEND_HANDOFF написано «в подтверждённых годах». В реальном ответе встречаются значения 0, 1, 2, 3, 5, 6, 9, и они похожи на годы. Подтвердите или укажите источник.
3. **`creation-date` без времени** сохраняется как полночь по Москве в UTC (`2026-11-02 21:00:00` для `2026-11-03`). Подходит ли это, или лучше `00:00:00 UTC`?
4. **«Временная/Сезонная работа» → `contract_type = fixed_term`** (ТК РФ, ст. 59). Согласны?
5. **`city` для 77/78/92** заполняется названием города федерального значения. Для остальных регионов `city = NULL`. Нужна ли таблица городов или разбор адреса?
6. **Пустой массив `skills`** считается полным снимком и удаляет старые связи навыков вакансии. Это соответствует правилу «заменить по полному снимку»?
7. **Q01/Q02 с row alias** (`AS new_row`) вместо повторных именованных параметров. Это эквивалентная запись для mysql2 без `namedPlaceholders`. Нужна ли она в каталоге?
8. **`import_runs`** (QI01–QI03, Q13) будет подключён на следующем этапе, если таблица войдёт в принятую схему.
