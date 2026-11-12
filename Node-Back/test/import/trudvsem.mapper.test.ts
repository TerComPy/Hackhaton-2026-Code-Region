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

describe('mapTrudvsemVacancy вЂ” fixture', () => {
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

describe('mapTrudvsemVacancy вЂ” rules', () => {
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
    raw.contact_person = 'РўРµСЃС‚РѕРІР° РђРЅРЅР° РџРµС‚СЂРѕРІРЅР°';
    raw.duty = 'Р Р°Р±РѕС‚Р° СЃ РґРѕРєСѓРјРµРЅС‚Р°РјРё. Р—РІРѕРЅРёС‚Рµ РўРµСЃС‚РѕРІР° Рђ.Рџ. РїРѕ С‚РµР». +7 (900) 123-45-67 РёР»Рё РїРёС€РёС‚Рµ boss@example.invalid';
    const v = mapOk(raw);
    for (const field of [v.description, v.responsibilities ?? '']) {
      assert.ok(!/РўРµСЃС‚РѕРІР°|123-45-67|example\.invalid/.test(field), field);
      assert.ok(field.includes('Р Р°Р±РѕС‚Р° СЃ РґРѕРєСѓРјРµРЅС‚Р°РјРё'));
    }
  });

  it('does not invent salary: 0 в†’ null, unknown currency в†’ no amounts, min>max keeps min', () => {
    const zero = rawVacancy(); zero.salary_min = 0; zero.salary_max = 0;
    let v = mapOk(zero);
    assert.deepEqual([v.salaryMin, v.salaryMax, v.currency], [null, null, null]);

    const weird = rawVacancy(); weird.currency = 'Сѓ.Рµ.';
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
    const bad = rawVacancy(); bad.requirement.experience = 'РјРЅРѕРіРѕ';
    assert.equal(mapOk(bad).experienceMonthsMin, null);
  });

  it('employment: full time is not a contract type; remote and temporary are explicit', () => {
    assert.deepEqual(mapEmployment('РџРѕР»РЅР°СЏ Р·Р°РЅСЏС‚РѕСЃС‚СЊ'), { employmentType: 'full_time', workFormat: 'unknown', contractType: 'unknown' });
    assert.deepEqual(mapEmployment('Р§Р°СЃС‚РёС‡РЅР°СЏ Р·Р°РЅСЏС‚РѕСЃС‚СЊ').employmentType, 'part_time');
    assert.deepEqual(mapEmployment('Р”РёСЃС‚Р°РЅС†РёРѕРЅРЅР°СЏ (СѓРґР°Р»РµРЅРЅР°СЏ) СЂР°Р±РѕС‚Р°').workFormat, 'remote');
    assert.deepEqual(mapEmployment('Р’СЂРµРјРµРЅРЅР°СЏ СЂР°Р±РѕС‚Р°').contractType, 'fixed_term');
    assert.deepEqual(mapEmployment(null), { employmentType: 'unknown', workFormat: 'unknown', contractType: 'unknown' });
  });

  it('schedule: "РџРѕР»РЅС‹Р№ СЂР°Р±РѕС‡РёР№ РґРµРЅСЊ" does not prove 5/2', () => {
    assert.equal(mapSchedule('РџРѕР»РЅС‹Р№ СЂР°Р±РѕС‡РёР№ РґРµРЅСЊ', null, []), 'unknown');
    assert.equal(mapSchedule('РџРѕР»РЅС‹Р№ СЂР°Р±РѕС‡РёР№ РґРµРЅСЊ', 'РіСЂР°С„РёРє 5/2', []), 'five_two');
    assert.equal(mapSchedule('РЎРјРµРЅРЅР°СЏ СЂР°Р±РѕС‚Р°', null, []), 'shift');
    assert.equal(mapSchedule('РџРѕР»РЅС‹Р№ СЂР°Р±РѕС‡РёР№ РґРµРЅСЊ', null, ['РџРѕ РіСЂР°С„РёРєСѓ СЃРјРµРЅРЅРѕСЃС‚Рё']), 'shift');
    assert.equal(mapSchedule('Р РµР¶РёРј РіРёР±РєРѕРіРѕ СЂР°Р±РѕС‡РµРіРѕ РІСЂРµРјРµРЅРё', null, []), 'flexible');
    assert.equal(mapSchedule('РќРµРЅРѕСЂРјРёСЂРѕРІР°РЅРЅС‹Р№ СЂР°Р±РѕС‡РёР№ РґРµРЅСЊ', null, []), 'other');
  });

  it('city is set only for federal cities; coordinates are validated', () => {
    const spb = rawVacancy(); spb.region.region_code = '7800000000000';
    assert.equal(mapOk(spb).city, 'РЎР°РЅРєС‚-РџРµС‚РµСЂР±СѓСЂРі');
    const other = rawVacancy(); other.region.region_code = '6600000000000';
    assert.equal(mapOk(other).city, null);
    const badGeo = rawVacancy(); badGeo.addresses.address[0].lat = '123.4';
    const g = mapOk(badGeo);
    assert.deepEqual([g.latitude, g.longitude], [null, null]);
  });

  it('deduplicates skills and marks the list complete only when the array is present', () => {
    const raw = rawVacancy(); raw.skills = ['Excel', 'excel ', 'Р Р°Р±РѕС‚Р° РІ РєРѕРјР°РЅРґРµ'];
    const v = mapOk(raw);
    assert.deepEqual(v.skills, ['Excel', 'Р Р°Р±РѕС‚Р° РІ РєРѕРјР°РЅРґРµ']);
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


describe('contact scrubbing across public text columns', () => {
  it('scrubs contacts from schedule, shifts, company, position, region, specialisation and skills', () => {
    const raw = rawVacancy();
    const canary = 'private-canary@example.invalid';
    const phone = '+7 (900) 123-45-67';
    const privateText = `${canary} ${phone} ${raw.contact_person}`;
    for (const field of ['duty', 'schedule', 'typicalPosition']) raw[field] = `QA ${privateText}`;
    raw.shift = [`QA ${privateText}`];
    raw.company.name = `Company ${privateText}`;
    raw.region.name = `Region ${privateText}`;
    raw.category = { specialisation: `Category ${privateText}` };
    raw.skills = [`QA ${privateText}`];
    const out = JSON.stringify(mapOk(raw));
    for (const contact of [canary, phone, raw.contact_person]) assert.ok(!out.includes(contact));
  });
});

it('preserves Russian titles and descriptions without transcoding', () => {
  const raw = rawVacancy();
  raw['job-name'] = '???????-??????????? ??';
  raw.duty = 'Разработка';
  const vacancy = mapOk(JSON.parse(JSON.stringify(raw)));
  assert.equal(vacancy.title, raw['job-name']);
  assert.ok(vacancy.description.includes(raw.duty));
});
