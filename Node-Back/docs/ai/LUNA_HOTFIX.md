# Luna validation hotfix

Prompt version: starter-simplify-v2. No response-repair requests are added. Schema and grounding failures remain terminal; transient provider retries retain the existing three-attempt cap.

Validation: typecheck/build and AI/import/matching unit suites passed. AI tests use injected fetch mocks, never paid endpoints. Database integration was not run: no explicitly designated disposable database was supplied. Before deployment, run test:ai:integration against isolated canonical MySQL with AI_TEST_VACANCY_ID set; verify pending, processing, done and terminal failed. Public API and queue SQL are unchanged.

Safe reprocessing after deployment:

1. Deploy matching API and worker versions together so both use starter-simplify-v2. Stop the old worker and allow its leases to settle. Do not rewrite old rows or reset attempts globally.
2. Review only the affected vacancy IDs with old UNSUPPORTED_NUMBER or AI_INVALID_SCHEMA failures. Confirm vacancies remain active and inspect their current source facts.
3. Enqueue those IDs through the existing summary POST endpoint under the new scope. The new prompt version creates separate jobs for the current source hash; old failures remain available for audit. Limit the initial batch to the four affected jobs and monitor cost and error codes.
4. Verify pending -> processing -> done/failed and review summaries against source. Investigate terminal failures before any further manual requeue. Do not repeatedly POST failed jobs automatically.

Numeric normalization accepts spaces (including NBSP/narrow NBSP), decimal commas and trailing decimal zeros; it does not equate decimals with concatenated integers or invent schedule/duration values. This numeric membership check cannot establish semantic grounding when a source number is reused with a different meaning; human review remains necessary.
