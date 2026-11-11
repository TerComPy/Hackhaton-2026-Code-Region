import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/db.js';
import { getProfile } from '../lib/profile.js';
import { requireAuth } from '../middleware/auth.js';

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(150).optional(),
  city: z.string().trim().min(1).max(150).nullable().optional()
}).strict().refine(obj => Object.keys(obj).length > 0, 'At least one field is required');
export const profileRouter = Router();
profileRouter.use(requireAuth);
profileRouter.get('/', async (_req, res) => {
  const p = await getProfile(res.locals.authUserId);
  res.json({ profile: { id: String(p.id), displayName: p.display_name, city: p.city } });
});
profileRouter.patch('/', async (req, res) => {
  const data = patchSchema.parse(req.body);
  const p = await getProfile(res.locals.authUserId);
  await db.execute('UPDATE user_profiles SET display_name = ?, city = ? WHERE id = ?',
    [data.displayName ?? p.display_name, data.city === undefined ? p.city : data.city, p.id]);
  const changed = await getProfile(res.locals.authUserId);
  res.json({ profile: { id: String(changed.id), displayName: changed.display_name, city: changed.city } });
});
