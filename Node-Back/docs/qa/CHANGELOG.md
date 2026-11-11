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
