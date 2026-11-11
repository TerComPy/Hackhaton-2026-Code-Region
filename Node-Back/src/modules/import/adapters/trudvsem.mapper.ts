// "Работа России" (trudvsem.ru) vacancy → NormalizedVacancy.
// Rules come from the DB engineer's SOURCES.md / BACKEND_HANDOFF.md:
// unknown facts stay null/'unknown', nothing is guessed, contacts are dropped.

import {
  cleanText, normalizeAmount, normalizeCurrency, normalizeSkills, parseSourceTimestamp, scrubContacts, truncate
} from '../normalize.js';
import { normalizedVacancySchema, trudvsemVacancySchema, type TrudvsemVacancy } from '../schemas.js';
import type {
  ContractType, EmploymentType, NormalizedVacancy, RejectedRecord, ScheduleType, WorkFormat
} from '../types.js';

export const TRUDVSEM_SOURCE_CODE = 'trudvsem';
const ID_PART = /^[A-Za-z0-9-]{1,120}$/;
/** trudvsem.ru reports dates in Moscow time. */
const SOURCE_UTC_OFFSET = '+03:00';

/** Federal cities: the region IS the city, so the city is known for certain. */
const FEDERAL_CITY_BY_REGION_PREFIX: Record<string, string> = {
  '77': 'Москва',
  '78': 'Санкт-Петербург',
  '92': 'Севастополь'
};

export type MapResult =
  | { ok: true; vacancy: NormalizedVacancy }
  | { ok: false; rejected: RejectedRecord };

function key(value: string | null | undefined): string {
  return (value ?? '').normalize('NFC').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Only explicit employment values are mapped; everything else stays unknown. */
export function mapEmployment(value: string | null | undefined): {
  employmentType: EmploymentType; workFormat: WorkFormat; contractType: ContractType;
} {
  const k = key(value);
  const out = { employmentType: 'unknown' as EmploymentType, workFormat: 'unknown' as WorkFormat, contractType: 'unknown' as ContractType };
  if (k === 'полная занятость') out.employmentType = 'full_time';
  else if (k === 'частичная занятость') out.employmentType = 'part_time';
  else if (k === 'стажировка') out.employmentType = 'internship';
  else if (k.includes('удален') || k.includes('дистанц')) out.workFormat = 'remote';
  // Temporary / seasonal work is by definition a fixed-term contract (ТК РФ, ст. 59).
  else if (k === 'временная работа' || k === 'сезонная работа') out.contractType = 'fixed_term';
  return out;
}

/**
 * Weekly schedule from explicit values only. "Полный рабочий день" is NOT 5/2:
 * it describes the length of the day, not the week, so it stays unknown.
 */
export function mapSchedule(schedule: string | null | undefined, comment: string | null | undefined, shifts: readonly string[]): ScheduleType {
  const c = key(comment);
  if (/(^|[^\d])5\s*\/\s*2([^\d]|$)|пятидневк/.test(c)) return 'five_two';
  if (/(^|[^\d])6\s*\/\s*1([^\d]|$)|шестидневк/.test(c)) return 'six_one';
  const s = key(schedule);
  if (s === 'сменная работа' || s === 'сменный график') return 'shift';
  if (s === 'режим гибкого рабочего времени' || s === 'гибкий график') return 'flexible';
  if (s === 'ненормированный рабочий день' || s === 'вахтовый метод' || s === 'неполный рабочий день') return 'other';
  if (shifts.some(x => key(x).includes('сменност'))) return 'shift';
  return 'unknown';
}

function joinUnique(parts: Array<string | null | undefined>, sep: string): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    const k = key(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.length ? out.join(sep) : null;
}

function coordinate(value: string | number | null | undefined, limit: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return Math.round(n * 1e7) / 1e7;
}

function httpsUrlOnHost(value: string | null | undefined, host: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.hostname !== host && !u.hostname.endsWith(`.${host}`)) return null;
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return null;
  }
}

function reject(index: number, externalId: string | null, reason: string): MapResult {
  return { ok: false, rejected: { index, externalId, reason } };
}

/** Map one raw `results.vacancies[i].vacancy` object. Never throws. */
export function mapTrudvsemVacancy(raw: unknown, index: number): MapResult {
  const parsed = trudvsemVacancySchema.safeParse(raw);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join('.') ?? '';
    return reject(index, null, `raw record failed validation at "${path}"`);
  }
  const v: TrudvsemVacancy = parsed.data;
  const companyCode = v.company?.companycode?.trim() ?? '';
  const vacancyId = v.id.trim();
  if (!ID_PART.test(companyCode) || !ID_PART.test(vacancyId)) {
    return reject(index, null, 'missing or malformed company.companycode / id');
  }
  const externalId = `${companyCode}:${vacancyId}`;

  // Name of the contact person is used only to scrub it from free text.
  const contactNames = v.contact_person ? [v.contact_person] : [];
  const text = (value: string | null | undefined): string | null => {
    const c = cleanText(value);
    return c === null ? null : cleanText(scrubContacts(c, contactNames));
  };

  const title = text(v['job-name']);
  if (!title) return reject(index, externalId, 'missing job-name');

  const originalUrl = httpsUrlOnHost(v.vac_url, 'trudvsem.ru');
  if (!originalUrl) return reject(index, externalId, 'missing or foreign vac_url');

  const responsibilities = text(v.duty);
  const requirements = joinUnique([text(v.requirements), text(v.qualification), text(v.requirement?.qualification)], '\n');
  const education = text(v.requirement?.education);
  const conditionsClass = text(v.conditions);
  const benefits = joinUnique(
    [text(v.benefit), text(v.benefitDetails), text(v.term?.text), text(v.medicalDocuments) && `Медицинские документы: ${text(v.medicalDocuments)}`,
      conditionsClass && `Класс условий труда: ${conditionsClass}`],
    '\n'
  );
  const sections = [
    responsibilities && `Обязанности:\n${responsibilities}`,
    requirements && `Требования:\n${requirements}`,
    education && `Образование: ${education}`,
    benefits && `Условия:\n${benefits}`
  ].filter((s): s is string => Boolean(s));
  const description = sections.length ? sections.join('\n\n') : title;

  // Salary: numeric fields only; the text "от 30000" is not parsed. 0 means "not specified".
  let salaryMin = normalizeAmount(v.salary_min);
  let salaryMax = normalizeAmount(v.salary_max);
  const currency = salaryMin !== null || salaryMax !== null ? normalizeCurrency(v.currency) : null;
  if (currency === null) {
    salaryMin = null;
    salaryMax = null;
  } else if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    salaryMax = null; // inconsistent range: keep the lower bound only, do not invent the other
  }

  // requirement.experience is a whole number of years (0 = explicitly not required).
  const expRaw = v.requirement?.experience;
  const expYears = expRaw === null || expRaw === undefined || expRaw === '' ? NaN : Number(expRaw);
  const experienceMonthsMin = Number.isInteger(expYears) && expYears >= 0 && expYears <= 60 ? expYears * 12 : null;

  const shifts = (v.shift ?? []).map(s => cleanText(s)).filter((s): s is string => s !== null);
  const employment = mapEmployment(v.employment);
  const scheduleText = joinUnique([cleanText(v.schedule), text(v.scheduleTypeComment), ...shifts], '; ');

  const regionCodeRaw = v.region?.region_code === null || v.region?.region_code === undefined ? '' : String(v.region.region_code).trim();
  const regionCode = /^\d{13}$/.test(regionCodeRaw) ? regionCodeRaw : null;
  const city = regionCode ? FEDERAL_CITY_BY_REGION_PREFIX[regionCode.slice(0, 2)] ?? null : null;

  const address = v.addresses?.address?.[0];
  const addressText = text(address?.location);
  let latitude = coordinate(address?.lat, 90);
  let longitude = coordinate(address?.lng, 180);
  if (latitude === null || longitude === null) latitude = longitude = null;

  const codeProfessionRaw = v.code_profession === null || v.code_profession === undefined ? '' : String(v.code_profession).trim();

  const companyName = cleanText(v.company?.name);
  const companyUrl = httpsUrlOnHost(v.company?.url, 'trudvsem.ru');

  const candidate: NormalizedVacancy = {
    sourceCode: TRUDVSEM_SOURCE_CODE,
    externalId,
    company: companyName
      ? { externalId: companyCode, name: truncate(companyName.replace(/\n/g, ' '), 255), originalUrl: companyUrl }
      : null,
    title: truncate(title.replace(/\n/g, ' '), 255),
    description,
    requirements,
    responsibilities,
    originalUrl,
    countryCode: 'RU',
    regionName: v.region?.name ? truncate(cleanText(v.region.name) ?? '', 150) || null : null,
    city,
    addressText: addressText ? truncate(addressText.replace(/\n/g, ' '), 500) : null,
    workFormat: employment.workFormat,
    employmentType: employment.employmentType,
    scheduleText,
    scheduleType: mapSchedule(v.schedule, v.scheduleTypeComment, shifts),
    contractType: employment.contractType,
    salaryMin,
    salaryMax,
    currency,
    salaryPeriod: 'unknown', // the API has no explicit pay period field
    salaryGross: null, // before/after tax is not stated by the API
    experienceMonthsMin,
    status: 'active',
    publishedAt: parseSourceTimestamp(v['creation-date'], SOURCE_UTC_OFFSET),
    sourceUpdatedAt: parseSourceTimestamp(v.date_modify, SOURCE_UTC_OFFSET),
    typicalPosition: (() => { const t = cleanText(v.typicalPosition); return t ? truncate(t, 255) : null; })(),
    codeProfession: /^[\x21-\x7E]{1,64}$/.test(codeProfessionRaw) ? codeProfessionRaw : null,
    specialisation: (() => { const t = cleanText(v.category?.specialisation); return t ? truncate(t, 255) : null; })(),
    regionCode,
    latitude,
    longitude,
    skills: normalizeSkills(v.skills ?? []),
    // The search response carries the card's whole skills array (possibly empty).
    skillsComplete: Array.isArray(v.skills)
  };

  const checked = normalizedVacancySchema.safeParse(candidate);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return reject(index, externalId, `normalized record invalid at "${issue?.path.join('.') ?? ''}": ${issue?.message ?? ''}`);
  }
  return { ok: true, vacancy: candidate };
}
