# Canonical alignment

Canonical DB: https://github.com/manhattanattack/hackaton-sql-scheme/tree/4ce04c4870c43a65fe1f0265f0c75d3f4265c603

Use MySQL 8.4 in an isolated disposable instance. The SQL files explicitly USE
vacancy_aggregator; never apply them to an unknown server or an existing working DB.
Check out revision `4ce04c4870c43a65fe1f0265f0c75d3f4265c603`. Run once, in order:
1. `01_schema.sql` (12 tables)
2. `08_prompt_schema.sql` (4 tables)
3. `09_ai_schema.sql` (1 table)
4. `03_seed.sql` (fictional catalog)
5. Register accounts through the API; optionally run `07_demo_profile_seed.sql`
   with the registered account UUID as documented upstream.

No local adapter migrations are required. This is initial creation, not migration
of older databases. Do not remove existing volumes. Query catalogs 02/05/06/10 are
reference operations, not migrations to execute wholesale.

`users.id` is the JWT subject (UUID). `user_profiles.auth_subject` references it
with ON DELETE RESTRICT; profile BIGINT IDs remain strings in HTTP and business FKs.
Argon2id and transactional registration are retained. Every protected request checks
active status and token_version against users; role comes from the DB.
mysql2 uses UTC session initialization, dateStrings, exact DECIMAL strings,
BIGINT strings, named placeholders and disabled multiple statements.
History belongs to recommendation_runs; no parallel history tables are introduced.
Refresh rotation and logout endpoints remain a separate stage.

Validated on real MySQL 8.4.13: 17 tables, FK, precision and 10 UTC sessions.
See ../qa/INTEGRATION_ACCEPTANCE.md. Canonical SQL files were not modified.
