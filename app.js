'use strict';
const $ = id => document.getElementById(id);
const types = {book:'Books and lecture notes','journal-article':'Papers','journal-issue':'Journal issues',errata:'Errata and editions',encyclopedia:'Encyclopedias and reference collections',software:'Software',project:'Projects',dataset:'Datasets',reference:'Reference material'};
const languages = {en:'English',zh:'Chinese',ja:'Japanese',fr:'French',de:'German',it:'Italian',es:'Spanish',pt:'Portuguese',ru:'Russian',und:'Unspecified',mul:'Multiple languages',la:'Latin'};
const size = 20;
let data, page = 1;
const element = (tag, content, className) => {
 const node = document.createElement(tag);
 if (content !== undefined) node.textContent = content;
 if (className) node.className = className;
 return node;
};
function option(select, value, label) {
 const node = element('option', label); node.value = value; select.append(node);
}
function sourceLink(row, title, className) {
 const link = element('a', title, className);
 link.href = row.source; link.target = '_blank'; link.rel = 'noopener noreferrer';
 return link;
}
function route() {
 const requested = location.hash.slice(1);
 const view = ['home', 'catalog', 'about'].includes(requested) ? requested : 'home';
 document.querySelectorAll('[data-view]').forEach(section => { section.hidden = section.dataset.view !== view; });
 document.querySelectorAll('[data-nav]').forEach(link => {
  if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
 });
 document.title = ({home:'Home',catalog:'Catalog',about:'About'})[view] + ' - Formosa Mathematics Reading Room';
}
function showCatalog() {
 if (location.hash === '#catalog') route(); else location.hash = 'catalog';
}
function render() {
 const query = $('query').value.trim().toLocaleLowerCase('en');
 const subject = $('subject').value, kind = $('type').value, language = $('language').value;
 const rows = data.items.filter(row => {
  const terms = [row.title, row.authors, row.year, ...row.subjects.map(id => data.labels.get(id))];
  return (!subject || row.subjects.includes(subject)) && (!kind || row.type === kind)
   && (!language || row.language === language)
   && (!query || terms.filter(Boolean).join(' ').toLocaleLowerCase('en').includes(query));
 });
 const pages = Math.max(1, Math.ceil(rows.length / size));
 page = Math.max(1, Math.min(page, pages));
 $('result-count').textContent = rows.length.toLocaleString('en-US') + (rows.length === 1 ? ' matching resource' : ' matching resources');
 $('results').replaceChildren();
 for (const row of rows.slice((page - 1) * size, page * size)) {
  const tr = element('tr'), title = element('td'), subject = element('td'), edition = element('td'), source = element('td');
  title.append(sourceLink(row, row.title, 'title-link'), element('span', row.authors, 'author'));
  subject.append(element('span', row.subjects.map(id => data.labels.get(id) || id).join(' / ') || 'Unclassified', 'subject-list'), element('span', types[row.type] || 'Resource', 'resource-meta'));
  edition.append(element('span', row.year || '—'), element('span', languages[row.language] || row.language, 'resource-meta'));
  source.append(sourceLink(row, 'Original source ↗', 'source-link'));
  tr.append(title, subject, edition, source); $('results').append(tr);
 }
 if (!rows.length) {
  const tr = element('tr'), cell = element('td', 'No matching resources. Try another query or reset the filters.', 'empty');
  cell.colSpan = 4; tr.append(cell); $('results').append(tr);
 }
 $('results').setAttribute('aria-busy', 'false');
 $('page-label').textContent = 'Page ' + page + ' of ' + pages;
 $('previous').disabled = page === 1; $('next').disabled = page === pages;
}
function renderSubjects() {
 $('subject-rows').replaceChildren();
 const subjects = data.subjects.map(subject => ({...subject, count:data.items.filter(row => row.subjects.includes(subject.id)).length})).sort((a,b) => b.count - a.count);
 for (const subject of subjects) {
  const tr = element('tr'), name = element('th'), count = element('td', subject.count.toLocaleString('en-US'));
  name.scope = 'row';
  const button = element('button', data.labels.get(subject.id));
  button.type = 'button'; button.dataset.subject = subject.id;
  name.append(button); tr.append(name, count); $('subject-rows').append(tr);
 }
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
async function start() {
 try {
  const response = await fetch('catalog.json', {cache:'no-cache'});
  if (!response.ok) throw Error('Catalog temporarily unavailable');
  data = await response.json();
  if (data.schema !== 1 || !Array.isArray(data.items) || !Array.isArray(data.subjects)) throw Error('Invalid catalog format');
  data.labels = new Map(data.subjects.map(subject => [subject.id, subject.label]));
  $('total').textContent = data.items.length.toLocaleString('en-US');
  $('updated').textContent = 'Catalog updated ' + data.updated;
  for (const subject of data.subjects) option($('subject'), subject.id, data.labels.get(subject.id));
  for (const kind of [...new Set(data.items.map(row => row.type))].sort()) option($('type'), kind, types[kind] || kind);
  for (const language of [...new Set(data.items.map(row => row.language))].sort()) option($('language'), language, languages[language] || language);
  $('filters').addEventListener('submit', event => event.preventDefault());
  for (const id of ['query','subject','type','language']) $(id).addEventListener(id === 'query' ? 'input' : 'change', () => { page = 1; render(); });
  $('home-search').addEventListener('submit', event => {
   event.preventDefault(); $('filters').reset(); $('query').value = $('home-query').value; page = 1; render(); showCatalog();
  });
  $('clear').addEventListener('click', () => { $('filters').reset(); page = 1; render(); $('query').focus(); });
  $('previous').addEventListener('click', () => { page--; render(); $('catalog-title').scrollIntoView(); });
  $('next').addEventListener('click', () => { page++; render(); $('catalog-title').scrollIntoView(); });
  renderSubjects();
  document.querySelectorAll('[data-subject]').forEach(button => {
   button.addEventListener('click', () => {
    if (!data.labels.has(button.dataset.subject)) return;
    $('filters').reset(); $('subject').value = button.dataset.subject; page = 1; render(); showCatalog();
   });
  });
  document.querySelectorAll('[data-kind]').forEach(link => {
   link.addEventListener('click', () => { $('filters').reset(); $('type').value = link.dataset.kind; page = 1; render(); showCatalog(); });
  });
  render();
 } catch (_) {
  const message = 'Catalog could not be loaded. Refresh the page to try again.';
  $('updated').textContent = 'Catalog temporarily unavailable'; $('result-count').textContent = message;
  $('subject-rows').replaceChildren();
  const tr = element('tr'), cell = element('td', message); cell.colSpan = 2; tr.append(cell); $('subject-rows').append(tr);
  $('results').setAttribute('aria-busy', 'false');
 }
}
initTheme();
window.addEventListener('hashchange', route);
route(); start();
