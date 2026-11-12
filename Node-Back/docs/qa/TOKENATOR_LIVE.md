# Tokenator live integration — 2026-11-12

Configuration inspected without exposing credentials: OPENAI_BASE_URL=https://api.tokenator.top/v1; OPENAI_MODEL=gpt-5.6-luna; API key present. .env was not modified or staged.

Manual live requests (three paid completions total, no retries):
- GET /v1/models: HTTP 200, gpt-5.6-luna listed.
- POST /v1/chat/completions with response_format=json_object: HTTP 200, reported model gpt-5.6-luna, valid JSON.
- Real analyzeAbout adapter: exactly three directions, accepted by existing strict Zod and literal evidence validation. Synthetic input only; story not logged.
- Real generateAiSummary adapter: accepted by existing strict schema and grounding validation using a synthetic vacancy.

No provider compatibility change was needed. Public API contracts unchanged. Added bounded diagnostic fields (event, code, retryability or HTTP status), never provider response bodies, credentials or stories. Existing mock tests remain offline; HTTP 502 added to summary error classification coverage.

Limitations: configured MySQL connection fails with ER_ACCESS_DENIED_ERROR (1045). No credentials, schema or database privileges were changed. Authenticated POST /api/match, POST/GET vacancy summary, queue completion, MySQL persistence and real Vue rendering could not be verified. Adapter success is not an end-to-end API success.

Worker was not started: automatic approval rejected the unbounded queue processor because it could incur additional paid calls. For continuation, repair the configured database credentials/permissions and use an explicitly bounded worker execution. No queue was processed during this audit.

Backend typecheck/build and offline AI/matching tests are run separately; no live calls are included in npm test scripts or CI.
