import { env } from '../config/env.js';
import { Router } from 'express';
import { z } from 'zod';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../config/db.js';
import { getProfile } from '../lib/profile.js';
import { HttpError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

const filterSchema = z.object({
  search: z.string().max(255).default(''),
  city: z.string().max(150).optional(),
  regionCode: z.string().max(32).optional(),
  typicalPosition: z.string().max(255).optional(),
  codeProfession: z.string().max(64).optional(),
  specialisation: z.string().max(255).optional(),
  regionName: z.string().max(150).optional(),
  countryCode: z.string().length(2).optional(),
  includeRemote: z.enum(['true', 'false']).default('false'),
  workFormat: z.enum(['onsite','remote','hybrid','unknown']).optional(),
  employmentType: z.enum(['full_time','part_time','internship','unknown']).optional(),
  scheduleType: z.enum(['five_two','six_one','shift','flexible','other','unknown']).optional(),
  contractType: z.enum(['permanent','fixed_term','unknown']).optional(),
  minSalary: z.coerce.number().nonnegative().optional(),
  salaryGross: z.enum(['true','false']).optional(),
  onlyNoExperience: z.enum(['true','false']).default('false'),
  experienceMonths: z.coerce.number().int().nonnegative().optional(),
  requireAllRequired: z.enum(['true','false']).default('false'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
const positiveId = z.string().regex(/^[1-9][0-9]*$/);
function errorForId(value: unknown) { return positiveId.parse(value); }
export const vacanciesRouter = Router();
vacanciesRouter.use(requireAuth);

// External contract is intentionally camelCase; DB columns follow SQL team's snake_case.
vacanciesRouter.get('/', async (req, res) => {
  const f = filterSchema.parse(req.query);
  const p = await getProfile(res.locals.authUserId);
  const filters: string[] = ["v.status = 'active'"];
  if (env.NODE_ENV === 'production') filters.push("s.code <> 'demo'");
  const args: (string | number | null)[] = [p.id];
  function add(sql: string, ...values: (string | number | null)[]) { filters.push(sql); args.push(...values); }
  if (f.search.trim()) add('MATCH(v.title, v.description, v.requirements) AGAINST (? IN NATURAL LANGUAGE MODE) > 0', f.search.trim());
  if (f.city) add("(v.city = ? OR (? = 1 AND v.work_format = 'remote'))", f.city, f.includeRemote === 'true' ? 1 : 0);
  if (f.regionName) add("(v.region_name = ? OR (? = 1 AND v.work_format = 'remote'))", f.regionName, f.includeRemote === 'true' ? 1 : 0);
  if (f.countryCode) add("(v.country_code = ? OR (? = 1 AND v.work_format = 'remote'))", f.countryCode.toUpperCase(), f.includeRemote === 'true' ? 1 : 0);
  if (f.regionCode) add("(v.region_code = ? OR (? = 1 AND v.work_format = 'remote'))", f.regionCode, f.includeRemote === 'true' ? 1 : 0);
  if (f.typicalPosition) add('v.typical_position = ?', f.typicalPosition);
  if (f.codeProfession) add('v.code_profession = ?', f.codeProfession);
  if (f.specialisation) add('v.specialisation = ?', f.specialisation);
  if (f.workFormat) add('v.work_format = ?', f.workFormat);
  if (f.employmentType) add('v.employment_type = ?', f.employmentType);
  if (f.scheduleType) add('v.schedule_type = ?', f.scheduleType);
  if (f.contractType) add('v.contract_type = ?', f.contractType);
  if (f.minSalary !== undefined) add("v.currency = 'RUB' AND v.salary_period = 'month' AND COALESCE(v.salary_max,v.salary_min) >= ?", f.minSalary);
  if (f.salaryGross !== undefined) add('v.salary_gross = ?', f.salaryGross === 'true' ? 1 : 0);
  if (f.onlyNoExperience === 'true') add('v.experience_months_min = 0');
  if (f.experienceMonths !== undefined) add('v.experience_months_min <= ?', f.experienceMonths);
  if (f.requireAllRequired === 'true') add('COALESCE(ss.missing_required_skills,0) = 0');
  const offset = (f.page - 1) * f.pageSize;
  if (!Number.isSafeInteger(offset)) throw new HttpError(400, 'Pagination out of range', 'INVALID_PAGE');
  const hasTextQuery = Boolean(f.search.trim());
  if (hasTextQuery) args.push(f.search.trim());
  const orderByFullText = hasTextQuery
    ? 'MATCH(v.title, v.description, v.requirements) AGAINST (? IN NATURAL LANGUAGE MODE) DESC,'
    : '';
  const sql = `WITH skill_stats AS (
    SELECT vs.vacancy_id, COUNT(*) AS listed_skills,
      SUM(us.skill_id IS NOT NULL) AS matched_skills,
      SUM(vs.is_required = 1 AND us.skill_id IS NULL) AS missing_required_skills
    FROM vacancy_skills vs
    LEFT JOIN user_skills us ON us.skill_id = vs.skill_id AND us.user_id = ?
    GROUP BY vs.vacancy_id
  )
  SELECT v.id, v.title, v.typical_position, v.code_profession, v.specialisation, v.region_code, v.status, c.name AS company_name, v.city, v.region_name,
    v.work_format, v.employment_type, v.schedule_type, v.contract_type,
    v.salary_min, v.salary_max, v.currency, v.salary_period, v.salary_gross,
    v.original_url, v.published_at, s.name AS source_name,
    COALESCE(ss.matched_skills,0) AS matched_skills,
    COALESCE(ss.listed_skills,0) AS listed_skills,
    COALESCE(ss.missing_required_skills,0) AS missing_required_skills,
    ROUND(100.0 * ss.matched_skills / NULLIF(ss.listed_skills,0), 0) AS skill_match_percent
  FROM vacancies v
  JOIN sources s ON s.id = v.source_id
  LEFT JOIN companies c ON c.id = v.company_id
  LEFT JOIN skill_stats ss ON ss.vacancy_id = v.id
  WHERE ${filters.join(' AND ')}
  ORDER BY (skill_match_percent IS NOT NULL) DESC, skill_match_percent DESC,
    ${orderByFullText} v.published_at DESC, v.id DESC LIMIT ? OFFSET ?`;
  const [rows] = await db.query<RowDataPacket[]>(sql, [...args, f.pageSize, offset]);
  res.json({ items: rows, page: f.page, pageSize: f.pageSize });
});
vacanciesRouter.get('/:id', async (req, res) => {
  const id = errorForId(req.params.id);
  const p = await getProfile(res.locals.authUserId);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT v.id, v.source_id, v.external_id, v.company_id, v.title, v.typical_position, v.code_profession, v.specialisation, v.region_code,
      v.description, v.requirements, v.responsibilities, v.original_url,
      v.country_code, v.region_name, v.city, v.address_text, v.work_format,
      v.employment_type, v.schedule_text, v.schedule_type, v.contract_type,
      v.salary_min, v.salary_max, v.currency, v.salary_period, v.salary_gross,
      v.experience_months_min, v.status, v.published_at,
      c.name AS company_name, s.name AS source_name,
      EXISTS(SELECT 1 FROM favorites f WHERE f.user_id = ? AND f.vacancy_id = v.id) AS is_favorite
     FROM vacancies v JOIN sources s ON s.id = v.source_id
     LEFT JOIN companies c ON c.id = v.company_id WHERE v.id = ? ${env.NODE_ENV === 'production' ? "AND s.code <> 'demo'" : ''}`, [p.id, id]);
  if (!rows[0]) throw new HttpError(404, 'Vacancy not found', 'NOT_FOUND');
  const [skills] = await db.execute<RowDataPacket[]>(
    `SELECT sk.id, sk.name, vs.is_required FROM vacancy_skills vs
     JOIN skills sk ON sk.id = vs.skill_id WHERE vs.vacancy_id = ?
     ORDER BY vs.is_required DESC, sk.name`, [id]);
  // EXISTS is a BIGINT expression in mysql2 and arrives as a string. Keep the
  // documented 0/1 flag numeric without converting any IDs or monetary values.
  res.json({ vacancy: { ...rows[0], is_favorite: Number(rows[0].is_favorite) }, skills });
});
vacanciesRouter.post('/:id/outbound-click', async (req, res) => {
  const id = errorForId(req.params.id);
  const p = await getProfile(res.locals.authUserId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO outbound_clicks (user_id,vacancy_id)
       SELECT ?,v.id FROM vacancies v WHERE v.id=? AND v.status='active'`, [p.id, id]);
    if (insert.affectedRows !== 1) {
      throw new HttpError(404, 'Active vacancy not found', 'NOT_FOUND');
    }
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT original_url FROM vacancies WHERE id=? AND status='active'", [id]);
    if (!rows[0]) throw new Error('Vacancy disappeared during click transaction');
    await connection.commit();
    res.json({ originalUrl: rows[0].original_url });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally { connection.release(); }
});
