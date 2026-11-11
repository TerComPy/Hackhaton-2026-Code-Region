// Source-independent normalization helpers. Pure functions, no I/O.

const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&laquo;': '«', '&raquo;': '»'
};

/** Trim, unify whitespace, drop HTML tags and control characters. Empty → null. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let s = value.normalize('NFC');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(HTML_TAG, ' ');
  s = s.replace(/&[a-z#0-9]+;/gi, m => HTML_ENTITIES[m.toLowerCase()] ?? m);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  return s.length > 0 ? s : null;
}

/** Cut to `max` code points without splitting a surrogate pair. */
export function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('').trimEnd();
}

export const CONTACT_PLACEHOLDER = '(контакты — на сайте источника)';

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Russian phone numbers: +7/8 followed by 10 digits with optional separators.
const PHONE_RU = /(?:\+\s*7|(?<![\p{N}])8)[\s\-‒–—.(]*\d{3}[\s\-‒–—.)]*\d{3}[\s\-‒–—.]*\d{2}[\s\-‒–—.]*\d{2}(?![\p{N}])/gu;
// Local numbers written with dashes, e.g. 775-05-43 (spaces are not used to avoid matching salaries).
const PHONE_LOCAL = /(?<![\p{N}-])\d{2,3}-\d{2}-\d{2}(?![\p{N}-])/gu;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex sources for the ways a Russian full name "Surname Name Patronymic" appears in text:
 * full name, "Surname N.P.", "N.P. Surname", "Name Patronymic", "Surname Name", "Name Surname".
 * Longest variants come first so they are replaced before their parts.
 */
function namePatterns(fullName: string): string[] {
  const parts = fullName.trim().split(/\s+/).filter(p => Array.from(p).length >= 2);
  if (parts.length === 0) return [];
  const e = parts.map(escapeRegExp);
  const sp = '\\s+';
  if (parts.length === 1) return [e[0]!];
  const [surname, name, patronymic] = e;
  const initials = parts.slice(1).map(p => `${escapeRegExp(Array.from(p)[0]!)}\\.`).join('\\s*');
  const out = [e.join(sp), `${surname}${sp}${initials}`, `${initials}\\s*${surname}`];
  if (patronymic) out.push(`${name}${sp}${patronymic}`);
  out.push(`${surname}${sp}${name}`, `${name}${sp}${surname}`);
  return out;
}

/**
 * Remove contact data from free text before it is stored: e-mails, phone numbers
 * and the name of the contact person (full name, "Surname N.N." and "Surname Name").
 * `knownNames` are names the source reported as contact persons for this record.
 */
export function scrubContacts(text: string, knownNames: readonly string[] = []): string {
  let s = text.replace(EMAIL, CONTACT_PLACEHOLDER).replace(PHONE_RU, CONTACT_PLACEHOLDER).replace(PHONE_LOCAL, CONTACT_PLACEHOLDER);
  for (const raw of knownNames) {
    for (const pattern of namePatterns(raw)) {
      s = s.replace(new RegExp(`(?<![\\p{L}])${pattern}(?![\\p{L}])`, 'giu'), CONTACT_PLACEHOLDER);
    }
  }
  // Collapse repeated placeholders produced by adjacent matches.
  const p = escapeRegExp(CONTACT_PLACEHOLDER);
  s = s.replace(new RegExp(`${p}(?:[\\s,;:]*${p})+`, 'g'), CONTACT_PLACEHOLDER);
  return s;
}

/** Recognized spellings of the Russian rouble → RUB; otherwise an ISO code as-is; unknown → null. */
export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.normalize('NFC').toLowerCase().replace(/[«»"'.\s]/g, '');
  if (s === '') return null;
  if (['руб', 'рубль', 'рубля', 'рублей', 'рубли', 'р', 'rub', 'rur', '₽'].includes(s)) return 'RUB';
  if (/^[a-z]{3}$/.test(s) && ['usd', 'eur', 'kzt', 'byn', 'uah', 'cny'].includes(s)) return s.toUpperCase();
  return null;
}

/** Positive finite amount ≤ DECIMAL(12,2) max, rounded to 2 decimals; anything else → null. */
export function normalizeAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 9_999_999_999.99) return null;
  return Math.round(n * 100) / 100;
}

/** Skill key used for de-duplication (and as skills.normalized_name). */
export function normalizeSkillName(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Clean, drop empty/too long, deduplicate by normalized name; keeps first spelling. */
export function normalizeSkills(values: readonly unknown[], maxLength = 150): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const name = cleanText(v)?.replace(/\n/g, ' ');
    if (!name || Array.from(name).length > maxLength) continue;
    const key = normalizeSkillName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Date → `YYYY-MM-DD HH:MM:SS.ffffff` in UTC (MySQL DATETIME(6), session time_zone +00:00). */
export function toMysqlUtc(date: Date): string {
  return `${date.toISOString().replace('T', ' ').replace('Z', '')}000`;
}

/**
 * Parse a source timestamp to UTC.
 * - ISO with offset (`2026-11-10T13:39:39+0300` / `+03:00` / `Z`) → exact instant.
 * - Date only (`2026-11-10`) → midnight in `dateOnlyOffset` (source local time).
 * Anything else → null (never guessed).
 */
export function parseSourceTimestamp(value: unknown, dateOnlyOffset = '+03:00'): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let iso: string | null = null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    iso = `${s}T00:00:00${dateOnlyOffset}`;
  } else {
    const full = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)(Z|[+-]\d{2}:?\d{2})$/.exec(s);
    if (full) {
      const [, d, t, zone] = full;
      const z = zone === 'Z' ? 'Z' : `${zone!.slice(0, 3)}:${zone!.slice(-2)}`;
      iso = `${d}T${t}${z}`;
    }
  }
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const date = new Date(ms);
  // Reject impossible calendar dates silently rolled over by Date (e.g. 2026-02-31).
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const check = new Date(Date.UTC(y!, m! - 1, d!));
  if (check.getUTCMonth() !== m! - 1 || check.getUTCDate() !== d!) return null;
  return toMysqlUtc(date);
}
