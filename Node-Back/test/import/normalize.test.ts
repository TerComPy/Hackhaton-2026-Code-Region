import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_PLACEHOLDER, cleanText, normalizeAmount, normalizeCurrency, normalizeSkills, parseSourceTimestamp, scrubContacts, truncate
} from '../../src/modules/import/normalize.js';

describe('cleanText', () => {
  it('trims, collapses whitespace, strips tags and returns null for empty', () => {
    assert.equal(cleanText('  <p>Мыть&nbsp;посуду</p>\r\n\r\n\r\n<b>и</b>  полы '), 'Мыть посуду\n\nи полы');
    assert.equal(cleanText('   '), null);
    assert.equal(cleanText(null), null);
    assert.equal(cleanText(42), null);
  });
  it('truncate keeps whole characters', () => {
    assert.equal(truncate('абвгд', 3), 'абв');
    assert.equal(truncate('ab', 5), 'ab');
  });
});

describe('scrubContacts', () => {
  it('removes e-mails and Russian phone numbers', () => {
    const out = scrubContacts('Пишите hr.dept@example.invalid или звоните +7 (900) 123-45-67, 8-812-775-05-43, 775-05-43.');
    assert.ok(!/example\.invalid|123-45-67|775-05-43|812/.test(out), out);
    assert.ok(out.includes(CONTACT_PLACEHOLDER));
  });
  it('does not touch salaries, years and ordinary numbers', () => {
    const text = 'Доход 53 100 – 66 380 руб., стаж от 3 лет, 2026 год, смена 12 часов, график 2/2';
    assert.equal(scrubContacts(text), text);
  });
  it('removes the known contact person in common spellings', () => {
    const name = 'Тестова Анна Петровна';
    for (const t of ['Тестова Анна Петровна', 'Тестова А.П.', 'Тестова А. П.', 'А.П. Тестова', 'Анна Петровна', 'Анна Тестова']) {
      const out = scrubContacts(`Обращаться: ${t}, кабинет 5`, [name]);
      assert.ok(!out.includes('Тестова') && !out.includes('Петровна'), `${t} → ${out}`);
    }
  });
  it('does not remove the name inside other words', () => {
    assert.equal(scrubContacts('Анналы истории', ['Тестова Анна Петровна']), 'Анналы истории');
  });
});

describe('normalizeCurrency / normalizeAmount', () => {
  it('maps rouble spellings to RUB and rejects unknown', () => {
    for (const v of ['«руб.»', 'руб.', 'RUR', 'rub', '₽', 'рублей']) assert.equal(normalizeCurrency(v), 'RUB', v);
    assert.equal(normalizeCurrency('у.е.'), null);
    assert.equal(normalizeCurrency(''), null);
    assert.equal(normalizeCurrency(undefined), null);
  });
  it('treats 0, negatives and garbage as missing', () => {
    assert.equal(normalizeAmount(0), null);
    assert.equal(normalizeAmount(-5), null);
    assert.equal(normalizeAmount('abc'), null);
    assert.equal(normalizeAmount('35000'), 35000);
    assert.equal(normalizeAmount(1234.567), 1234.57);
  });
});

describe('parseSourceTimestamp', () => {
  it('converts an offset timestamp to UTC', () => {
    assert.equal(parseSourceTimestamp('2026-11-10T13:39:39+0300'), '2026-11-10 10:39:39.000000');
    assert.equal(parseSourceTimestamp('2026-11-10T13:39:39+03:00'), '2026-11-10 10:39:39.000000');
    assert.equal(parseSourceTimestamp('2026-11-10T13:39:39Z'), '2026-11-10 13:39:39.000000');
  });
  it('treats a bare date as midnight Moscow time', () => {
    assert.equal(parseSourceTimestamp('2026-11-03'), '2026-11-02 21:00:00.000000');
  });
  it('returns null for invalid or ambiguous values', () => {
    for (const v of ['2026-02-31', '10.11.2026', '2026-11-10T13:39:39', '', null]) assert.equal(parseSourceTimestamp(v), null, String(v));
  });
});

describe('normalizeSkills', () => {
  it('deduplicates case-insensitively and drops empty / too long', () => {
    assert.deepEqual(normalizeSkills(['Excel', ' excel ', 'Ёлка', 'елка', '', 'x'.repeat(151), null]), ['Excel', 'Ёлка']);
  });
});
