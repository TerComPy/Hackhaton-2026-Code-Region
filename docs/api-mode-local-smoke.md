# Running Starter locally in API mode (Windows / PowerShell)

The deployed application does NOT connect to a local machine automatically. On your local PC, start the backend and Vite separately. From project root:

Terminal 1:
  cd Node-Back
  npm ci
  npm run typecheck
  npm run db:check
  npm run dev

Verify Node-Back/.env: MYSQL_PORT is the port actually mapped to the running MySQL server (the isolated test instance used 33316); MYSQL_DATABASE and JWT_SECRET must match your environment. PORT defaults to 3000.

Terminal 2:
  cd Frontend
  # In Frontend/.env.local or .env: VITE_DATA_MODE=api
  # Leave VITE_API_URL blank to use Vite's /api proxy.
  npm ci
  npm run dev

Important: restart Vite after editing its .env, as Vite reads environment variables at startup.

Terminal 3 (from project root):
  node scripts/check-api-connection.mjs

Expect HTTP 200 for backend & proxied /health and /ready, and 401 (JSON) for /api/profile without a token.
When this fails, first check whether backend :3000 and MySQL are running. Vite proxy is configured in Frontend/vite.config.ts for 127.0.0.1:3000.

To run AI vacancy summaries, also configure OPENAI_BASE_URL, OPENAI_MODEL and OPENAI_API_KEY and launch a separate Node-Back terminal with npm run ai:worker. Matching requests use the configured LLM directly and do not require ai:worker. Both features fail explicitly if model credentials are absent.

Do not commit .env, API keys, JWT secrets or the local MySQL password. Running local checks from a hosted GitHub runner does not prove access to your own PC.
