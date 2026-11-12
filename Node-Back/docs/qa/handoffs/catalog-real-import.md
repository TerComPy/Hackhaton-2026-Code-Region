# Catalog and manual import

Production catalog (including detail) and personal matching exclude sources.code=demo. Test/development seed remains available. mysql2 connections explicitly use utf8mb4; JSON and normalization preserve Unicode. No existing data is recoded.

Run from Node-Back on the server after deploying the build, with the normal application environment (.env) and an enabled trudvsem source. These commands are for the administrator; they were not run against production.

```sh
npm run import:trudvsem -- --dry-run --limit 20
npm run sync:trudvsem -- --limit 100 --max-pages 10 --max-records 1000 --pause-ms 1000 --timeout-ms 15000 --retries 2
npm run import:runs
```

Optionally append --region with a 13-digit region code. Sync defaults to full mode; live incremental mode is disabled until upstream date semantics are verified. Multiple pages require the built-in offset probe; unknown semantics fall back to one page. Repeated runs use the source/external ID identity and existing transactional upserts. Transient HTTP failures have bounded retries/timeouts. Inspect the JSON report and journal: exit 0 means success, 2 partial, 1 failure. A successful bounded run is not a complete nationwide import. Do not schedule concurrent runs.

Verification: npm run typecheck; npm run build; npm run test:import; npm run test:match; npm run test:ai. Integration scripts require RUN_ISOLATED_MYSQL_TESTS=yes, canonical schema checkout at the pinned revision and a dedicated disposable MySQL 8.4 (TEST_MYSQL_*); never point them at production. Run test:integration, test:import:integration and test:sync:integration.
