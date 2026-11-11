
const jobs = [
  {id:1,title:'Junior .NET-разработчик',company:'Яндекс',mark:'Я',color:'#ffe3dc',city:'Москва',format:'Гибрид',salary:[100000,140000],skills:['C#','Blazor','SQL'],description:'Разрабатывать интерфейсы внутренних сервисов и работать с данными вместе с командой .NET.',url:'https://yandex.ru/jobs/'},
  {id:2,title:'Frontend-разработчик',company:'Т-Банк',mark:'Т',color:'#fff0b9',city:'Россия',format:'Удалённо',salary:[110000,160000],skills:['HTML','CSS','JavaScript','React'],description:'Создавать компоненты личного кабинета и улучшать доступность интерфейсов.',url:'https://www.tbank.ru/career/'},
  {id:3,title:'Стажёр по тестированию',company:'VK',mark:'VK',color:'#dceaff',city:'Санкт-Петербург',format:'Офис',salary:[55000,75000],skills:['SQL','API','Postman'],description:'Составлять сценарии проверок, тестировать API и описывать найденные проблемы.',url:'https://team.vk.company/'},
  {id:4,title:'Продуктовый дизайнер',company:'Ozon',mark:'O',color:'#e1e5ff',city:'Москва',format:'Гибрид',salary:[120000,170000],skills:['Figma','Прототипирование','UX'],description:'Проектировать сценарии для покупателей и проверять прототипы на исследованиях.',url:'https://job.ozon.ru/'},
  {id:5,title:'Младший аналитик данных',company:'Авито',mark:'А',color:'#dcf5ee',city:'Россия',format:'Удалённо',salary:[85000,120000],skills:['SQL','Python','Excel'],description:'Собирать отчёты, проверять гипотезы и автоматизировать регулярные выгрузки.',url:'https://career.avito.com/'},
  {id:6,title:'Стажёр по веб-разработке',company:'Яндекс',mark:'Я',color:'#ffe3dc',city:'Москва',format:'Офис',salary:[65000,95000],skills:['HTML','CSS','Git'],description:'Верстать страницы, исправлять ошибки интерфейса и участвовать в ревью кода.',url:'https://yandex.ru/jobs/'}
];
const titles = {vacancies:'Все вакансии',matches:'Подбор по навыкам',saved:'Избранное',profile:'Профиль',preferences:'Настройки подбора'};
const $ = selector => document.querySelector(selector);
const query = $('#query');
const format = $('#format');
const sort = $('#sort');
const cards = $('#cards');
const dialog = $('#details');
const form = $('#profile-form');
function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
const storedSaved = read('starter.saved', []);
const saved = new Set(Array.isArray(storedSaved) ? storedSaved : []);
const defaults = {role:'',skills:'C#, Blazor, HTML, CSS, SQL',about:''};
let profile = {...defaults};
const storedProfile = read('starter.profile', {});
for (const field of Object.keys(defaults)) {
  if (typeof storedProfile?.[field] === 'string') profile[field] = storedProfile[field];
  form.elements[field].value = profile[field];
}
const normalize = value => value.trim().toLocaleLowerCase('ru');
const icon = name => '<svg class="icon" aria-hidden="true"><use href="#' + name + '"/></svg>';
const money = new Intl.NumberFormat('ru-RU');
const salary = job => job.salary.map(amount => money.format(amount)).join(' – ') + ' ₽';
const directions = [
 {name:'Веб-разработка', ids:[1,2,6], words:['программ','сайт','код','разработ','интерфейс'], explanation:'Создавать сайты и приложения, превращать идеи в работающие интерфейсы.'},
 {name:'Аналитика данных', ids:[5], words:['числ','таблиц','анализ','эконом','математ','данны'], explanation:'Работать с таблицами и данными, находить закономерности и готовить отчёты.'},
 {name:'Тестирование', ids:[3], words:['провер','ошиб','вниматель','тест'], explanation:'Проверять работу приложений и помогать команде находить ошибки.'},
 {name:'Дизайн интерфейсов', ids:[4], words:['рисов','дизайн','творч','визуал','макет'], explanation:'Продумывать внешний вид приложений и удобные сценарии для пользователей.'}
];
function interests(job) {
 const text = normalize(profile.about + ' ' + profile.role);
 return directions.filter(direction => direction.ids.includes(job.id)).flatMap(direction => direction.words.filter(word => text.includes(word)));
}
function score(job) {
  const skills = new Set(profile.skills.split(/[,\n]/).map(normalize).filter(Boolean));
  const matched = job.skills.filter(skill => skills.has(normalize(skill)));
  return {matched,percent:Math.round(matched.length / job.skills.length * 100)};
}
function tags(skills) {
  return skills.map(skill => '<span class="tag">' + skill + '</span>').join('');
}
function renderCard(job) {
  const {percent} = score(job);
  const selected = saved.has(job.id);
  const article = document.createElement('article');
  article.className = 'card glass';
  // Card markup interpolates only the bundled demo catalogue and computed values.
  article.innerHTML = `
    <div class="card-top">
      <span class="company-mark" style="background:${job.color}" aria-hidden="true">${job.mark}</span>
      <span class="company">${job.company}</span>
      <button class="save" aria-label="В избранном: ${job.title}, ${job.company}" aria-pressed="${selected}">${icon('bookmark')}</button>
    </div>
    <h3>${job.title}</h3>
    <p class="meta">${job.city} · ${job.format}</p>
    <p class="salary">${salary(job)}</p>
    <div class="tags">${tags(job.skills)}</div>
    ${percent >= 50 ? `<p class="match">✦ Может вам понравиться · ${percent}%</p>` : ''}
    <div class="card-footer"><button class="text-button" aria-label="Подробнее: ${job.title}">Подробнее <span aria-hidden="true">↗</span></button></div>`;
  const save = article.querySelector('.save');
  save.addEventListener('click', () => {
    if (saved.has(job.id)) saved.delete(job.id);
    else saved.add(job.id);
    if (!write('starter.saved', [...saved])) $('#storage-status').textContent = 'Избранное сохранено на время этой сессии.';
    if (view === 'saved') {
      render();
      (cards.querySelector('.save') || $('nav [data-view="saved"]')).focus();
    } else save.setAttribute('aria-pressed', saved.has(job.id));
  });
  article.querySelector('.text-button').addEventListener('click', () => openDetails(job));
  return article;
}
let activeJob;
function openDetails(job) {
  activeJob = job;
  $('#simplify').setAttribute('aria-pressed','false');
  $('#simplify').textContent = 'Объяснить проще';
  const {matched, percent} = score(job);
  $('#detail-title').textContent = job.title;
  $('#detail-meta').textContent = [job.company, job.city, job.format].join(' · ');
  $('#detail-salary').textContent = salary(job);
  $('#detail-description').textContent = job.description;
  $('#detail-skills').innerHTML = tags(job.skills);
  $('#detail-match').textContent = matched.length
    ? `Совпадение навыков — ${percent}%. В твоём профиле есть ${matched.join(', ')}.`
    : (interests(job).length ? 'Направление связано с интересами, указанными в твоём рассказе. Изучи требования перед откликом.' : 'Совпадений с профилем пока нет.');
  $('#detail-link').href = job.url;
  dialog.showModal();
}
const revealObserver = 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches
 ? new IntersectionObserver(entries => {
     for (const entry of entries) {
       if (entry.isIntersecting) { entry.target.classList.add('revealed'); revealObserver.unobserve(entry.target); }
     }
   }, {threshold:0.08}) : null;
let view = 'vacancies';
function render() {
  const words = normalize(query.value).split(/\s+/).filter(Boolean);
  const results = jobs.filter(job => {
    if (view === 'saved' && !saved.has(job.id)) return false;
    if (view === 'matches' && !score(job).percent && !interests(job).length) return false;
    if (format.value && job.format !== format.value) return false;
    if (!normalize(job.city).includes(normalize($('#city-filter').value))) return false;
    if (job.salary[1] < Number($('#salary-filter').value || 0)) return false;
    if ($('#entry-filter').checked && !/junior|стажёр|младший/i.test(job.title)) return false;
    const content = normalize([job.title, job.company, job.city, ...job.skills].join(' '));
    return words.every(word => content.includes(word));
  });
  if (sort.value === 'match' || (sort.value === 'default' && view === 'matches')) {
    results.sort((first, second) => (score(second).percent + interests(second).length * 20) - (score(first).percent + interests(first).length * 20));
  } else if (sort.value === 'salary') {
    results.sort((first, second) => second.salary[1] - first.salary[1]);
  }
  const suggestions = $('#directions');
  suggestions.hidden = view !== 'matches';
  suggestions.replaceChildren();
  if (view === 'matches') {
    for (const direction of directions) {
      const related = jobs.filter(job => direction.ids.includes(job.id) && (score(job).percent || interests(job).length));
      if (!related.length) continue;
      const item = document.createElement('article');
      item.className = 'direction glass';
      const title = document.createElement('h3');
      title.textContent = direction.name;
      const description = document.createElement('p');
      description.textContent = direction.explanation + ' Есть совпадения с навыками или интересами из твоего профиля.';
      item.append(title, description);
      suggestions.append(item);
    }
  }
  $('#count').textContent = 'Найдено: ' + results.length;
  cards.replaceChildren(...results.map(renderCard));
  if (typeof revealObserver !== 'undefined' && revealObserver) cards.querySelectorAll('.card').forEach(card => revealObserver.observe(card));
  const empty = $('#empty');
  empty.hidden = results.length > 0;
  if (view === 'saved' && !saved.size) empty.textContent = 'Сохрани интересную вакансию с помощью значка закладки.';
  else if (view === 'matches' && !query.value && !format.value) empty.textContent = 'Совпадений пока нет. Добавь навыки в профиль.';
  else empty.textContent = 'Вакансий по этим условиям нет. Попробуй изменить поиск или формат работы.';
}
function navigate() {
  const route = location.hash.slice(1);
  const next = Object.hasOwn(titles, route) ? route : 'vacancies';
  if (next !== view) {
    query.value = format.value = '';
    sort.value = 'default';
    for (const control of [format, sort]) control.dispatchEvent(new Event('input'));
    window.scrollTo(0, 0);
  }
  view = next;
  for (const button of document.querySelectorAll('nav button')) {
    if (button.dataset.view === (view === 'preferences' ? 'matches' : view)) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('#hero').hidden = view !== 'vacancies';
  $('#list').hidden = ['profile','preferences'].includes(view);
  $('#preferences-view').hidden = view !== 'preferences';
  $('#account-view').hidden = view !== 'profile';
  $('#preferences-link').hidden = view !== 'matches';
  $('#match-note').hidden = view !== 'matches';
  $('#list-title').textContent = titles[view];
  if (!['profile','preferences'].includes(view)) render();
}
for (const button of document.querySelectorAll('nav button')) {
  button.addEventListener('click', () => { location.hash = button.dataset.view; });
}
for (const control of [query, format, sort]) control.addEventListener('input', render);
form.addEventListener('input', () => { $('#status').textContent = ''; });
form.addEventListener('submit', event => {
  event.preventDefault();
  profile = Object.fromEntries(new FormData(form));
  const persisted = write('starter.profile', profile);
  $('#status').textContent = persisted ? 'Настройки сохранены. Подбор обновлён.' : 'Подбор обновлён на время этой сессии.';
});

const plainDescriptions = {
  1:'Ты будешь делать экраны для сервисов компании и получать данные из базы. Для работы нужны C#, Blazor и SQL.',
  2:'Ты будешь создавать страницы личного кабинета и делать их удобными, в том числе для людей с ограничениями зрения. Нужны HTML, CSS, JavaScript и React.',
  3:'Ты будешь проверять, правильно ли приложение обменивается данными, и записывать найденные ошибки. Нужны SQL, API и Postman.',
  4:'Ты будешь придумывать удобные экраны для покупателей и проверять свои идеи с пользователями. Нужны Figma, прототипирование и UX.',
  5:'Ты будешь собирать отчёты, искать ответы в данных и настраивать автоматическое получение таблиц. Нужны SQL, Python и Excel.',
  6:'Ты будешь собирать веб-страницы, исправлять их внешний вид и обсуждать код с командой. Нужны HTML, CSS и Git.'
};
$('#simplify').addEventListener('click', () => {
 const simplified = $('#simplify').getAttribute('aria-pressed') !== 'true';
 $('#simplify').setAttribute('aria-pressed', String(simplified));
 $('#simplify').textContent = simplified ? 'Показать исходное описание' : 'Объяснить проще';
 $('#detail-description').textContent = simplified ? plainDescriptions[activeJob.id] : activeJob.description;
});
const deviceTheme = matchMedia('(prefers-color-scheme: dark)');
const savedTheme = read('starter.theme', 'system');
$('#theme').value = ['system','light','dark'].includes(savedTheme) ? savedTheme : 'system';
function applyTheme() {
 const choice = $('#theme').value;
 const dark = choice === 'dark' || (choice === 'system' && deviceTheme.matches);
 document.documentElement.dataset.theme = dark ? 'dark' : 'light';
 document.querySelector('meta[name="theme-color"]').content = dark ? '#141722' : '#edf1ff';
}
$('#theme').addEventListener('change', () => { write('starter.theme', $('#theme').value); applyTheme(); });
deviceTheme.addEventListener('change', applyTheme);
applyTheme();
window.addEventListener('hashchange', navigate);
navigate();

for (const select of [format, sort, $('#theme')]) {
 const wrap = document.createElement('div');
 wrap.className = 'select-wrap';
 select.before(wrap); wrap.append(select); select.hidden = true;
 const trigger = document.createElement('button');
 trigger.type = 'button'; trigger.className = 'select-trigger';
 trigger.setAttribute('aria-haspopup','listbox'); trigger.setAttribute('aria-expanded','false');
 const label = select.getAttribute('aria-label') || 'Тема';
 const list = document.createElement('div');
 list.className = 'select-options'; list.role = 'listbox'; list.hidden = true;
 list.setAttribute('aria-label',label);
 function sync() {
   trigger.textContent = select.selectedOptions[0].textContent;
   trigger.setAttribute('aria-label',label + ': ' + trigger.textContent);
   [...list.children].forEach((option,index) => option.setAttribute('aria-selected',String(index === select.selectedIndex)));
 }
 function close() { list.hidden = true; trigger.setAttribute('aria-expanded','false'); }
 for (const option of select.options) {
   const button = document.createElement('button'); button.type='button'; button.role='option'; button.textContent=option.textContent;
   button.addEventListener('click',() => {
     select.value=option.value; select.dispatchEvent(new Event('input')); select.dispatchEvent(new Event('change'));
     sync(); close(); trigger.focus();
   }); list.append(button);
 }
 trigger.addEventListener('click',() => { const opening=list.hidden; close(); if(opening){list.hidden=false;trigger.setAttribute('aria-expanded','true');list.children[select.selectedIndex].focus();} });
 wrap.addEventListener('keydown',event => {
   if(event.key==='Escape'){close();trigger.focus();}
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
     event.preventDefault();list.hidden=false;trigger.setAttribute('aria-expanded','true');
     const items=[...list.children];let index=items.indexOf(document.activeElement);
     index=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
     items[index].focus();
   }
 });
 document.addEventListener('click',event => {if(!wrap.contains(event.target)) close();});
 wrap.addEventListener('focusout',event => {if(!wrap.contains(event.relatedTarget))close();});
 select.addEventListener('input',sync); wrap.append(trigger,list); sync();
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let framePending=false;
window.addEventListener('scroll',() => {
 if(framePending || reducedMotion.matches)return;
 framePending=true;
 requestAnimationFrame(() => {
   document.documentElement.style.setProperty('--landscape-y',Math.min(scrollY*.065,65)+'px');
   document.documentElement.style.setProperty('--mist-x',Math.min(scrollY*.035,45)+'px');
   framePending=false;
 });
},{passive:true});
let authMode='register';
const accountForm=$('#account-form');
function authTab(mode){
 authMode=mode;$('#name-label').hidden=mode==='login';accountForm.elements.name.required=mode==='register';
 accountForm.elements.password.autocomplete=mode==='register'?'new-password':'current-password';
 $('#register-tab').setAttribute('aria-pressed',String(mode==='register'));
 $('#login-tab').setAttribute('aria-pressed',String(mode==='login'));
 $('#account-submit').textContent=mode==='register'?'Создать аккаунт':'Войти';
 $('#account-status').textContent='';
}
$('#register-tab').addEventListener('click',()=>authTab('register'));
$('#login-tab').addEventListener('click',()=>authTab('login'));
function displayAccount(account){
 $('#account-guest').hidden=!!account;$('#account-member').hidden=!account;
 if(account){$('#member-name').textContent=account.name;$('#member-email').textContent=account.email;}
}

let localAccount = read('starter.account', null);
if (!localAccount || typeof localAccount.name !== 'string' || typeof localAccount.email !== 'string') localAccount = null;
displayAccount(read('starter.signedIn', false) ? localAccount : null);
accountForm.addEventListener('submit', event => {
 event.preventDefault();
 const data = Object.fromEntries(new FormData(accountForm));
 const email = data.email.trim().toLowerCase();
 if (authMode === 'login' && (!localAccount || localAccount.email !== email)) {
   $('#account-status').textContent = 'В этом браузере нет профиля с таким email. Открой вкладку регистрации.';
   return;
 }
 if (authMode === 'register') {
   const name = data.name.trim();
   if (!name) { $('#account-status').textContent = 'Укажи имя.'; return; }
   localAccount = {name, email};
   write('starter.account', localAccount);
 }
 write('starter.signedIn', true);
 displayAccount(localAccount);
 accountForm.reset();
});
$('#logout').addEventListener('click', () => {
 write('starter.signedIn', false);
 displayAccount(null);
 authTab('login');
});


for (const id of ['city-filter','salary-filter','entry-filter']) $('#'+id).addEventListener('input',render);
$('#reset-filters').addEventListener('click',()=>{
 query.value=format.value=$('#city-filter').value=$('#salary-filter').value='';
 $('#entry-filter').checked=false;sort.value='default';
 format.dispatchEvent(new Event('input'));sort.dispatchEvent(new Event('input'));render();
});
