import { Router } from 'express';
import { db } from '../config/db.js';

export const healthRouter = Router();
healthRouter.get('/health', (_req, res) => res.json({ status: 'ok' }));
healthRouter.get('/ready', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'error' });
  }
});
