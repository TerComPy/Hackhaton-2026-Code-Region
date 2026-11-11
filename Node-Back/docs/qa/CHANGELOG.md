# API changes ? DB alignment

- Canonical users replaces the removed local authorization adapter.
- JWT now requires token_version and checks active status/current version per request.
  Existing JWTs require login again. Role is read from the database.
- Email is limited to 254 characters; duplicate normalized email returns 409.
- Added regionCode, typicalPosition, codeProfession and specialisation exact filters.
  regionCode honors includeRemote like other location filters.
- Lists/cards/favorites expose the four corresponding snake_case DB fields.
- DECIMAL values remain strings; dates are UTC MySQL strings, not ISO timestamps.
- Active catalog, archived cards/favorites, idempotent favorites and owner isolation retained.
- Refresh rotation/logout remain unimplemented.

## PR #2 real MySQL acceptance (2026-11-11)

- Fixed vacancy card is_favorite: mysql2 EXISTS expression was a BIGINT string,
  contradicting OpenAPI. Explicitly normalize this flag to numeric 0/1 only.
- Confirmed aggregate counters/percent are strings and DECIMAL stays exact.
- Added reproducible isolated real-MySQL developer suite: 118 checks passed.
- Previous Docker/MySQL verification blocker resolved; canonical SQL unchanged.
