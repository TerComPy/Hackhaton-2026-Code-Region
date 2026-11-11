# Backend instructions

Canonical schema revision: 4ce04c4870c43a65fe1f0265f0c75d3f4265c603. Read docs/db/UPSTREAM_ALIGNMENT.md.
Use canonical users and user_profiles FK. All business user_id values refer to
profile BIGINT IDs, serialized as strings. Never invent parallel schema/history.
Keep routes thin, SQL values parameterized, multi-step writes transactional,
Zod validation and consistent error envelopes. Ownership/role come from verified
JWT and DB. Do not conflate format, schedule, employment and contract duration.
Update OpenAPI and docs/qa after API changes. Independent QA owns Python tests;
developers run typecheck, build and meaningful smoke checks.
