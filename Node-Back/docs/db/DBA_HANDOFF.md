# DBA handoff

See [canonical alignment](UPSTREAM_ALIGNMENT.md).

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
