import { Router } from 'express';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../lib/errors.js';
import { analyzeAbout, aboutSchema, MatchingError } from '../modules/matching/model.js';
import { findVacanciesForDirection } from '../modules/matching/repository.js';

export const matchingRouter = Router();
// Per-account in-memory concurrency/rate guard. The API can later share this via Redis.
const active = new Set<string>();
const lastRequest = new Map<string, number>();
matchingRouter.post('/', requireAuth, async (req, res) => {
  const parsed = aboutSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Write 40–1500 characters about yourself', 'INVALID_ABOUT');
  if (!env.OPENAI_API_KEY.trim() || !env.OPENAI_MODEL.trim())
    throw new HttpError(503, 'AI matching is not configured', 'MATCH_AI_UNAVAILABLE');
  const userId = String(res.locals.authUserId);
  const now = Date.now();
  if (active.has(userId) || now - (lastRequest.get(userId) ?? 0) < 15_000)
    throw new HttpError(429, 'Please wait before requesting another match', 'MATCH_RATE_LIMIT');
  // Bound map growth for long-running instances; user text is never cached here.
  if (lastRequest.size > 10_000) {
    for (const [key, timestamp] of lastRequest) if (now - timestamp > 60_000) lastRequest.delete(key);
  }
  active.add(userId);
  lastRequest.set(userId, now);
  try {
    const { about } = parsed.data;
    const result = await analyzeAbout(about, {
      baseUrl: env.OPENAI_BASE_URL, apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL, timeoutMs: 18_000
    });
    const directions = await Promise.all(result.directions.map(async direction => ({
      name: direction.name,
      what: direction.what,
      why: direction.why,
      evidence: direction.evidence,
      vacancies: await findVacanciesForDirection(direction)
    })));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ directions });
  } catch (error) {
    if (error instanceof MatchingError)
      throw new HttpError(error.status, error.code === 'MATCH_AI_RESPONSE'
        ? 'Model returned an invalid recommendation' : 'AI matching is temporarily unavailable', error.code);
    throw error;
  } finally {
    active.delete(userId);
  }
});
