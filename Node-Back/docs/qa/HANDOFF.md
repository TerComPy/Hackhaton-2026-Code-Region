# QA handoff — Backend 0.2.0 (schema adaptation proposal)

Reference DB repo: https://github.com/manhattanattack/hackaton-sql-scheme
Commit: efe6b9d199ef602c4f97282b998e953b21cebe8d

**Integration status:** files updated locally, not validated on a running MySQL instance;
not yet accepted by DB engineer. QA should test after they approve auth_users/FK changes.

Setup: `docker compose up -d mysql`; apply upstream `01_schema.sql`,
`db/node-adapter/01_auth_users.sql`, `db/node-adapter/02_link_profile.sql`,
optional `08_prompt_schema.sql`, and `03_seed.sql` for demo data.
Do NOT execute upstream ASP.NET identity scripts or stub.

Changes: profile GET/PATCH, vacancy filter/catalog/detail, favorites,
click-to-source logging. Missing: import, LLM, prompt history, refresh, rate limiting.
See `docs/qa/TEST_REQUIREMENTS.md` for Python pytest cases.
