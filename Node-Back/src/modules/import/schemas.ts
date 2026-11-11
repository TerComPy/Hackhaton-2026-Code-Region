import { z } from 'zod';
import {
  CONTRACT_TYPES, EMPLOYMENT_TYPES, SALARY_PERIODS, SCHEDULE_TYPES, VACANCY_STATUSES, WORK_FORMATS
} from './types.js';

// ---------------------------------------------------------------------------
// Raw "Работа России" response. Only allow-listed fields are declared: z.object
// strips every other key, so contact_list / contact_person / company.email and
// any unexpected payload never reach the mapper.
// ---------------------------------------------------------------------------

const str = z.string().nullish();
const strOrNum = z.union([z.string(), z.number()]).nullish();

export const trudvsemEnvelopeSchema = z.object({
  status: z.union([z.string(), z.number()]),
  meta: z
    .object({
      total: strOrNum,
      limit: strOrNum,
      error: str
    })
    .nullish(),
  results: z
    .object({
      vacancies: z.array(z.object({ vacancy: z.unknown() })).nullish()
    })
    .nullish()
});

export const trudvsemVacancySchema = z.object({
  id: z.string().min(1),
  source: str,
  region: z.object({ region_code: strOrNum, name: str }).nullish(),
  company: z
    .object({
      companycode: str,
      name: str,
      url: str
    })
    .nullish(),
  'creation-date': str,
  date_modify: str,
  salary_min: strOrNum,
  salary_max: strOrNum,
  currency: str,
  'job-name': str,
  vac_url: str,
  employment: str,
  schedule: str,
  scheduleTypeComment: str,
  shift: z.array(z.string()).nullish(),
  duty: str,
  requirements: str,
  qualification: str,
  category: z.object({ specialisation: str }).nullish(),
  requirement: z
    .object({
      education: str,
      qualification: str,
      experience: strOrNum
    })
    .nullish(),
  addresses: z
    .object({
      address: z.array(z.object({ location: str, lat: strOrNum, lng: strOrNum })).nullish()
    })
    .nullish(),
  skills: z.array(z.string()).nullish(),
  typicalPosition: str,
  code_profession: strOrNum,
  conditions: str,
  benefit: str,
  benefitDetails: str,
  term: z.object({ text: str }).nullish(),
  medicalDocuments: str,
  // Read ONLY to remove the contact person's name from free text; never stored.
  contact_person: str
});

export type TrudvsemEnvelope = z.infer<typeof trudvsemEnvelopeSchema>;
export type TrudvsemVacancy = z.infer<typeof trudvsemVacancySchema>;

// ---------------------------------------------------------------------------
// Normalized vacancy: final gate before the database. Mirrors DB constraints.
// ---------------------------------------------------------------------------

const mysqlUtc = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/);
const httpUrl = z
  .string()
  .max(2048)
  .refine(v => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must be an absolute http(s) URL');
const amount = z.number().positive().max(9_999_999_999.99).nullable();
const noContacts = (v: string | null) => v === null || !/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.[\p{L}]/u.test(v);

export const normalizedVacancySchema = z
  .object({
    sourceCode: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    externalId: z.string().min(1).max(255),
    company: z
      .object({
        externalId: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        originalUrl: httpUrl.nullable()
      })
      .nullable(),
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(16_000_000).refine(noContacts, 'contains an e-mail address'),
    requirements: z.string().max(65_535).nullable().refine(noContacts, 'contains an e-mail address'),
    responsibilities: z.string().max(65_535).nullable().refine(noContacts, 'contains an e-mail address'),
    originalUrl: httpUrl,
    countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
    regionName: z.string().min(1).max(150).nullable(),
    city: z.string().min(1).max(150).nullable(),
    addressText: z.string().min(1).max(500).nullable(),
    workFormat: z.enum(WORK_FORMATS),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    scheduleText: z.string().max(65_535).nullable(),
    scheduleType: z.enum(SCHEDULE_TYPES),
    contractType: z.enum(CONTRACT_TYPES),
    salaryMin: amount,
    salaryMax: amount,
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    salaryPeriod: z.enum(SALARY_PERIODS),
    salaryGross: z.boolean().nullable(),
    experienceMonthsMin: z.number().int().min(0).max(65_535).nullable(),
    status: z.enum(VACANCY_STATUSES),
    publishedAt: mysqlUtc.nullable(),
    sourceUpdatedAt: mysqlUtc.nullable(),
    typicalPosition: z.string().min(1).max(255).nullable(),
    codeProfession: z.string().regex(/^[\x21-\x7E]{1,64}$/).nullable(),
    specialisation: z.string().min(1).max(255).nullable(),
    regionCode: z.string().regex(/^[\x21-\x7E]{1,32}$/).nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    skills: z.array(z.string().min(1).max(150)),
    skillsComplete: z.boolean()
  })
  .refine(v => v.salaryMin === null || v.salaryMax === null || v.salaryMin <= v.salaryMax, {
    message: 'salaryMin must not exceed salaryMax',
    path: ['salaryMax']
  })
  .refine(v => (v.salaryMin === null && v.salaryMax === null) || v.currency !== null, {
    message: 'currency is required when an amount is present',
    path: ['currency']
  });
