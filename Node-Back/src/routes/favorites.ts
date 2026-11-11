import { Router } from 'express';
import { z } from 'zod';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../config/db.js';
import { getProfile } from '../lib/profile.js';
import { HttpError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const favoritesRouter = Router();
favoritesRouter.use(requireAuth);
const idSchema = z.string().regex(/^[1-9][0-9]*$/);
favoritesRouter.get('/', async (req, res) => {
  const pagination = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
  }).parse(req.query);
  const offset = (pagination.page - 1) * pagination.pageSize;
  if (!Number.isSafeInteger(offset)) throw new HttpError(400, 'Pagination out of range', 'INVALID_PAGE');
  const p = await getProfile(res.locals.authUserId);
  const [items] = await db.query<RowDataPacket[]>(
    `SELECT v.id,v.title,v.typical_position,v.code_profession,v.specialisation,v.region_code,v.city,v.salary_min,v.salary_max,v.currency,v.salary_period,
      v.status,v.original_url,c.name AS company_name,f.created_at AS saved_at
     FROM favorites f JOIN vacancies v ON v.id=f.vacancy_id
     LEFT JOIN companies c ON c.id=v.company_id WHERE f.user_id=?
     ORDER BY f.created_at DESC,v.id DESC LIMIT ? OFFSET ?`, [p.id,pagination.pageSize,offset]);
  res.json({ items, page: pagination.page, pageSize: pagination.pageSize });
});
favoritesRouter.put('/:vacancyId', async (req, res) => {
  const id = idSchema.parse(req.params.vacancyId);
  const p = await getProfile(res.locals.authUserId);
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO favorites (user_id,vacancy_id)
     SELECT ?,v.id FROM vacancies v WHERE v.id=? AND v.status='active'
     ON DUPLICATE KEY UPDATE created_at=favorites.created_at`, [p.id,id]);
  if (result.affectedRows === 0) {
    // no-op on duplicates may also return 0: check existence before responding 404.
    const [exists] = await db.execute<RowDataPacket[]>(
      'SELECT 1 FROM favorites WHERE user_id=? AND vacancy_id=? LIMIT 1', [p.id,id]);
    if (!exists[0]) throw new HttpError(404, 'Active vacancy not found', 'NOT_FOUND');
  }
  res.status(204).end();
});
favoritesRouter.delete('/:vacancyId', async (req, res) => {
  const id = idSchema.parse(req.params.vacancyId);
  const p = await getProfile(res.locals.authUserId);
  await db.execute('DELETE FROM favorites WHERE user_id=? AND vacancy_id=?', [p.id,id]);
  res.status(204).end();
});
