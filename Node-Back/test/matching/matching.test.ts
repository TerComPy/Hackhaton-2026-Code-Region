import test from 'node:test';
import assert from 'node:assert/strict';
import { aboutSchema, analyzeAbout, parseMatchingAnalysis, MatchingError } from '../../src/modules/matching/model.js';

const about = 'Я люблю заниматься программированием, делать сайты, общаться с людьми и объяснять сложные вещи.';
const directions = [
  { name: 'Веб-разработчик', what: 'Создавать веб-приложения и интерфейсы.', why: 'Интерес к созданию сайтов помогает попробовать такую работу.', evidence: ['делать сайты'], searchTerms: ['разработчик', 'веб'] },
  { name: 'Специалист поддержки', what: 'Помогать пользователям решать проблемы.', why: 'Тебе нравится объяснять сложные вещи людям.', evidence: ['объяснять сложные вещи'], searchTerms: ['поддержка'] },
  { name: 'Преподаватель', what: 'Объяснять новые темы ученикам.', why: 'Твоё желание общаться с людьми может пригодиться.', evidence: ['общаться с людьми'], searchTerms: ['преподаватель'] }
];
const valid = JSON.stringify({ directions });
const config = { baseUrl: 'http://localhost:1234/v1', apiKey: 'test-only', model: 'fixture' };
const fakeFetch = (content: string, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as typeof fetch;

test('validates story input boundaries', () => {
  assert.equal(aboutSchema.safeParse({ about: 'x'.repeat(39) }).success, false);
  assert.equal(aboutSchema.safeParse({ about: 'x'.repeat(40) }).success, true);
  assert.equal(aboutSchema.safeParse({ about: 'x'.repeat(1501) }).success, false);
});
test('extracts three distinct grounded directions', () => {
  assert.deepEqual(parseMatchingAnalysis(valid, about).directions, directions);
});
test('rejects hallucinated evidence, duplicated directions and invalid search terms', () => {
  const hallucinated = structuredClone(directions);
  hallucinated[0]!.evidence = ['работал 10 лет программистом'];
  assert.throws(() => parseMatchingAnalysis(JSON.stringify({ directions: hallucinated }), about), MatchingError);
  const duplicates = structuredClone(directions);
  duplicates[1]!.name = duplicates[0]!.name;
  assert.throws(() => parseMatchingAnalysis(JSON.stringify({ directions: duplicates }), about), MatchingError);
  const inject = structuredClone(directions);
  inject[0]!.searchTerms = ["%' OR 1=1 --"];
  assert.throws(() => parseMatchingAnalysis(JSON.stringify({ directions: inject }), about), MatchingError);
});
test('rejects malformed response and unexpected fields', () => {
  assert.throws(() => parseMatchingAnalysis('not JSON', about), MatchingError);
  assert.throws(() => parseMatchingAnalysis(JSON.stringify({ directions, extra: true }), about), MatchingError);
});
test('uses a mocked OpenAI-compatible response; never needs live credentials', async () => {
  const generated = await analyzeAbout(about, config, fakeFetch(valid));
  assert.equal(generated.directions.length, 3);
  await assert.rejects(analyzeAbout(about, config, fakeFetch('', 429)),
    (e: unknown) => e instanceof MatchingError && e.status === 503);
});
test('missing model configuration fails closed', async () => {
  await assert.rejects(analyzeAbout(about, { ...config, apiKey: '' }, fakeFetch(valid)),
    (e: unknown) => e instanceof MatchingError && e.code === 'MATCH_AI_UNAVAILABLE');
});
