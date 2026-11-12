import { env } from '../../config/env.js';
import type { RowDataPacket } from 'mysql2';
import { db } from '../../config/db.js';
import type { MatchDirection } from './model.js';

export interface MatchedVacancy extends RowDataPacket {
  id: string;
  title: string;
  company_name: string | null;
  city: string | null;
  source_name: string;
  status: 'active' | 'archived';
  salary_min: string | null;
  salary_max: string | null;
  currency: string | null;
  salary_period: string | null;
  salary_gross: 0 | 1 | null;
  work_format: 'onsite' | 'remote' | 'hybrid' | 'unknown';
  original_url: string;
  published_at: string | null;
}

/** Search only genuine, active MySQL vacancies. Never return demo fixtures as fallback. */
export async function findVacanciesForDirection(direction: MatchDirection): Promise<MatchedVacancy[]> {
  const terms = [...new Set(direction.searchTerms.map(term => term.toLocaleLowerCase('ru-RU').trim()))].slice(0, 4);
  const predicates: string[] = [];
  const args: string[] = [];
  // Escape LIKE wildcard chars; all values are bound parameters.
  for (const term of terms) {
    const pattern = '%' + term.replace(/[!%_]/g, char => '!' + char) + '%';
    predicates.push(
      "(LOWER(v.title) LIKE ? ESCAPE '!' OR LOWER(COALESCE(v.typical_position,'')) LIKE ? ESCAPE '!' " +
      "OR LOWER(COALESCE(v.specialisation,'')) LIKE ? ESCAPE '!')"
    );
    args.push(pattern, pattern, pattern);
  }
  const [rows] = await db.execute<MatchedVacancy[]>(
    'SELECT v.id,v.title,c.name AS company_name,v.city,s.name AS source_name,v.status,' +
    'v.salary_min,v.salary_max,v.currency,v.salary_period,v.salary_gross,v.work_format,' +
    'v.original_url,v.published_at FROM vacancies v ' +
    'JOIN sources s ON s.id=v.source_id LEFT JOIN companies c ON c.id=v.company_id ' +
    (env.NODE_ENV === 'production' ? "WHERE s.code <> 'demo' AND " : "WHERE ") +
    "v.status='active' AND (" + predicates.join(' OR ') + ') ' +
    'ORDER BY v.published_at DESC,v.id DESC LIMIT 6',
    args
  );
  return rows;
}
