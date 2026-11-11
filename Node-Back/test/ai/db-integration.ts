/* Run only on an isolated MySQL test database with canonical schema and a seeded active vacancy.
 * From Node-Back/: AI_TEST_VACANCY_ID=4 npm run test:ai:integration
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../../src/config/db.js';
import {
  claimAiJob, currentClaimedVacancy, failAiJob, finishAiJob, getAiSummary,
  queueAiSummary, recoverAiLeases, type AiScope
} from '../../src/modules/ai/repository.js';

const id = process.env.AI_TEST_VACANCY_ID;
if (!id || !/^[1-9][0-9]*$/.test(id)) {
  process.stderr.write('AI_TEST_VACANCY_ID must be an existing active vacancy ID\n');
  process.exitCode = 2;
} else {
  const scope: AiScope = {
    provider: 'test-ai',
    model: 'test-' + randomUUID(),
    version: 'integration-v1'
  };
  try {
    assert.equal((await queueAiSummary(id, scope)).status, 'pending');
    assert.equal((await queueAiSummary(id, scope)).status, 'pending');
    const claimed = await claimAiJob(scope);
    assert.ok(claimed, 'expected a claimed test-only queue entry');
    assert.equal(claimed.vacancyId, id);
    assert.ok(await currentClaimedVacancy(claimed));
    assert.equal((await getAiSummary(id, scope)).status, 'processing');
    const summary = {
      simpleTitle: 'Проверка', whatYouDo: [], requirements: [],
      conditions: [], beginnerFriendly: false
    };
    assert.equal(await finishAiJob(claimed, summary), true);
    assert.equal(await finishAiJob(claimed, summary), false);
    assert.equal((await getAiSummary(id, scope)).display, 'ai');
    assert.equal((await queueAiSummary(id, scope)).status, 'done');
    scope.version = 'integration-v2';
    await queueAiSummary(id, scope);
    const next = await claimAiJob(scope);
    assert.ok(next);
    assert.equal(await failAiJob(next, 'AI_TEST_FAILURE', true), true);
    assert.equal((await getAiSummary(id, scope)).status, 'pending');
    assert.equal(await recoverAiLeases(scope), 0);
    process.stdout.write('AI MySQL integration: passed\n');
  } catch (error) {
    process.stderr.write('AI MySQL integration FAILED: ' +
      (error instanceof Error ? error.name : 'unknown') + '\n');
    process.exitCode = 1;
  } finally {
    await db.execute('DELETE FROM vacancy_ai_summaries WHERE provider=? AND model=?',
      [scope.provider, scope.model]);
    await db.end();
  }
}
