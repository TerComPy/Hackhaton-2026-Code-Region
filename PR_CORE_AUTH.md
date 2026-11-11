# Stabilize core infrastructure and document importer integration

Adds dependency lockfile, shared logger, bounded graceful shutdown and MySQL connection timeout. Documents standalone importer ownership of configuration, logging and pool lifecycle; importer code is excluded.

Validation: npm ci, typecheck, build, Argon2id hash/verify pass. HTTP smoke: health 200; ready 503 without MySQL; unauthenticated me/catalog 401.

Blocked: Docker Engine unavailable. Real MySQL registration/login/me, grants, FK and transaction verification remain required. Node auth adapter is pending DBA approval. No schema changes, data deletion or importer implementation.
