# Importer integration

Target canonical DB revision: 4ce04c4870c43a65fe1f0265f0c75d3f4265c603. Shared mysql2 pool is configured for
UTC, string BIGINT/DECIMAL/date values and named placeholders. Catalog selects
 typical_position, code_profession, specialisation and region_code explicitly.
No raw payload/contact fields are exposed.

At inspection, origin contains main and feat/core-auth only; feat/trudvsem-import
and a Git bundle/report were not available in this workspace. Importer code was
not recreated. Once delivered, use a separate integration PR and verify Q01/Q02
upserts, source/company FK, content hash, archival scope and import_runs against
real MySQL 8.4. Claude's claimed dual-schema compatibility is not SQL verification.
