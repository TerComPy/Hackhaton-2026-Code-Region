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
