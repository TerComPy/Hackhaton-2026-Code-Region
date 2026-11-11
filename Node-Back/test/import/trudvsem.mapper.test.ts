import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapEmployment, mapSchedule, mapTrudvsemVacancy } from '../../src/modules/import/adapters/trudvsem.mapper.js';
import type { NormalizedVacancy } from '../../src/modules/import/types.js';
import { loadFixture, rawVacancy } from './helpers.js';

function mapOk(raw: unknown): NormalizedVacancy {
  const r = mapTrudvsemVacancy(raw, 0);
  if (!r.ok) assert.fail(`expected ok, got: ${r.rejected.reason}`);
  return r.vacancy;
}

describe('mapTrudvsemVacancy — fixture', () => {
  const raws = loadFixture().results.vacancies.map(x => x.vacancy);
  const mapped = raws.map((r, i) => mapTrudvsemVacancy(r, i));

  it('normalizes every record of the real response', () => {
    assert.equal(mapped.filter(m => m.ok).length, raws.length);
  });

  it('never outputs contact persons, phones or e-mails', () => {
    const out = JSON.stringify(mapped);
    for (const r of raws) {
      for (const needle of [r.contact_person, r.company?.email, ...(r.contact_list ?? []).map((c: any) => c.contact_value)]) {
        if (needle) assert.ok(!out.includes(needle), 'contact data leaked into normalized output');
      }
    }
    assert.ok(!/contact|email|inn|ogrn|kpp/i.test(Object.keys((mapped[0] as any).vacancy).join(',')));
  });

  it('maps the canonical fields of the first record', () => {
    const v = mapOk(raws[0]);
    const r = raws[0]!;
    assert.equal(v.externalId, `${r.company.companycode}:${r.id}`);
    assert.equal(v.company?.externalId, r.company.companycode);
    assert.equal(v.title, r['job-name']);
    assert.equal(v.originalUrl, r.vac_url);
    assert.equal(v.currency, 'RUB');
    assert.equal(v.salaryMin, r.salary_min);
    assert.equal(v.salaryMax, r.salary_max);
    assert.equal(v.salaryPeriod, 'unknown');
    assert.equal(v.salaryGross, null);
    assert.equal(v.countryCode, 'RU');
    assert.equal(v.regionCode, r.region.region_code);
    assert.equal(v.typicalPosition, r.typicalPosition);
    assert.equal(v.specialisation, r.category.specialisation);
    assert.equal(v.experienceMonthsMin, r.requirement.experience * 12);
    assert.match(v.publishedAt ?? '', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.000000$/);
    assert.ok(v.description.includes(r.duty), 'description keeps the full duty text');
  });
});

describe('mapTrudvsemVacancy — rules', () => {
  it('builds external_id as companycode:id and rejects records without them', () => {
    const raw = rawVacancy();
    delete raw.company.companycode;
    const r = mapTrudvsemVacancy(raw, 3);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.rejected.index, 3);
  });

  it('rejects a missing title and a link to a foreign host', () => {
    const a = rawVacancy(); a['job-name'] = '  ';
    const b = rawVacancy(); b.vac_url = 'https://evil.example.com/vacancy/1';
    assert.equal(mapTrudvsemVacancy(a, 0).ok, false);
    assert.equal(mapTrudvsemVacancy(b, 0).ok, false);
  });

  it('scrubs contact data that employers put into free text', () => {
    const raw = rawVacancy();
    raw.contact_person = 'Тестова Анна Петровна';
    raw.duty = 'Работа с документами. Звоните Тестова А.П. по тел. +7 (900) 123-45-67 или пишите boss@example.invalid';
    const v = mapOk(raw);
    for (const field of [v.description, v.responsibilities ?? '']) {
      assert.ok(!/Тестова|123-45-67|example\.invalid/.test(field), field);
      assert.ok(field.includes('Работа с документами'));
    }
  });

  it('does not invent salary: 0 → null, unknown currency → no amounts, min>max keeps min', () => {
    const zero = rawVacancy(); zero.salary_min = 0; zero.salary_max = 0;
    let v = mapOk(zero);
    assert.deepEqual([v.salaryMin, v.salaryMax, v.currency], [null, null, null]);

    const weird = rawVacancy(); weird.currency = 'у.е.';
    v = mapOk(weird);
    assert.deepEqual([v.salaryMin, v.salaryMax, v.currency], [null, null, null]);

    const inverted = rawVacancy(); inverted.salary_min = 50000; inverted.salary_max = 40000;
    v = mapOk(inverted);
    assert.deepEqual([v.salaryMin, v.salaryMax, v.currency], [50000, null, 'RUB']);
  });

  it('keeps unknown experience as null and 0 as "no experience"', () => {
    const none = rawVacancy(); delete none.requirement.experience;
    assert.equal(mapOk(none).experienceMonthsMin, null);
    const zero = rawVacancy(); zero.requirement.experience = 0;
    assert.equal(mapOk(zero).experienceMonthsMin, 0);
    const bad = rawVacancy(); bad.requirement.experience = 'много';
    assert.equal(mapOk(bad).experienceMonthsMin, null);
  });

  it('employment: full time is not a contract type; remote and temporary are explicit', () => {
    assert.deepEqual(mapEmployment('Полная занятость'), { employmentType: 'full_time', workFormat: 'unknown', contractType: 'unknown' });
    assert.deepEqual(mapEmployment('Частичная занятость').employmentType, 'part_time');
    assert.deepEqual(mapEmployment('Дистанционная (удаленная) работа').workFormat, 'remote');
    assert.deepEqual(mapEmployment('Временная работа').contractType, 'fixed_term');
    assert.deepEqual(mapEmployment(null), { employmentType: 'unknown', workFormat: 'unknown', contractType: 'unknown' });
  });

  it('schedule: "Полный рабочий день" does not prove 5/2', () => {
    assert.equal(mapSchedule('Полный рабочий день', null, []), 'unknown');
    assert.equal(mapSchedule('Полный рабочий день', 'график 5/2', []), 'five_two');
    assert.equal(mapSchedule('Сменная работа', null, []), 'shift');
    assert.equal(mapSchedule('Полный рабочий день', null, ['По графику сменности']), 'shift');
    assert.equal(mapSchedule('Режим гибкого рабочего времени', null, []), 'flexible');
    assert.equal(mapSchedule('Ненормированный рабочий день', null, []), 'other');
  });

  it('city is set only for federal cities; coordinates are validated', () => {
    const spb = rawVacancy(); spb.region.region_code = '7800000000000';
    assert.equal(mapOk(spb).city, 'Санкт-Петербург');
    const other = rawVacancy(); other.region.region_code = '6600000000000';
    assert.equal(mapOk(other).city, null);
    const badGeo = rawVacancy(); badGeo.addresses.address[0].lat = '123.4';
    const g = mapOk(badGeo);
    assert.deepEqual([g.latitude, g.longitude], [null, null]);
  });

  it('deduplicates skills and marks the list complete only when the array is present', () => {
    const raw = rawVacancy(); raw.skills = ['Excel', 'excel ', 'Работа в команде'];
    const v = mapOk(raw);
    assert.deepEqual(v.skills, ['Excel', 'Работа в команде']);
    assert.equal(v.skillsComplete, true);
    delete raw.skills;
    assert.equal(mapOk(raw).skillsComplete, false);
  });

  it('keeps code_profession as a string with leading zeros', () => {
    const raw = rawVacancy(); raw.code_profession = '012345';
    assert.equal(mapOk(raw).codeProfession, '012345');
  });

  it('converts timestamps to UTC', () => {
    const raw = rawVacancy(); raw.date_modify = '2026-11-10T13:39:39+0300'; raw['creation-date'] = '2026-11-03';
    const v = mapOk(raw);
    assert.equal(v.sourceUpdatedAt, '2026-11-10 10:39:39.000000');
    assert.equal(v.publishedAt, '2026-11-02 21:00:00.000000');
  });
});
