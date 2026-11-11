# Message to Python QA engineer (prepared, not sent)

Backend targets canonical revision 4ce04c4870c43a65fe1f0265f0c75d3f4265c603. Please use the setup and scenarios
in HANDOFF.md and TEST_REQUIREMENTS.md. JWT now requires token_version; obtain new
tokens via registration/login. Blocked users and stale versions return 401.
New query parameters: regionCode, typicalPosition, codeProfession, specialisation.
Corresponding response fields use snake_case. All IDs are strings, salaries and
skill_match_percent are decimal strings, dates are UTC MySQL strings.
Please cover both users' isolation and archived favorites explicitly. Real SQL passed 118 developer integration checks on MySQL 8.4.13; see
INTEGRATION_ACCEPTANCE.md for reproduction and precise coverage. Your pytest
suite remains independent; no Python suite was implemented in this branch.

Card is_favorite is now a numeric 0/1 flag (mysql2 EXISTS string normalized).
UTC strings may include fractional seconds on lists and omit them on cards.
