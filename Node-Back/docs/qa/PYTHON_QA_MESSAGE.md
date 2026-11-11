# Message to Python QA engineer (prepared, not sent)

Backend targets canonical revision 4ce04c4870c43a65fe1f0265f0c75d3f4265c603. Please use the setup and scenarios
in HANDOFF.md and TEST_REQUIREMENTS.md. JWT now requires token_version; obtain new
tokens via registration/login. Blocked users and stale versions return 401.
New query parameters: regionCode, typicalPosition, codeProfession, specialisation.
Corresponding response fields use snake_case. All IDs are strings, salaries and
skill_match_percent are decimal strings, dates are UTC MySQL strings.
Please cover both users' isolation and archived favorites explicitly. Real SQL
has not yet been exercised here because no test MySQL is available. Your pytest
suite remains independent; no Python suite was implemented in this branch.
