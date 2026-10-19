'use strict';
const $ = id => document.getElementById(id);
const i18n = window.FormosaI18n;
const t = (key, english, vars) => i18n.t(key, english, vars);
const types = {book:'Books and lecture notes','journal-article':'Papers','journal-issue':'Journal issues',errata:'Errata and editions',encyclopedia:'Encyclopedias and reference collections',software:'Software',project:'Projects',dataset:'Datasets',reference:'Reference material'};
const languages = {en:'English',zh:'Chinese',ja:'Japanese',fr:'French',de:'German',it:'Italian',es:'Spanish',pt:'Portuguese',ru:'Russian',und:'Unspecified',mul:'Multiple languages',la:'Latin'};
const pageTitles = {home:'Home',catalog:'Catalog',about:'About'};
const size = 20;
let data, localReader, features, page = 1;
const element = (tag, content, className) => {
 const node = document.createElement(tag);
 if (content !== undefined) node.textContent = content;
 if (className) node.className = className;
 return node;
};
const subjectLabel = id => i18n.subject(id, data.labels.get(id) || id);
const typeLabel = kind => i18n.type(kind, types[kind] || kind);
const languageLabel = code => i18n.language(code, languages[code] || code);
function option(select, value, label) {
 const node = element('option', label); node.value = value; select.append(node);
}
function fillOptions(select, values, label) {
 const current = select.value;
 select.replaceChildren(select.options[0]);
 for (const value of values) option(select, value, label(value));
 select.value = current;
}
function sourceLink(row, title, className) {
 const link = element('a', title, className);
 link.href = row.source; link.target = '_blank'; link.rel = 'noopener noreferrer';
 return link;
}
function titleLink(row) {
 if (data.shared_pdfs && data.shared_pdfs[row.id]) {
  const link = sourceLink({...row,source:'read/'+encodeURIComponent(row.id)}, '', 'title-link');
  window.FormosaReader.renderTitle(link, row.title); return link;
 }
 const local = localReader && localReader.has(row.id);
 const title = local ? element('button', undefined, 'title-link') : sourceLink(row, '', 'title-link');
 if (local) {
  title.type = 'button'; title.title = t('catalog.openLocal', 'Open local PDF');
  title.addEventListener('click', () => localReader.open(row.id));
 }
 window.FormosaReader.renderTitle(title, row.title);
 return title;
}
function route() {
 const requested = location.hash.slice(1);
 const view = ['home', 'catalog', 'search', 'shelf', 'paths', 'about'].includes(requested) ? requested : 'home';
 document.querySelectorAll('[data-view]').forEach(section => { section.hidden = section.dataset.view !== view; });
 document.querySelectorAll('[data-nav]').forEach(link => {
  if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
 });
 document.title = ({home:'Home',catalog:'Catalog',search:'Full-text search',shelf:'Bookshelf',paths:'Reading paths',about:'About'})[view] + ' - Formosa Mathematics Reading Room';
 if(view==='shelf'&&features)features.renderShelf();
}
function showCatalog() {
 if (location.hash === '#catalog') route(); else location.hash = 'catalog';
}
function render() {
 const query = $('query').value.trim().toLocaleLowerCase();
 const subject = $('subject').value, kind = $('type').value, language = $('language').value;
 const rows = data.items.filter(row => {
  const terms = [row.title, row.authors, row.year, ...row.subjects.map(id => data.labels.get(id))];
  return (!subject || row.subjects.includes(subject)) && (!kind || row.type === kind)
   && (!$('available-only').checked || (data.shared_pdfs && data.shared_pdfs[row.id]))
   && (!language || row.language === language)
   && (!query || terms.filter(Boolean).join(' ').toLocaleLowerCase('en').includes(query));
 });
 const pages = Math.max(1, Math.ceil(rows.length / size));
 page = Math.max(1, Math.min(page, pages));
 const count = i18n.number(rows.length);
 $('result-count').textContent = t('catalog.count', rows.length === 1 ? '{n} matching resource' : '{n} matching resources', {n:count});
 $('results').replaceChildren();
 for (const row of rows.slice((page - 1) * size, page * size)) {
  const tr = element('tr'), title = element('td'), subject = element('td'), edition = element('td'), source = element('td');
  title.append(titleLink(row), element('span', row.authors, 'author'));
  if (localReader && localReader.has(row.id)) title.append(element('span', t('catalog.localPdf', 'Local PDF linked'), 'resource-meta local-tag'));
  const list = element('span', undefined, 'subject-list');
  if (row.subjects.length) {
   row.subjects.forEach((id, index) => {
    if (index) list.append(element('span', ' / ', 'subject-sep'));
    list.append(element('span', subjectLabel(id)));
   });
  } else list.textContent = t('catalog.unclassified', 'Unclassified');
  subject.append(list, element('span', typeLabel(row.type) || t('catalog.resource', 'Resource'), 'resource-meta type-tag'));
  edition.append(element('span', row.year || '—', 'year'), element('span', languageLabel(row.language), 'resource-meta'));
  source.append(sourceLink(row, t('catalog.source', 'Original source ↗'), 'source-link'));
  if (data.shared_pdfs && data.shared_pdfs[row.id]) title.append(element('span', 'Read PDF - '+data.shared_pdfs[row.id].license, 'resource-meta'));
  const details=element('button','Details / save','text-button');details.type='button';details.addEventListener('click',()=>features.details(row.id));title.append(details);
  tr.append(title, subject, edition, source); $('results').append(tr);
 }
 if (!rows.length) {
  const tr = element('tr'), cell = element('td', t('catalog.empty', 'No matching resources. Try another query or reset the filters.'), 'empty');
  // Titles are published in English, so a query in another script rarely matches a title.
  if (/[^\x00-\x7f]/.test(query)) cell.append(element('span', t('catalog.empty.english', 'Titles are listed in English; try English keywords too.'), 'empty-hint'));
  cell.colSpan = 4; tr.append(cell); $('results').append(tr);
 }
 $('results').setAttribute('aria-busy', 'false');
 $('page-label').textContent = t('catalog.page', 'Page {page} of {pages}', {page:i18n.number(page), pages:i18n.number(pages)});
 $('previous').disabled = page === 1; $('next').disabled = page === pages;
}
function renderSubjects() {
 $('subject-rows').replaceChildren();
 const counted=data.shared_pdfs?data.items.filter(row=>data.shared_pdfs[row.id]):data.items;
 const subjects = data.subjects.map(subject => ({...subject, count:counted.filter(row => row.subjects.includes(subject.id)).length})).sort((a,b) => b.count - a.count);
 const largest = Math.max(1, ...subjects.map(subject => subject.count));
 for (const subject of subjects) {
  const tr = element('tr'), name = element('th'), count = element('td', i18n.number(subject.count));
  name.scope = 'row';
  const button = element('button', subjectLabel(subject.id));
  button.type = 'button'; button.dataset.subject = subject.id;
  button.addEventListener('click', () => filterBy({subject:subject.id}));
  // A thin rule under each subject shows its share of the largest subject.
  const share = element('span', undefined, 'share');
  share.setAttribute('aria-hidden', 'true');
  share.style.setProperty('--share', (subject.count / largest).toFixed(4));
  name.append(button, share); tr.append(name, count); $('subject-rows').append(tr);
 }
}
function renderMeta() {
 $('total').textContent = i18n.number(data.items.length);
 $('updated').textContent = t('catalog.updated', 'Catalog updated {date}', {date:data.updated});
 const japanese = data.items.filter(row => row.language === 'ja').length;
 $('featured-japanese').hidden = !japanese;
 $('japanese-count').textContent = japanese ? '(' + t('featured.ja.count', '{n} resources', {n:i18n.number(japanese)}) + ')' : '';
 fillOptions($('subject'), data.subjects.map(subject => subject.id), subjectLabel);
 fillOptions($('type'), [...new Set(data.items.map(row => row.type))].sort(), typeLabel);
 fillOptions($('language'), [...new Set(data.items.map(row => row.language))].sort(), languageLabel);
}
function filterBy({subject = '', kind = '', language = ''}) {
 $('filters').reset();
 if (subject && !data.labels.has(subject)) return;
 $('subject').value = subject; $('type').value = kind; $('language').value = language;
 page = 1; render(); showCatalog();
}
function initTheme() {
 const allowed = ['system','light','dark','night'];
 function apply(value) {
  if (value === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = value;
  $('theme').value = value;
 }
 let preference = 'system';
 try { const saved = localStorage.getItem('formosa-theme'); if (allowed.includes(saved)) preference = saved; } catch (_) {}
 apply(preference);
 $('theme').addEventListener('change', () => {
  const value = allowed.includes($('theme').value) ? $('theme').value : 'system';
  apply(value); try { localStorage.setItem('formosa-theme', value); } catch (_) {}
 });
}
function initLanguage() {
 i18n.apply();
 document.querySelectorAll('[data-lang-choice]').forEach(button => {
  button.addEventListener('click', () => i18n.set(button.dataset.langChoice));
 });
 i18n.onChange(() => {
  route();
  if (!data) return;
  renderMeta(); renderSubjects(); render();
 });
}
async function start() {
 try {
  const response = await fetch('catalog.json', {cache:'no-cache'});
  if (!response.ok) throw Error('Catalog temporarily unavailable');
  data = await response.json();
  if (data.schema !== 1 || !Array.isArray(data.items) || !Array.isArray(data.subjects)) throw Error('Invalid catalog format');
  data.labels = new Map(data.subjects.map(subject => [subject.id, subject.label]));
  localReader = window.FormosaReader.init(data.items, render);
  features=window.FormosaFeatures.init(data,{element,titleLink,localReader});
  if(data.shared_pdfs){$('local-library').hidden=true;$('shared-banner').hidden=false;$('shared-status').textContent=Object.keys(data.shared_pdfs).length+' PDFs available for public reading and full-text search.';$('available-control').hidden=false;$('available-only').checked=true;$('live-library').hidden=true;}
  else if($('live-library').dataset.expires && Date.parse($('live-library').dataset.expires)<Date.now())$('live-library').hidden=true;
  renderMeta();
  $('filters').addEventListener('submit', event => event.preventDefault());
  for (const id of ['query','subject','type','language','available-only']) $(id).addEventListener(id === 'query' ? 'input' : 'change', () => { page = 1; render(); });
  $('home-search').addEventListener('submit', event => {
   event.preventDefault(); $('filters').reset(); $('query').value = $('home-query').value; page = 1; render(); showCatalog();
  });
  $('clear').addEventListener('click', () => { $('filters').reset(); page = 1; render(); $('query').focus(); });
  $('previous').addEventListener('click', () => { page--; render(); $('catalog-title').scrollIntoView(); });
  $('next').addEventListener('click', () => { page++; render(); $('catalog-title').scrollIntoView(); });
  renderSubjects();
  document.querySelectorAll('.j-features [data-subject]').forEach(button => {
   button.addEventListener('click', () => filterBy({subject:button.dataset.subject}));
  });
  document.querySelectorAll('[data-language]').forEach(button => {
   button.addEventListener('click', () => filterBy({language:button.dataset.language}));
  });
  document.querySelectorAll('[data-kind]').forEach(link => {
   link.addEventListener('click', () => filterBy({kind:link.dataset.kind}));
  });
  render();
 } catch (_) {
  const message = t('catalog.failed', 'Catalog could not be loaded. Refresh the page to try again.');
  $('updated').textContent = t('catalog.unavailable', 'Catalog temporarily unavailable'); $('result-count').textContent = message;
  $('subject-rows').replaceChildren();
  const tr = element('tr'), cell = element('td', message); cell.colSpan = 2; tr.append(cell); $('subject-rows').append(tr);
  $('results').setAttribute('aria-busy', 'false');
 }
}
initTheme();
initLanguage();
$('updated').textContent = t('catalog.updating', 'Updating catalog...');
window.addEventListener('hashchange', route);
route(); start();
