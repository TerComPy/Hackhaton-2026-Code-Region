# Connection dialog and catalog guest UI

Base: origin/main fb5a935 (TerComPy/Hackhaton-2026-Code-Region).

Successful health/ready checks render no banner or layout container. Connection failures use a shared native modal dialog with safe endpoint/status text, retry, close, Escape, focus containment/restoration and body scroll locking. HTTP 401 and cancelled requests do not open it. Mock mode remains unchanged.

Catalog guests use the three supplied WebP assets, responsive centered layout, theme tokens and reduced-motion support. Loading, API error and empty results remain separate states.

## Local HTTP 500 diagnosis

Unmocked requests through Vite on port 5197 returned HTTP 500 with an empty body for both `/api/health` and `/api/ready`. Vite logged `connect ECONNREFUSED 127.0.0.1:3000`. The configured backend target was not listening. The first failing startup check is `/api/health`; readiness is checked only after health succeeds.

The Express health handler returns 200; readiness returns 503 when `SELECT 1` fails. The observed 500 is produced by the development proxy when it cannot reach Express. No backend contracts were changed. Start the configured backend and database to restore real connectivity; UI retry does not repair the service.

## Validation commands

- `npm run typecheck`
- `npm run build`
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test --config playwright.connection.config.ts`
- `PLAYWRIGHT_CHANNEL=chrome UI_DATA_MODE=mock npx playwright test --config playwright.connection.config.ts`

The dedicated suite covers desktop/mobile (320 and 390 px), both themes, successful connection, HTTP 500/503, retry, closing and Escape, focus containment, network failure, timeout, 401, guest images (all three URLs), account link, authenticated catalog and independent API-error/empty states. HTTP responses are intercepted, so these UI tests do not require MySQL. The full backend integration suite requires a running backend/database.

Results: typecheck and build passed; API suite 32 passed; mock suite 4 passed (28 API-only cases skipped).

Additionally, 2 existing API regression tests passed (api-mode and catalog empty/error state). Total: 38 passed tests across the three runs; 28 intentionally skipped API-only cases in the mock run. The GitHub Vue workflow now explicitly runs both dedicated API and mock suites.
