/*
 * Стартер — логика интерфейса: каталог, фильтры, избранное,
 * карточка вакансии, подбор профессии, тема и маршрутизация.
 */
(() => {
  const {jobs: CATALOG, sources: SOURCES, directions: DIRECTIONS, preferences: PREFERENCES, examples: EXAMPLES} = window.STARTER_DATA;
  const Scene = window.StarterScene;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Утилиты ---------- */
  const store = {
    get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (_) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  };
  const norm = s => String(s).toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const money = new Intl.NumberFormat('ru-RU');
  const salaryText = job => job.salary ? `${money.format(job.salary[0])} – ${money.format(job.salary[1])} ₽` : 'Зарплата не указана';
  const salaryShort = job => job.salary ? `от ${money.format(job.salary[0])} ₽` : 'зарплата не указана';
  const plural = (n, forms) => {
    const a = Math.abs(n) % 100, b = a % 10;
    return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b > 1 && b < 5 ? 1 : 2];
  };
  const photo = (id, w, h, focus) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}${h ? `&h=${h}` : ''}${focus ? `&crop=focalpoint&fp-x=${focus[0]}&fp-y=${focus[1]}` : ''}&q=70`;
  // Кадрирует фото вакансии по точке фокуса, чтобы человек не обрезался краем кадра.
  const jobPhoto = (job, w, h) => photo(job.photo, w, h, job.focus);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  };
  const icon = id => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id); svg.append(use);
    return svg;
  };

  /* ---------- Состояние ---------- */
  const state = {
    jobs: [],
    status: 'loading',
    filters: {q: '', city: '', formats: new Set(), noExp: false, salary: 0, sources: new Set()},
    sort: 'date',
    saved: new Set((store.get('starter.saved', []) || []).filter(Number.isInteger)),
    about: String(store.get('starter.about', '') || ''),
    analysis: null
  };

  /* Имитирует запрос к API агрегатора. В рабочей версии — fetch('/api/vacancies'). */
  function fetchJobs() {
    return new Promise(resolve => setTimeout(() => resolve(CATALOG), 450));
  }

  /* ---------- Тема ---------- */
  const themeBtn = $('#theme-toggle');
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : systemDark.matches;
  }
  function syncTheme() {
    const dark = isDark();
    themeBtn.setAttribute('aria-pressed', String(dark));
    themeBtn.setAttribute('aria-label', dark ? 'Светлая тема' : 'Тёмная тема');
    $('meta[name="theme-color"]').content = dark ? '#121211' : '#F1EFEA';
  }
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('starter.theme', next);
    syncTheme();
  });
  systemDark.addEventListener('change', syncTheme);
  syncTheme();

  /* ---------- Шапка ---------- */
  const topbar = $('#topbar');
  const onScroll = () => topbar.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, {passive: true});
  onScroll();

  /* ---------- Избранное ---------- */
  function toggleSaved(id) {
    if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
    store.set('starter.saved', [...state.saved]);
    syncSaved(true);
  }
  function syncSaved(bump) {
    const count = $('#saved-count');
    count.textContent = state.saved.size;
    if (bump && !reduced.matches) { count.classList.remove('is-bumped'); void count.offsetWidth; count.classList.add('is-bumped'); }
    $$('.save[data-id]').forEach(b => {
      const on = state.saved.has(+b.dataset.id);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? `Убрать из избранного: ${b.dataset.title}` : `Сохранить в избранное: ${b.dataset.title}`);
    });
    if (route === 'saved') renderSaved();
    if (route === 'account') renderAccount();
  }
  function saveButton(job, cls = '') {
    return el('button', {
      type: 'button', class: `icon-btn save ${cls}`.trim(), 'data-id': job.id, 'data-title': job.title,
      'aria-pressed': String(state.saved.has(job.id)),
      'aria-label': (state.saved.has(job.id) ? 'Убрать из избранного: ' : 'Сохранить в избранное: ') + job.title,
      onclick: e => { e.stopPropagation(); toggleSaved(job.id); }
    }, icon('i-bookmark'));
  }

  /* ---------- Строка вакансии ---------- */
  const fitKeys = () => new Set(state.analysis ? state.analysis.directions.map(d => d.key) : []);

  function jobRow(job, fits) {
    const tags = [];
    if (fits.has(job.direction)) tags.push(el('li', {class: 'tag tag--fit', text: 'Подходит вам'}));
    tags.push(el('li', {class: 'tag', text: job.experience === 'Без опыта' ? 'Без опыта' : 'Опыт ' + job.experience.toLowerCase()}));
    tags.push(el('li', {class: 'tag', text: job.format}));

    return el('li', {class: 'job'},
      el('figure', {class: 'job__media'},
        el('img', {src: jobPhoto(job, 208, 208), srcset: `${jobPhoto(job, 208, 208)} 1x, ${jobPhoto(job, 416, 416)} 2x`, alt: '', loading: 'lazy', width: 104, height: 104})),
      el('div', {class: 'job__body'},
        el('p', {class: 'job__meta'}, el('span', {text: job.source}), el('span', {class: 'dot', 'aria-hidden': 'true'}), el('span', {text: job.posted})),
        el('h3', {class: 'job__title'}, el('button', {class: 'job__open', type: 'button', text: job.title, onclick: e => openSheet(job, e.currentTarget)})),
        el('p', {class: 'job__company', text: `${job.company} · ${job.city}`}),
        el('p', {class: 'job__summary', text: job.summary}),
        el('ul', {class: 'job__tags', 'aria-label': 'Особенности'}, tags)),
      el('div', {class: 'job__side'},
        el('p', {class: 'job__salary' + (job.salary ? '' : ' job__salary--none'), text: salaryText(job)}),
        saveButton(job))
    );
  }

  function skeletonRows(n = 4) {
    return Array.from({length: n}, () => el('li', {class: 'job job--skeleton', 'aria-hidden': 'true'},
      el('div', {class: 'job__media'}),
      el('div', {class: 'job__body'},
        el('span', {class: 'sk', style: 'width:120px;height:12px'}),
        el('span', {class: 'sk', style: 'width:min(340px,80%);height:20px;margin-top:4px'}),
        el('span', {class: 'sk', style: 'width:200px;height:14px'}),
        el('span', {class: 'sk', style: 'width:min(420px,90%);height:14px;margin-top:6px'})),
      el('div', {class: 'job__side'}, el('span', {class: 'sk', style: 'width:110px;height:16px'}))));
  }

  /* ---------- Каталог ---------- */
  const list = $('#job-list');
  const catalogState = $('#catalog-state');
  const filtersForm = $('#filters-form');
  const filtersEl = $('#filters');
  const moreBtn = $('#catalog-more');
  const PAGE = 7;
  let expanded = false;

  function filtered() {
    const f = state.filters;
    const words = norm(f.q).split(/\s+/).filter(Boolean);
    const city = norm(f.city.trim());
    const res = state.jobs.filter(job => {
      if (f.formats.size && !f.formats.has(job.format)) return false;
      if (f.noExp && job.experience !== 'Без опыта') return false;
      if (f.sources.size && !f.sources.has(job.source)) return false;
      if (f.salary && (!job.salary || job.salary[1] < f.salary)) return false;
      if (city && !norm(job.city).includes(city) && !(job.format === 'Удалённо')) return false;
      const hay = norm([job.title, job.company, job.city, job.summary, job.short, DIRECTIONS[job.direction].name].join(' '));
      return words.every(w => hay.includes(w));
    });
    const order = new Map(CATALOG.map((j, i) => [j.id, i]));
    const fits = fitKeys();
    if (state.sort === 'salary') res.sort((a, b) => (b.salary ? b.salary[1] : -1) - (a.salary ? a.salary[1] : -1));
    else if (state.sort === 'fit') res.sort((a, b) => (fits.has(b.direction) - fits.has(a.direction)) || order.get(a.id) - order.get(b.id));
    else res.sort((a, b) => order.get(a.id) - order.get(b.id));
    return res;
  }

  function activeFilterCount() {
    const f = state.filters;
    return (f.q ? 1 : 0) + (f.city ? 1 : 0) + f.formats.size + (f.noExp ? 1 : 0) + (f.salary ? 1 : 0) + f.sources.size;
  }

  function renderCatalog() {
    const count = $('#result-count');
    const hint = $('#results-hint');
    list.setAttribute('aria-busy', String(state.status === 'loading'));

    if (state.status === 'loading') {
      moreBtn.hidden = true;
      list.replaceChildren(...skeletonRows());
      catalogState.hidden = true;
      count.textContent = 'Загружаем…';
      return;
    }
    if (state.status === 'error') {
      moreBtn.hidden = true;
      list.replaceChildren();
      catalogState.hidden = false;
      catalogState.replaceChildren(
        el('h3', {text: 'Не получилось загрузить вакансии'}),
        el('p', {text: 'Источники не ответили вовремя. Проверьте подключение к интернету и попробуйте ещё раз.'}),
        el('button', {class: 'btn btn--ghost', type: 'button', text: 'Повторить', onclick: load}));
      count.textContent = '';
      return;
    }

    const res = filtered();
    const n = activeFilterCount();
    count.textContent = `${res.length} ${plural(res.length, ['вакансия', 'вакансии', 'вакансий'])}`;
    const badge = $('#filters-badge');
    badge.hidden = !n; badge.textContent = n;

    hint.replaceChildren();
    if (state.analysis) hint.append(`Отмечены вакансии по вашему рассказу о себе. `);
    else hint.append(el('a', {class: 'link-arrow', href: '#/match', text: 'Узнать, какие подходят вам'}));
    $('#sort option[value="fit"]').disabled = !state.analysis;

    const shown = expanded ? res : res.slice(0, PAGE);
    list.replaceChildren(...shown.map(job => jobRow(job, fitKeys())));
    const rest = res.length - shown.length;
    moreBtn.hidden = rest <= 0;
    $('#catalog-more-count').textContent = rest;
    catalogState.hidden = res.length > 0;
    if (!res.length) {
      catalogState.replaceChildren(
        el('h3', {text: 'По этим условиям ничего нет'}),
        el('p', {text: 'Попробуйте убрать часть фильтров или поискать по более общему слову — например, «оператор» вместо полной должности.'}),
        el('button', {class: 'btn btn--ghost', type: 'button', text: 'Сбросить фильтры', onclick: resetFilters}));
    }
  }

  function readFilters() {
    const fd = new FormData(filtersForm);
    const f = state.filters;
    f.q = String(fd.get('q') || '').trim();
    f.city = String(fd.get('city') || '').trim();
    f.formats = new Set(fd.getAll('format'));
    f.noExp = fd.has('noexp');
    f.salary = Number(fd.get('salary') || 0);
    f.sources = new Set(fd.getAll('source'));
    expanded = false;
    renderCatalog();
  }
  function writeFilters() {
    const f = state.filters;
    filtersForm.elements.q.value = f.q;
    filtersForm.elements.city.value = f.city;
    $$('input[name="format"]', filtersForm).forEach(i => { i.checked = f.formats.has(i.value); });
    filtersForm.elements.noexp.checked = f.noExp;
    filtersForm.elements.salary.value = String(f.salary);
    syncSelects();
    $$('input[name="source"]', filtersForm).forEach(i => { i.checked = f.sources.has(i.value); });
  }
  function resetFilters() {
    state.filters = {q: '', city: '', formats: new Set(), noExp: false, salary: 0, sources: new Set()};
    expanded = false;
    writeFilters();
    const hero = $('#hero-search');
    hero.elements.q.value = hero.elements.city.value = '';
    renderCatalog();
  }

  filtersForm.addEventListener('input', readFilters);
  filtersForm.addEventListener('submit', e => e.preventDefault());
  filtersForm.addEventListener('reset', e => { e.preventDefault(); resetFilters(); });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; renderCatalog(); });
  moreBtn.addEventListener('click', () => {
    const first = list.children.length;
    expanded = true;
    renderCatalog();
    const next = list.children[first] && list.children[first].querySelector('.job__open');
    if (next) next.focus({preventScroll: true});
  });

  /* ---------- Выпадающие списки в общем стиле ---------- */
  // Нативный <select> остаётся источником значения (форма, события), поверх рисуем свой список.
  const selectSyncs = [];
  function syncSelects() { selectSyncs.forEach(fn => fn()); }
  function enhanceSelect(select, name) {
    const box = el('div', {class: 'dd' + (select.classList.contains('select--bare') ? ' dd--bare' : '')});
    const listId = select.id + '-list';
    const value = el('span', {class: 'dd__value', id: select.id + '-value'});
    const btn = el('button', {type: 'button', class: 'dd__btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listId}, value);
    const menu = el('ul', {class: 'dd__menu', role: 'listbox', id: listId, tabindex: '-1', 'aria-label': name, hidden: true});
    btn.setAttribute('aria-label', name);
    select.classList.add('dd__native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.replaceWith(box);
    box.append(select, btn, menu);

    let active = -1;
    const options = () => [...select.options];
    function sync() {
      const o = select.options[select.selectedIndex];
      value.textContent = o ? o.textContent : '';
      btn.setAttribute('aria-label', `${name}: ${value.textContent}`);
    }
    // Пункты строятся один раз при открытии; подсветка меняется классом, без перерисовки.
    function build() {
      menu.replaceChildren(...options().map((o, i) => el('li', {
        class: 'dd__opt', role: 'option', id: `${listId}-${i}`,
        'aria-selected': String(i === select.selectedIndex), 'aria-disabled': o.disabled ? 'true' : false,
        onpointerdown: e => e.preventDefault(),
        onpointermove: () => { if (!o.disabled && active !== i) { active = i; paint(); } },
        onclick: () => { if (!o.disabled) choose(i); }
      }, o.textContent)));
    }
    function paint() {
      [...menu.children].forEach((li, i) => li.classList.toggle('is-active', i === active));
      if (active >= 0) menu.setAttribute('aria-activedescendant', `${listId}-${active}`);
      else menu.removeAttribute('aria-activedescendant');
    }
    function open() {
      if (!menu.hidden) return;
      active = select.selectedIndex;
      build();
      paint();
      menu.hidden = false;
      requestAnimationFrame(() => box.classList.add('is-open'));
      btn.setAttribute('aria-expanded', 'true');
      menu.focus({preventScroll: true});
    }
    function close(focusBtn = true) {
      if (menu.hidden) return;
      menu.hidden = true;
      box.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus({preventScroll: true});
    }
    function choose(i) {
      const changed = select.selectedIndex !== i;
      select.selectedIndex = i;
      sync();
      close();
      if (changed) {
        select.dispatchEvent(new Event('input', {bubbles: true}));
        select.dispatchEvent(new Event('change', {bubbles: true}));
      }
    }
    function move(d) {
      const os = options();
      let i = active;
      for (let k = 0; k < os.length; k++) {
        i = (i + d + os.length) % os.length;
        if (!os[i].disabled) break;
      }
      active = i;
      paint();
    }
    btn.addEventListener('click', () => (menu.hidden ? open() : close()));
    btn.addEventListener('keydown', e => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    });
    menu.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); active = -1; move(1); }
      else if (e.key === 'End') { e.preventDefault(); active = 0; move(-1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (active >= 0 && !select.options[active].disabled) choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') close(false);
    });
    menu.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget)) close(false); });
    document.addEventListener('pointerdown', e => { if (!box.contains(e.target)) close(false); });
    selectSyncs.push(sync);
    sync();
  }
  enhanceSelect($('#f-salary'), 'Зарплата от');
  enhanceSelect($('#sort'), 'Сортировка');

  // Фильтры раскрыты на десктопе и свёрнуты на телефоне.
  const wide = matchMedia('(min-width: 961px)');
  const syncFiltersOpen = () => { filtersEl.open = wide.matches; };
  wide.addEventListener('change', syncFiltersOpen);
  syncFiltersOpen();
  filtersEl.addEventListener('toggle', () => { if (wide.matches && !filtersEl.open) filtersEl.open = true; });

  // Источники с количеством вакансий
  function renderSources() {
    const counts = {};
    for (const j of CATALOG) counts[j.source] = (counts[j.source] || 0) + 1;
    const box = $('#f-sources');
    box.replaceChildren(...Object.entries(counts).map(([name, c]) =>
      el('label', {class: 'check'}, el('input', {type: 'checkbox', name: 'source', value: name}), el('span', {text: name}), el('span', {class: 'count', text: c}))));

    const dl = $('#sources');
    dl.replaceChildren(
      ...Object.entries(counts).map(([name, c]) => el('div', {},
        el('dt', {text: name}),
        el('dd', {text: (SOURCES[name].site !== name ? SOURCES[name].site + ' · ' : '') + `${c} ${plural(c, ['вакансия', 'вакансии', 'вакансий'])}`}))));
  }

  // Поиск на первом экране: подсказка укорачивается, если поле стало узким
  const heroQ = $('#hero-search input[name="q"]');
  const qHints = ['Профессия, навык или компания', 'Профессия или навык', 'Профессия'];
  const measure = document.createElement('canvas').getContext('2d');
  function fitHeroHint() {
    const cs = getComputedStyle(heroQ);
    measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const room = heroQ.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    heroQ.placeholder = qHints.find(t => measure.measureText(t).width <= room) || qHints[qHints.length - 1];
  }
  if ('ResizeObserver' in window) new ResizeObserver(fitHeroHint).observe(heroQ);
  if (document.fonts) document.fonts.ready.then(fitHeroHint);
  fitHeroHint();

  $('#hero-search').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    state.filters.q = String(fd.get('q') || '').trim();
    state.filters.city = String(fd.get('city') || '').trim();
    expanded = false;
    writeFilters();
    renderCatalog();
    $('#catalog').scrollIntoView({behavior: reduced.matches ? 'auto' : 'smooth'});
  });

  async function load() {
    state.status = 'loading';
    renderCatalog();
    try {
      state.jobs = await fetchJobs();
      state.status = 'ready';
    } catch (_) {
      state.status = 'error';
    }
    renderCatalog();
  }

  /* ---------- Карточка вакансии ---------- */
  const sheet = $('#sheet');
  const flip = $('#sheet-flip');
  let sheetJob = null;
  let closing = null;

  function section(title, content) {
    const body = Array.isArray(content)
      ? el('ul', {}, content.map(t => el('li', {text: t})))
      : el('p', {text: content});
    return [el('h3', {text: title}), body];
  }

  function setMode(mode) {
    flip.dataset.mode = mode;
    $$('.seg__btn', sheet).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('#sheet-plain').inert = mode !== 'plain';
    $('#sheet-original').inert = mode !== 'original';
  }
  $$('.seg__btn', sheet).forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  function renderFit(job) {
    const box = $('#sheet-fit');
    box.replaceChildren();
    const a = state.analysis;
    const dir = a && a.directions.find(d => d.key === job.direction);
    if (dir) {
      box.append(
        el('h3', {text: 'Почему может подойти'}),
        el('p', {text: dir.reason}),
        el('p', {text: job.note + '.'}));
    } else if (a) {
      box.append(
        el('h3', {text: 'Не в ваших главных направлениях'}),
        el('p', {text: `По вашему рассказу ближе ${a.directions.map(d => d.name.toLowerCase()).join(', ')}. Но посмотреть и сравнить никто не мешает.`}));
    } else {
      box.append(
        el('h3', {text: 'Подходит ли это вам?'}),
        el('p', {text: 'Расскажите о себе в паре абзацев — объясним, какие вакансии вам ближе и почему.'}),
        el('a', {class: 'link-arrow', href: '#/match', onclick: () => closeSheet()}, 'Рассказать о себе', icon('i-right')));
    }
  }

  function openSheet(job) {
    sheetJob = job;
    if (closing) { clearTimeout(closing); closing = null; }
    $('#sheet-source').textContent = `${job.source} · ${job.posted}`;
    const img = $('#sheet-img');
    img.src = jobPhoto(job, 1200, 600);
    img.alt = '';
    $('#sheet-title').textContent = job.title;
    $('#sheet-company').textContent = job.company;
    $('#sheet-facts').replaceChildren(...[
      ['Зарплата', salaryText(job)], ['Опыт', job.experience], ['Формат', job.format], ['Город', job.city]
    ].map(([k, v]) => el('div', {}, el('dt', {text: k}), el('dd', {text: v}))));

    $('#sheet-plain').replaceChildren(
      el('div', {class: 'flip__label'}, el('span', {text: 'Пересказ ИИ'}), el('span', {text: 'Цифры сверены с оригиналом'})),
      ...section('Что делать', job.plain.duties),
      ...section('Что нужно', job.plain.requirements),
      ...section('Что предлагают', job.plain.conditions));
    $('#sheet-original').replaceChildren(
      el('div', {class: 'flip__label'}, el('span', {text: `Текст ${job.sourceFrom}`})),
      ...section('Обязанности', job.original.duties),
      ...section('Требования', job.original.requirements),
      ...section('Условия', job.original.conditions));
    setMode('plain');
    renderFit(job);

    const link = $('#sheet-link');
    link.href = job.url;
    link.replaceChildren(el('span', {text: `Открыть ${job.sourceOn}`}), icon('i-arrow'));
    const save = $('#sheet-save');
    save.dataset.id = job.id; save.dataset.title = job.title;
    syncSaved(false);

    if (!sheet.open) {
      sheet.showModal();
      document.body.classList.add('is-locked');
      requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
    }
    $('.sheet__scroll', sheet).scrollTop = 0;
    $('#sheet-close').focus();
  }

  function closeSheet() {
    if (!sheet.open || closing) return;
    sheet.classList.remove('is-open');
    closing = setTimeout(() => {
      closing = null;
      sheet.close();
      document.body.classList.remove('is-locked');
    }, reduced.matches ? 0 : 320);
  }
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-save').addEventListener('click', () => sheetJob && toggleSaved(sheetJob.id));
  sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

  /* ---------- Подбор профессии ---------- */
  /*
   * Демо-анализ: ищет в тексте сигналы направлений и цитирует фразы,
   * на которые опирается. Интерфейс рассчитан на ответ языковой модели
   * того же вида: {traits, directions[{key, reason, jobs}]}.
   */
  function fragmentAround(text, index) {
    const stops = /[.!?;\n,—]/;
    let start = index, end = index;
    while (start > 0 && !stops.test(text[start - 1])) start--;
    while (end < text.length && !stops.test(text[end])) end++;
    let frag = text.slice(start, end).trim().replace(/\s+/g, ' ');
    if (frag.length > 64) {
      const rel = index - start;
      const from = Math.max(0, rel - 28);
      frag = (from > 0 ? '…' : '') + frag.slice(from, from + 60).trim() + '…';
    }
    return frag.charAt(0).toLocaleLowerCase('ru') + frag.slice(1);
  }

  function analyze(text) {
    const lower = norm(text);
    const traits = new Map();
    const scored = Object.entries(DIRECTIONS).map(([key, d]) => {
      const hits = [];
      for (const [re, label] of d.signals) {
        const m = re.exec(lower);
        if (!m) continue;
        const quote = fragmentAround(text, m.index);
        hits.push({label, quote});
        if (!traits.has(label)) traits.set(label, quote);
      }
      return {key, ...d, hits, score: hits.length};
    });
    const prefs = {};
    for (const p of PREFERENCES) {
      const m = p.re.exec(lower);
      if (m) { prefs[p.key] = true; traits.set(p.label, fragmentAround(text, m.index)); }
    }

    // Бонус за совпадение формата и опыта с вакансиями направления
    for (const d of scored) {
      const js = CATALOG.filter(j => j.direction === d.key);
      if (prefs.remote && js.some(j => j.format === 'Удалённо')) d.score += 0.5;
      if (prefs.noExp && js.some(j => j.experience === 'Без опыта')) d.score += 0.3;
    }
    scored.sort((a, b) => b.score - a.score);
    let picked = scored.filter(d => d.hits.length).slice(0, 3);
    const fallback = ['service', 'logistics', 'qa'].map(k => scored.find(d => d.key === k));
    for (const d of fallback) if (picked.length < 3 && !picked.includes(d)) picked.push(d);

    const directions = picked.map(d => {
      const quotes = [...new Set(d.hits.map(h => h.quote))].slice(0, 2);
      const fit = d.hits.length >= 3 ? 'Сильное совпадение' : d.hits.length === 2 ? 'Хорошее совпадение' : d.hits.length === 1 ? 'Есть пересечения' : 'Можно начать без опыта';
      const reason = quotes.length
        ? `Вы написали ${quotes.map(q => `«${q}»`).join(' и ')}. ${d.why}`
        : `В вашем рассказе нет прямых зацепок за это направление, но здесь легко начать без опыта. ${d.why}`;
      let js = CATALOG.filter(j => j.direction === d.key);
      js.sort((a, b) => ((prefs.remote ? (b.format === 'Удалённо') - (a.format === 'Удалённо') : 0) || (prefs.noExp ? (b.experience === 'Без опыта') - (a.experience === 'Без опыта') : 0)));
      return {key: d.key, name: d.name, what: d.what, start: d.start, fit, reason, jobs: js, strength: d.hits.length};
    });

    return {traits: [...traits].map(([label, quote]) => ({label, quote})), directions, prefs};
  }

  const aboutEl = $('#about');
  const resultEl = $('#match-result');
  const errorEl = $('#match-error');

  function renderMatchEmpty() {
    resultEl.replaceChildren(el('div', {class: 'match__empty'},
      el('figure', {class: 'match__empty-media'}, el('img', {src: photo('1434030216411-0b793f4b4173', 1100, 690), alt: 'Блокнот и ручка на деревянном столе', loading: 'lazy'})),
      el('h2', {text: 'Что вы получите'}),
      el('ol', {},
        el('li', {text: 'Список того, что мы поняли из вашего рассказа, — с цитатами, чтобы было видно, на что опирается подбор.'}),
        el('li', {text: 'Три профессиональных направления с объяснением, почему каждое может вам подойти, и с чего начать.'}),
        el('li', {text: 'Вакансии из каталога для каждого направления — их можно сразу открыть и сохранить.'}))));
  }

  function renderMatchLoading() {
    const status = el('p', {class: 'loading__status', text: 'Читаем ваш рассказ…'});
    resultEl.replaceChildren(el('div', {class: 'loading'},
      status,
      el('span', {class: 'sk', style: 'height:28px;width:60%'}),
      el('span', {class: 'sk', style: 'height:56px;width:100%'}),
      el('span', {class: 'sk', style: 'height:120px;width:100%'}),
      el('span', {class: 'sk', style: 'height:120px;width:100%'})));
    return status;
  }

  function miniJob(job, extra) {
    return el('li', {class: 'mini-job'},
      el('img', {src: jobPhoto(job, 112, 112), alt: '', loading: 'lazy', width: 56, height: 56}),
      el('div', {},
        el('p', {class: 'mini-job__title'}, el('button', {class: 'job__open', type: 'button', text: job.title, onclick: () => openSheet(job)})),
        el('p', {class: 'mini-job__note', text: [job.company, extra || job.note].join(' · ')})),
      el('p', {class: 'mini-job__pay', text: salaryShort(job)}));
  }

  function renderMatchResult(a) {
    const traitList = a.traits.length
      ? el('ul', {class: 'traits'}, a.traits.slice(0, 8).map(t => el('li', {class: 'trait'}, el('b', {text: t.label}), el('q', {text: t.quote}))))
      : el('p', {class: 'lead', text: 'Явных зацепок мы не нашли — попробуйте добавить, что вам нравится делать и что получается. А пока — направления, где легко начать без опыта.'});

    resultEl.replaceChildren(
      el('div', {class: 'insight'},
        el('p', {class: 'eyebrow', text: 'Что мы поняли'}),
        el('h2', {text: a.traits.length ? 'Опираемся на ваши слова' : 'Пока мало деталей'}),
        traitList),
      el('ol', {class: 'directions'}, a.directions.map((d, i) =>
        el('li', {class: 'direction'},
          el('div', {class: 'direction__head'},
            el('span', {class: 'direction__num', text: String(i + 1).padStart(2, '0')}),
            el('h3', {class: 'direction__name', text: d.name}),
            el('span', {class: 'direction__fit', text: d.fit})),
          el('div', {class: 'direction__body'},
            el('p', {class: 'direction__what', text: d.what}),
            el('p', {class: 'direction__why', text: d.reason}),
            el('p', {class: 'direction__start'}, el('b', {text: 'С чего начать: '}), d.start),
            d.jobs.length ? el('ul', {class: 'mini-jobs', 'aria-label': `Вакансии: ${d.name}`}, d.jobs.map(j => {
              const extra = a.prefs.remote && j.format === 'Удалённо' ? 'удалённо, как вы хотели' : null;
              return miniJob(j, extra);
            })) : null)))),
      el('p', {class: 'match__again'}, 'Подбор обновится, если дополнить рассказ. В каталоге подходящие вакансии теперь отмечены. ',
        el('a', {class: 'link-arrow', href: '#/', onclick: () => setTimeout(() => $('#catalog').scrollIntoView(), 0)}, 'К каталогу', icon('i-right'))));
  }

  function updateCounter() {
    $('#about-count').textContent = `${aboutEl.value.length} / ${aboutEl.maxLength}`;
  }
  aboutEl.addEventListener('input', () => {
    updateCounter();
    if (errorEl.textContent) { errorEl.textContent = ''; aboutEl.removeAttribute('aria-invalid'); }
  });

  $('#examples').replaceChildren(...EXAMPLES.map(ex => el('button', {
    type: 'button', class: 'chip', text: ex.label,
    onclick: () => { aboutEl.value = ex.text; updateCounter(); aboutEl.focus(); errorEl.textContent = ''; aboutEl.removeAttribute('aria-invalid'); }
  })));

  let analyzing = false;
  $('#match-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (analyzing) return;
    const text = aboutEl.value.trim();
    if (text.length < 40) {
      errorEl.textContent = text ? 'Напишите чуть подробнее — хотя бы пару предложений о том, что вам нравится.' : 'Расскажите о себе хотя бы в паре предложений.';
      aboutEl.setAttribute('aria-invalid', 'true');
      aboutEl.focus();
      return;
    }
    analyzing = true;
    const btn = $('#match-submit');
    btn.disabled = true; btn.textContent = 'Подбираем…';
    const status = renderMatchLoading();
    if (innerWidth <= 960) resultEl.scrollIntoView({behavior: reduced.matches ? 'auto' : 'smooth', block: 'start'});
    const phases = ['Читаем ваш рассказ…', `Сопоставляем с ${Object.keys(DIRECTIONS).length} направлениями…`, 'Подбираем вакансии…'];
    for (let i = 1; i < phases.length; i++) { await new Promise(r => setTimeout(r, 420)); status.textContent = phases[i]; }
    await new Promise(r => setTimeout(r, 380));

    state.about = text;
    state.analysis = analyze(text);
    store.set('starter.about', text);
    renderMatchResult(state.analysis);
    renderCatalog();
    btn.disabled = false; btn.textContent = 'Обновить подбор';
    analyzing = false;
  });

  /* ---------- Избранное ---------- */
  function renderSaved() {
    const items = CATALOG.filter(j => state.saved.has(j.id));
    $('#saved-meta').textContent = items.length ? `${items.length} ${plural(items.length, ['вакансия', 'вакансии', 'вакансий'])}` : '';
    $('#saved-list').replaceChildren(...items.map(j => jobRow(j, fitKeys())));
    const st = $('#saved-state');
    st.hidden = items.length > 0;
    if (!items.length) st.replaceChildren(
      el('h3', {text: 'Здесь пока пусто'}),
      el('p', {text: 'Нажмите на значок закладки у вакансии, чтобы вернуться к ней позже. Список хранится в этом браузере.'}),
      el('a', {class: 'link-arrow', href: '#/'}, 'Перейти к каталогу', icon('i-right')));
  }

  /* ---------- Профиль (демо-регистрация) ---------- */
  /*
   * Один локальный профиль на браузер: имя и email в localStorage.
   * Пароль проверяется только на длину и нигде не сохраняется.
   * Для настоящих аккаунтов эти функции заменяются запросами к серверу авторизации.
   */
  const authForm = $('#auth-form');
  const auth = {mode: 'register', account: null, signedIn: false};
  const dateFmt = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'});
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function loadAccount() {
    const a = store.get('starter.account', null);
    auth.account = a && typeof a.name === 'string' && typeof a.email === 'string' ? a : null;
    auth.signedIn = Boolean(auth.account && store.get('starter.signedIn', false));
  }

  function fieldError(input, message) {
    $('#' + input.id + '-error').textContent = message;
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function clearAuthErrors() {
    for (const input of [authForm.elements.name, authForm.elements.email, authForm.elements.password]) fieldError(input, '');
    $('#auth-status').textContent = '';
  }

  function setAuthMode(mode) {
    auth.mode = mode;
    const register = mode === 'register';
    const wrap = $('#auth-name-wrap');
    wrap.classList.toggle('is-collapsed', !register);
    wrap.inert = !register;
    authForm.elements.password.autocomplete = register ? 'new-password' : 'current-password';
    $('#auth-password-hint').hidden = !register;
    $('#auth-submit').textContent = register ? 'Создать профиль' : 'Войти';
    $$('[data-auth]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.auth === mode)));
    clearAuthErrors();
  }
  $$('[data-auth]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));

  $('#auth-reveal').addEventListener('click', e => {
    const btn = e.currentTarget;
    const show = btn.getAttribute('aria-pressed') !== 'true';
    authForm.elements.password.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });

  authForm.addEventListener('input', e => {
    if (e.target.matches('input')) fieldError(e.target, '');
    $('#auth-status').textContent = '';
  });

  authForm.addEventListener('submit', e => {
    e.preventDefault();
    clearAuthErrors();
    const {name, email, password} = authForm.elements;
    const register = auth.mode === 'register';
    const nameValue = name.value.trim().replace(/\s+/g, ' ');
    const emailValue = email.value.trim().toLowerCase();
    const errors = [];

    if (register && nameValue.length < 2) errors.push([name, 'Как к вам обращаться? Напишите имя.']);
    if (!emailValue) errors.push([email, 'Укажите email.']);
    else if (!emailRe.test(emailValue)) errors.push([email, 'Похоже, в адресе опечатка. Пример: name@mail.ru']);
    if (!password.value) errors.push([password, 'Придумайте пароль.']);
    else if (register && password.value.length < 10) errors.push([password, `Нужно ещё ${10 - password.value.length} ${plural(10 - password.value.length, ['символ', 'символа', 'символов'])}.`]);

    if (errors.length) {
      errors.forEach(([input, msg]) => fieldError(input, msg));
      errors[0][0].focus();
      return;
    }

    if (register) {
      if (auth.account && auth.account.email === emailValue) {
        $('#auth-status').textContent = 'Профиль с этим email уже есть в этом браузере. Переключитесь на вход.';
        return;
      }
      auth.account = {name: nameValue, email: emailValue, created: Date.now()};
      store.set('starter.account', auth.account);
    } else if (!auth.account || auth.account.email !== emailValue) {
      fieldError(email, 'В этом браузере нет профиля с таким email. Зарегистрируйтесь — это займёт минуту.');
      email.focus();
      return;
    }

    auth.signedIn = true;
    store.set('starter.signedIn', true);
    authForm.reset();
    $('#auth-reveal').setAttribute('aria-pressed', 'true');
    $('#auth-reveal').click();
    renderAccount();
    $('#member-name').focus();
  });

  $('#logout').addEventListener('click', () => {
    auth.signedIn = false;
    store.set('starter.signedIn', false);
    setAuthMode('login');
    renderAccount();
    $('#account-title').focus();
  });

  function stat(label, value, opts = {}) {
    return el('div', {},
      el('dt', {text: label}),
      el('dd', {class: opts.cls || false, text: value}),
      opts.link ? el('a', {class: 'link-arrow', href: opts.link[1]}, opts.link[0], icon('i-right')) : null);
  }

  function renderAccount() {
    const member = auth.signedIn && auth.account;
    $('#account-guest').hidden = Boolean(member);
    $('#account-member').hidden = !member;
    $('#account-label').textContent = member ? auth.account.name.split(' ')[0] : 'Войти';
    if (!member) return;

    const a = auth.account;
    $('#member-avatar').textContent = a.name.trim().charAt(0).toLocaleUpperCase('ru');
    $('#member-name').textContent = a.name;
    $('#member-email').textContent = a.email;
    $('#member-since').textContent = a.created ? `В Стартере с ${dateFmt.format(a.created)}` : 'Профиль';

    const savedN = state.saved.size;
    const dirs = state.analysis ? state.analysis.directions.map(d => d.name) : [];
    $('#member-stats').replaceChildren(
      stat('Избранное', savedN ? `${savedN} ${plural(savedN, ['вакансия', 'вакансии', 'вакансий'])}` : 'Пока пусто',
        {cls: savedN ? '' : 'is-muted', link: savedN ? ['Открыть список', '#/saved'] : ['К каталогу', '#/']}),
      stat('Подбор профессии', dirs.length ? dirs.join(', ') : 'Ещё не пройден',
        {cls: dirs.length ? '' : 'is-muted', link: [dirs.length ? 'Посмотреть объяснения' : 'Пройти подбор', '#/match']}),
      stat('О себе', state.about || 'Расскажите о себе на странице подбора — по этому тексту мы подбираем направления.',
        {cls: 'is-text', link: state.about ? ['Изменить', '#/match'] : null}));
  }

  /* ---------- Маршруты ---------- */
  const titles = {home: 'Стартер — вакансии простым языком', match: 'Подбор профессии — Стартер', saved: 'Избранное — Стартер', account: 'Профиль — Стартер'};
  let route = null;
  function navigate() {
    const hash = location.hash.replace(/^#\/?/, '');
    const next = ['match', 'saved', 'account'].includes(hash) ? hash : 'home';
    if (sheet.open) closeSheet();
    const changed = next !== route;
    route = next;
    $$('.view').forEach(v => { v.hidden = v.dataset.view !== next; });
    $$('.nav__link').forEach(a => {
      if (a.dataset.route === next) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = titles[next];
    if (next === 'saved') renderSaved();
    if (next === 'account') renderAccount();
    if (changed) {
      scrollTo(0, 0);
      if (next !== 'home') $('#main').focus({preventScroll: true});
      dispatchEvent(new Event('resize'));
    }
  }
  addEventListener('hashchange', navigate);

  /* ---------- 3D ---------- */
  const ringJobs = [1, 4, 3, 2, 6, 14, 7, 9, 11, 10].map(id => CATALOG.find(j => j.id === id));
  Scene.createRing({
    stage: $('#ring-stage'),
    ring: $('#ring'),
    items: ringJobs,
    render: job => {
      const face = side => el('span', {class: `ring__face ring__face--${side}`, 'aria-hidden': 'true'},
        el('img', {src: jobPhoto(job, 400, 528), alt: '', draggable: 'false'}),
        el('span', {class: 'ring__label'}, el('span', {class: 'ring__role', text: job.short}), el('span', {class: 'ring__pay', text: salaryShort(job)})));
      return el('button', {class: 'ring__card', type: 'button', 'aria-label': `${job.title}, ${salaryShort(job)}. Открыть вакансию`}, face('front'), face('back'));
    },
    onPick: job => openSheet(job)
  });
  Scene.createHowScene({
    track: $('#how-track'),
    scene: $('#scene'),
    steps: $$('#steps .step'),
    bar: $('#how-bar')
  });
  Scene.createParallax($('#invite-media'));

  /* ---------- Старт ---------- */
  renderSources();
  loadAccount();
  setAuthMode(auth.account && !auth.signedIn ? 'login' : 'register');
  renderAccount();
  syncSaved(false);
  if (state.about) {
    aboutEl.value = state.about;
    state.analysis = analyze(state.about);
    renderMatchResult(state.analysis);
    $('#match-submit').textContent = 'Обновить подбор';
  } else {
    renderMatchEmpty();
  }
  updateCounter();
  navigate();
  load();
})();
