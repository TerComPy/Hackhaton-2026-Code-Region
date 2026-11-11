# Согласование Node.js API с актуальной схемой БД

Источник: https://github.com/manhattanattack/hackaton-sql-scheme
Снимок изучен на коммите `efe6b9d199ef602c4f97282b998e953b21cebe8d` (2026-11-11).

**Важно:** upstream SQL/README пока ориентированы на ASP.NET Core Identity и EF Core.
Node.js не создаёт `AspNetUsers`, а встроенные токены Identity не совпадают с JWT.
Поэтому этот boilerplate содержит **предложение адаптации**, которое сначала должно
быть согласовано и объединено с основной схемой инженером БД. До согласования
не считайте локальную интеграцию официальной версией архитектуры.

## Что остаётся неизменным
- `01_schema.sql` — источники, компании, вакансии, профили, навыки, избранное, переходы (9 таблиц).
- `08_prompt_schema.sql` — `search_requests` и `search_results` (опционально).
- `user_profiles.auth_subject` — VARCHAR(191) utf8mb4_bin, уникальный строковый ID аккаунта.
- `user_profiles.id` — BIGINT, используется как user_id во всех бизнес-таблицах.
- `work_format`, `schedule_type`, `contract_type` — новые поля вакансий.

## Что меняется в проекте Node.js
1. Backend создаёт `auth_users`, а не `AspNetUsers`/EF Identity (01_auth_users.sql).
2. `user_profiles.auth_subject` получает FK на `auth_users.id` с `ON DELETE RESTRICT`
   через 02_link_profile.sql вместо upstream `identity/02_link_profile.sql`.
3. Регистрация вставляет account и profile в одной транзакции. Логин использует
   normalized_email (CI UNIQUE) и Argon2id. UUID — внешний ID, BIGINT — внутренний ID профиля.
4. Все операции владельца используют проверенный JWT subject и затем `user_profiles.id`.
5. Старые справочные QA01–QA03 требуют удаления `JOIN AspNetUsers` или замены его на `auth_users`.
6. `02_queries.sql` — каталог SQL, а не запускаемый файл. Mysql2 требует
   позиционные `?` (или настройки namedPlaceholders), не Dapper-параметры `@user_id`.
7. Не запускать upstream `identity/01_preflight.sql`, `identity/02_link_profile.sql`
   и `tests/identity_stub.sql` на Node.js базе.

## Особенности контрактов
- Для Q03 параметр `@user_id` — числовой ID профиля, не UUID.
- Валюта зарплаты сравнивается только при одинаковом периоде и типе суммы.
  В минимальном API фильтр minSalary ограничен RUB/месяц.
- `full_time` — объём занятости; `permanent` — бессрочный договор. Они не равны.
- Неизвестные параметры принимают `unknown`; не подменять их предположениями.
- В выдаче skill_match_percent означает долю известных совпавших навыков,
  а не вероятность получить работу.
- Переход на сайт фиксирует факт открытия ссылки, а не отправку отклика.
- Импорт/ИИ-поиск/история промптов остаются следующими этапами реализации API.

## Важно для команды
Попросить инженера БД внести Node.js-ветку авторизации в canonical SQL,
переписать AUTH_AND_IMPORT.md и preflight, а затем повторить MySQL 8.4 проверки.

- Прототип GET /vacancies использует свой параметризованный вариант Q03,
  но пока без полного воспроизведения всех опций канонического SQL (например,
  произвольной валюты/периода). Требуется SQL-интеграционный тест.
