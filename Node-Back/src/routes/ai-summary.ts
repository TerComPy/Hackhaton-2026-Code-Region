import { Router } from 'express';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../lib/errors.js';
import { getAiSummary, queueAiSummary, scopeFor } from '../modules/ai/repository.js';

export const aiSummaryRouter = Router();

aiSummaryRouter.get('/:id/summary', requireAuth, async (req, res) => {
  const model = env.OPENAI_MODEL.trim();
  const scope = model ? scopeFor(model) : null;
  res.json(await getAiSummary(String(req.params.id), scope));
});

aiSummaryRouter.post('/:id/summary', requireAuth, async (req, res) => {
  if (!/^[1-9][0-9]*$/.test(String(req.params.id)))
    throw new HttpError(400, 'Invalid vacancy ID', 'INVALID_ID');
  if (!env.OPENAI_MODEL.trim() || !env.OPENAI_API_KEY.trim())
    throw new HttpError(503, 'AI summarization is not configured', 'AI_NOT_CONFIGURED');
  const status = await queueAiSummary(String(req.params.id), scopeFor(env.OPENAI_MODEL.trim()));
  res.status(status.status === 'done' ? 200 : 202).json(status);
});
