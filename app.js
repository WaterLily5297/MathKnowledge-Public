'use strict';
const $ = id => document.getElementById(id);
const types = {book:'\u6559\u6750\u4e0e\u8bb2\u4e49','journal-article':'\u8bba\u6587','journal-issue':'\u6574\u671f\u520a\u7269',errata:'\u52d8\u8bef\u4e0e\u7248\u672c',encyclopedia:'\u767e\u79d1\u4e0e\u79bb\u7ebf\u8d44\u6599',software:'\u8f6f\u4ef6',project:'\u9879\u76ee',dataset:'\u6570\u636e\u96c6',reference:'\u53c2\u8003\u8d44\u6599'};
const languages = {en:'\u82f1\u8bed',zh:'\u4e2d\u6587',ja:'\u65e5\u8bed',fr:'\u6cd5\u8bed',de:'\u5fb7\u8bed',it:'\u610f\u5927\u5229\u8bed',es:'\u897f\u73ed\u7259\u8bed',pt:'\u8461\u8404\u7259\u8bed',ru:'\u4fc4\u8bed',und:'\u672a\u6ce8\u660e',mul:'\u591a\u79cd\u8bed\u8a00',la:'\u62c9\u4e01\u8bed'};
const subjectLabels = {'Foundations and logic':'\u6570\u5b66\u57fa\u7840\u4e0e\u903b\u8f91','Linear algebra':'\u7ebf\u6027\u4ee3\u6570',Analysis:'\u5206\u6790','Differential equations and dynamics':'\u5fae\u5206\u65b9\u7a0b\u4e0e\u52a8\u529b\u7cfb\u7edf','Algebra and representation theory':'\u4ee3\u6570\u4e0e\u8868\u793a\u8bba','Number theory':'\u6570\u8bba\u4e0e\u7b97\u672f','Algebraic geometry':'\u4ee3\u6570\u51e0\u4f55',Geometry:'\u51e0\u4f55',Topology:'\u62d3\u6251','Probability and stochastic processes':'\u6982\u7387\u4e0e\u968f\u673a\u8fc7\u7a0b','Statistics and machine learning':'\u7edf\u8ba1\u4e0e\u673a\u5668\u5b66\u4e60','Discrete mathematics and combinatorics':'\u79bb\u6563\u6570\u5b66\u4e0e\u7ec4\u5408','Applied and computational mathematics':'\u5e94\u7528\u4e0e\u8ba1\u7b97\u6570\u5b66','General reference and tools':'\u7efc\u5408\u8d44\u6599\u4e0e\u5de5\u5177'};
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
 document.title = ({home:'\u9996\u9875',catalog:'\u76ee\u5f55',about:'\u8bf4\u660e'})[view] + ' \u00b7 Formosa \u6570\u5b66\u9605\u89c8\u5ba4';
}
function showCatalog() {
 if (location.hash === '#catalog') route(); else location.hash = 'catalog';
}
function render() {
 const query = $('query').value.trim().toLocaleLowerCase('en');
 const subject = $('subject').value, kind = $('type').value, language = $('language').value;
 const rows = data.items.filter(row => {
  const terms = [row.title, row.authors, row.year, ...row.subjects.flatMap(id => [data.labels.get(id), data.originalLabels.get(id)])];
  return (!subject || row.subjects.includes(subject)) && (!kind || row.type === kind)
   && (!language || row.language === language)
   && (!query || terms.filter(Boolean).join(' ').toLocaleLowerCase('en').includes(query));
 });
 const pages = Math.max(1, Math.ceil(rows.length / size));
 page = Math.max(1, Math.min(page, pages));
 $('result-count').textContent = rows.length.toLocaleString('zh-CN') + ' \u9879\u5339\u914d\u8d44\u6599';
 $('results').replaceChildren();
 for (const row of rows.slice((page - 1) * size, page * size)) {
  const tr = element('tr'), title = element('td'), subject = element('td'), edition = element('td'), source = element('td');
  title.append(sourceLink(row, row.title, 'title-link'), element('span', row.authors, 'author'));
  subject.append(element('span', row.subjects.map(id => data.labels.get(id) || id).join(' / ') || '\u672a\u5206\u7c7b', 'subject-list'), element('span', types[row.type] || '\u8d44\u6599', 'resource-meta'));
  edition.append(element('span', row.year || '\u2014'), element('span', languages[row.language] || row.language, 'resource-meta'));
  source.append(sourceLink(row, '\u539f\u59cb\u6765\u6e90 \u2197', 'source-link'));
  tr.append(title, subject, edition, source); $('results').append(tr);
 }
 if (!rows.length) {
  const tr = element('tr'), cell = element('td', '\u6ca1\u6709\u5339\u914d\u8d44\u6599\uff0c\u8bf7\u66f4\u6362\u5173\u952e\u8bcd\u6216\u91cd\u7f6e\u7b5b\u9009\u3002', 'empty');
  cell.colSpan = 4; tr.append(cell); $('results').append(tr);
 }
 $('results').setAttribute('aria-busy', 'false');
 $('page-label').textContent = '\u7b2c ' + page + ' / ' + pages + ' \u9875';
 $('previous').disabled = page === 1; $('next').disabled = page === pages;
}
function renderSubjects() {
 $('subject-rows').replaceChildren();
 const subjects = data.subjects.map(subject => ({...subject, count:data.items.filter(row => row.subjects.includes(subject.id)).length})).sort((a,b) => b.count - a.count);
 for (const subject of subjects) {
  const tr = element('tr'), name = element('th'), count = element('td', subject.count.toLocaleString('zh-CN'));
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
  if (!response.ok) throw Error('\u76ee\u5f55\u6682\u65f6\u4e0d\u53ef\u7528');
  data = await response.json();
  if (data.schema !== 1 || !Array.isArray(data.items) || !Array.isArray(data.subjects)) throw Error('\u76ee\u5f55\u683c\u5f0f\u4e0d\u6b63\u786e');
  data.originalLabels = new Map(data.subjects.map(subject => [subject.id, subject.label]));
  data.labels = new Map(data.subjects.map(subject => [subject.id, subjectLabels[subject.label] || subject.label]));
  $('total').textContent = data.items.length.toLocaleString('zh-CN');
  $('updated').textContent = '\u76ee\u5f55\u66f4\u65b0 ' + data.updated;
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
  const message = '\u76ee\u5f55\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\u3002';
  $('updated').textContent = '\u76ee\u5f55\u6682\u65f6\u4e0d\u53ef\u7528'; $('result-count').textContent = message;
  $('subject-rows').replaceChildren();
  const tr = element('tr'), cell = element('td', message); cell.colSpan = 2; tr.append(cell); $('subject-rows').append(tr);
  $('results').setAttribute('aria-busy', 'false');
 }
}
initTheme();
window.addEventListener('hashchange', route);
route(); start();
