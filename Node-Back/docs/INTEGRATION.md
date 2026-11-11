# Claude importer integration contract

Import `db` from src/config/db.ts, `env` from src/config/env.ts and `logger` from src/lib/logger.ts. Do not import server.ts or app.ts in a standalone CLI. Run from Node-Back so dotenv finds .env. The CLI entrypoint owns db.end() in finally; reusable importer functions must never close the shared pool. Release borrowed connections in finally and roll back failed transactions. Use parameterized SQL and preserve BIGINT strings.

Claude supplies its CLI entrypoint and required configuration fields. Codex then adds import:trudvsem as `tsx <agreed-entrypoint>`; no placeholder command is installed. New environment fields must be validated centrally. Log counts, source IDs and durations; never log credentials, tokens, raw request bodies or connection strings. Throw errors from reusable modules; CLI catches at the boundary, logs a sanitized summary and sets exitCode=1. HTTP errors use HttpError and the existing middleware. No importer implementation is included here.

SQL adapter remains pending DBA approval. Existing business tables and Identity scripts must not be changed or executed by the importer. Integrate via PR; no merge without agreement.
