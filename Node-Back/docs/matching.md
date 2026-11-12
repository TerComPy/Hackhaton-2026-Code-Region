# Personal Matching — Stage 7

\`POST /api/match\` requires Bearer JWT and \`{"about":"..."}\` (40–1500 chars).
Results contain **three AI-generated professional directions** with exact quotes from the supplied text, plus **0–6 real active MySQL vacancies for each direction**.

No new MySQL tables or migrations are required. The input is kept in memory for the request and sent to the configured OpenAI-compatible provider; STARTER does not persist it. Provider retention policies may differ. The data is not secretly replaced by demo fixtures. AI recommendations are exploratory, not guarantees of employment or suitability.

To enable: set \`OPENAI_BASE_URL\`, \`OPENAI_MODEL\`, \`OPENAI_API_KEY\` in \`Node-Back/.env\`. The separate vacancy-summary worker from 6A isn't needed for the matching request itself.

Responses: 200 with \`directions\`; 400 invalid input; 401 auth; 429 per-account rate guard (15s in memory); 502 invalid AI JSON or invented citations; 503 missing/unavailable provider. HTTP request may take up to 18 seconds at the AI provider; frontend timeout is 25 seconds.

Each direction's \`searchTerms\` are validated and bound into SQL parameters. MySQL matches terms against real job titles, typical positions, and specialties; a zero-match direction is shown with an honest empty message. BIGINT IDs and DECIMAL salaries remain strings. No source text, provider responses, tokens, or credentials are logged by the matching module.

**Scope:** This MVP does not persist stories, train a recommendation model, or rank the entire jobs database semantically. In-memory rate limiting is per-process, not suitable as the only production quota control. Implement centralized quotas before public deployment.

## Startup smoke check (PowerShell)

In one terminal from \`Node-Back\` (ensure \`.env\` contains your actual MySQL details, e.g. port 33316):

    npm ci
    npm run typecheck
    npm run db:check
    npm run dev

In a second terminal from \`Frontend\`:

    # Frontend/.env.local: VITE_DATA_MODE=api
    npm ci
    npm run dev

Then from a third terminal at the repository root:

    node scripts/check-api-connection.mjs

The script checks the backend health/ready endpoints **through the Vite proxy** and asserts an unauthenticated profile request gets 401. It never mutates data or requires login. Network tests from ChatGPT cannot see your local MySQL/Express processes.

Run local unit tests: \`cd Node-Back && npm run test:match\`. Browser API-mode tests use mock HTTP fixtures to stay deterministic.
