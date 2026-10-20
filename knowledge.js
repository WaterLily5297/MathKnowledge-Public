'use strict';
// Knowledge desk: Formosa-authored concept notes from the live gateway's read-only
// /knowledge routes. GitHub Pages has no such service, so the desk stays hidden there
// and never contacts another host. Related PDFs come from each fresh detail response,
// because the owner can withdraw a PDF at any time.
window.FormosaKnowledge = {init(options) {
 const $ = id => document.getElementById(id), el = options.element;
 const t = (key, english, vars) => window.FormosaI18n.t(key, english, vars);
 const rich = window.FormosaRichText;
 const identifier = /^[a-z][a-z0-9-]{0,79}$/, bookIdentifier = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/;
 const narrow = window.matchMedia ? window.matchMedia('(max-width: 900px)') : {matches:false};
 let subjects = new Map(), rows = [], selected = '', trail = [], listRequest = 0, detailRequest = 0;
 let started = false, visible = false, timer = 0, booksSnapshot = null, exercisesSnapshot = null;
 let reviewed = new Set(), storageAvailable = true;
 try {
  const saved = JSON.parse(localStorage.getItem('formosa-reviewed-concepts-v1') || '[]');
  // Match the bounded concept capacity of the offline reference index.
  if (Array.isArray(saved)) reviewed = new Set(saved.filter(id => identifier.test(id)).slice(0, 512));
 } catch (_) { storageAvailable = false; }
 // Spaced review, kept in this browser only: a reviewed concept comes back after 1, 3, 7,
 // 14, 30 and 60 days while it is remembered, and after one day when it needs another look.
 const SCHEDULE = 'formosa-review-schedule-v1', INTERVALS = [1, 3, 7, 14, 30, 60], day = /^\d{4}-\d{2}-\d{2}$/;
 let schedule = new Map();
 try {
  const saved = JSON.parse(localStorage.getItem(SCHEDULE) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved))
   for (const [id, item] of Object.entries(saved).slice(0, 512))
    if (identifier.test(id) && item && day.test(item.due) && Number.isInteger(item.level)
        && item.level >= 0 && item.level < INTERVALS.length)
     schedule.set(id, {due:item.due, level:item.level, title:typeof item.title === 'string' ? item.title.slice(0, 100) : ''});
 } catch (_) { storageAvailable = false; }
 // Concepts reviewed before scheduling existed are due today; unreviewed ones leave the queue.
 for (const id of reviewed) if (!schedule.has(id)) schedule.set(id, {due:dateKey(), level:0, title:''});
 for (const id of [...schedule.keys()]) if (!reviewed.has(id)) schedule.delete(id);
 function dateKey(offset = 0) {
  const date = new Date(); date.setDate(date.getDate() + offset);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
 }
 function saveSchedule() {
  try { localStorage.setItem(SCHEDULE, JSON.stringify(Object.fromEntries(schedule))); }
  catch (_) { storageAvailable = false; }
 }
 function conceptName(id, item) { return item.title || id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '); }
 function drawReview() {
  const today = dateKey();
  const due = [...schedule].filter(([, item]) => item.due <= today).sort((a, b) => a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
  const upcoming = [...schedule.values()].map(item => item.due).filter(value => value > today).sort()[0];
  $('knowledge-review').hidden = !schedule.size;
  $('knowledge-review-status').textContent = due.length
   ? (due.length === 1 ? '1 concept is due.' : due.length + ' concepts are due.') + ' Try each self-check before opening its help, then record how it went.'
   : 'Nothing is due today.' + (upcoming ? ' Next review: ' + upcoming + '.' : '');
  const items = due.slice(0, 12).map(([id, item]) => {
   const button = el('button', undefined, 'text-button'), name = el('span'); button.type = 'button';
   inline(name, conceptName(id, item)); button.append(name);
   button.addEventListener('click', () => choose(id, {from:'', focus:true}));
   const entry = el('li'); entry.append(button); return entry;
  });
  if (due.length > 12) items.push(el('li', 'and ' + (due.length - 12) + ' more', 'subtle'));
  $('knowledge-review-list').replaceChildren(...items);
 }
 function drawRecall() {
  const item = schedule.get(selected), due = Boolean(item) && item.due <= dateKey();
  $('knowledge-recall').hidden = !item;
  $('knowledge-recall-yes').hidden = !due; $('knowledge-recall-no').hidden = !due;
  if (item) $('knowledge-recall-text').textContent = due
   ? 'Due for review today. Try the self-check without the help, then record how it went.'
   : 'In your review queue. Next review: ' + item.due + '.';
 }
 function recordRecall(remembered) {
  const item = schedule.get(selected);
  if (!item || item.due > dateKey()) return;
  const level = remembered ? Math.min(item.level + 1, INTERVALS.length - 1) : 0;
  schedule.set(selected, {...item, level, due:dateKey(INTERVALS[level])});
  saveSchedule(); drawRecall(); drawReview();
  $('knowledge-recall-text').textContent = (remembered ? 'Recorded as remembered.' : 'Recorded; it will come back tomorrow.')
   + ' Next review: ' + schedule.get(selected).due + '.' + (storageAvailable ? '' : ' Browser storage is unavailable; this lasts only for this visit.');
  // The answer buttons hide themselves, so focus moves to the result.
  $('knowledge-recall-text').focus({preventScroll:true});
 }
 // Prerequisite links of every concept seen in a list or detail response, for the map.
 const graph = new Map();
 function remember(row) {
  if (!identifier.test(row.id)) return;
  graph.set(row.id, {title:row.title, prerequisites:(row.prerequisites || []).map(item => item.id).filter(id => identifier.test(id))});
 }
 // Everything that leads to the concept, in layers by the longest chain back to it, so
 // each layer can be studied after the ones above it.
 function drawMap(row) {
  const depth = new Map(), stack = [[row.id, 0]];
  while (stack.length) {
   const [id, level] = stack.pop(), node = graph.get(id);
   for (const parent of node ? node.prerequisites : [])
    if (parent !== row.id && (depth.get(parent) || 0) < level + 1 && level < graph.size) { depth.set(parent, level + 1); stack.push([parent, level + 1]); }
  }
  const layers = new Map();
  for (const [id, level] of depth) layers.set(level, [...(layers.get(level) || []), id]);
  const done = [...depth.keys()].filter(id => reviewed.has(id)).length;
  $('knowledge-map-heading').hidden = !depth.size; $('knowledge-map').hidden = !depth.size;
  if (!depth.size) { $('knowledge-map').replaceChildren(); return; }
  const summary = el('p', (depth.size === 1 ? '1 concept leads here' : depth.size + ' concepts lead here') + '; ' + done + ' reviewed in this browser.', 'subtle');
  const list = el('ol', undefined, 'concept-map-layers');
  for (const level of [...layers.keys()].sort((a, b) => b - a)) {
   const item = el('li'), chips = el('div', undefined, 'concept-map-chips');
   item.append(el('span', level === 1 ? 'Directly needed' : level + ' steps back', 'concept-map-step'));
   for (const id of layers.get(level).sort((a, b) => graph.get(a).title.localeCompare(graph.get(b).title))) {
    const button = el('button', undefined, reviewed.has(id) ? 'concept-chip reviewed' : 'concept-chip'), name = el('span');
    button.type = 'button'; inline(name, graph.get(id).title); button.append(name);
    if (reviewed.has(id)) button.append(el('span', ' ✓', 'concept-chip-mark'), el('span', ' (reviewed)', 'sr-only'));
    button.addEventListener('click', () => choose(id, {from:row, focus:true}));
    chips.append(button);
   }
   item.append(chips); list.append(item);
  }
  const current = el('li', undefined, 'concept-map-current'), name = el('span');
  inline(name, row.title); current.append(el('span', 'This concept', 'concept-map-step'), name); list.append(current);
  $('knowledge-map').replaceChildren(summary, list);
 }
 function studyProgress() {
  $('knowledge-progress').textContent = reviewed.size + ' concepts reviewed in this browser.'
   + (storageAvailable ? '' : ' Browser storage is unavailable; changes last only for this visit.');
  $('knowledge-reviewed').textContent = reviewed.has(selected) ? 'Mark as not reviewed' : 'Mark as reviewed';
  $('knowledge-reviewed').setAttribute('aria-pressed', String(reviewed.has(selected)));
 }

 class Unavailable extends Error {}
 async function json(path) {
  let response;
  try { response = await fetch(path, {cache:'no-store', credentials:'same-origin'}); }
  catch (_) { throw new Unavailable(t('knowledge.offline', 'The reference service did not respond. Check that the library computer is online, then try again.')); }
  if (response.status === 404) return null;
  if (!response.ok) throw new Unavailable(response.status === 503
   ? t('knowledge.notLoaded', 'The reference index is not loaded on the library computer.')
   : t('knowledge.failed', 'The reference service could not answer this request.'));
  return response.json();
 }
 function block(target, text) { rich.renderBlock(target, text, {links:false}); }
 // The self-check's hint and solution sketch stay closed and are rendered on first opening,
 // so the answer is not on screen (or in find-in-page) until the reader asks for it.
 function practice(target, hint, solution) {
  const items = [[t('knowledge.hint', 'Hint'), hint], [t('knowledge.solution', 'Solution sketch'), solution]]
   .filter(([, text]) => typeof text === 'string' && text.trim()).map(([name, text]) => {
    const item = el('details', undefined, 'practice-item'), body = el('div', undefined, 'rich-text practice-body');
    let drawn = false;
    item.append(el('summary', name), body);
    item.addEventListener('toggle', () => { if (item.open && !drawn) { drawn = true; block(body, text); } });
    return item;
   });
  target.replaceChildren(...items); target.hidden = !items.length;
 }
 function inline(target, text) { rich.renderInline(target, text, {links:false}); }
 // Only the fixed Banana Space host is ever linked, and only over HTTPS.
 function sourceUrl(value) {
  try {
   const url = new URL(value);
   if (url.protocol === 'https:' && ['www.bananaspace.org', 'bananaspace.org'].includes(url.hostname)
       && !url.username && !url.password) return url.href;
  } catch (_) {}
  return '';
 }
 function showError(message) {
  $('knowledge-error-text').textContent = message || '';
  $('knowledge-error').hidden = !message;
 }
 function subjectLabel(id) { return subjects.get(id) || id; }

 function drawList() {
  const buttons = rows.map(row => {
   const button = el('button', undefined, 'concept-row');
   button.type = 'button'; button.dataset.concept = row.id;
   button.setAttribute('aria-pressed', String(row.id === selected));
   const title = el('span', undefined, 'concept-title'), preview = el('span', undefined, 'concept-preview');
   inline(title, row.title);
   // The first paragraph is enough to recognise a concept in the list.
   inline(preview, row.summary_md.split(/\n\s*\n/)[0]);
   button.append(el('span', subjectLabel(row.subject), 'concept-subject'), title, preview,
    el('span', reviewed.has(row.id) ? 'Reviewed' : 'Not reviewed', 'concept-study-state'));
   button.addEventListener('click', () => choose(row.id, {from:''}));
   button.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const all = [...$('knowledge-list').querySelectorAll('.concept-row')];
    const next = all[all.indexOf(button) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) { event.preventDefault(); next.focus(); }
   });
   return button;
  });
  $('knowledge-list').replaceChildren(...buttons);
 }
 function markSelected() {
  for (const button of $('knowledge-list').querySelectorAll('.concept-row'))
   button.setAttribute('aria-pressed', String(button.dataset.concept === selected));
 }
 function clearDetail(title, note) {
  ++detailRequest;
  booksSnapshot = exercisesSnapshot = null;
  $('knowledge-detail').setAttribute('aria-busy', 'false');
  $('knowledge-detail-subject').textContent = t('knowledge.note', 'Reference note');
  $('knowledge-detail-title').textContent = title;
  $('knowledge-summary').replaceChildren(); if (note) $('knowledge-summary').append(el('p', note, 'subtle'));
  for (const id of ['knowledge-formula', 'knowledge-practice', 'knowledge-pitfall', 'knowledge-exercises-list',
   'knowledge-prerequisites', 'knowledge-books', 'knowledge-trail'])
   $(id).replaceChildren();
  for (const id of ['knowledge-formula', 'knowledge-practice', 'knowledge-pitfall', 'knowledge-exercises', 'knowledge-trail']) $(id).hidden = true;
  $('knowledge-detail-sections').hidden = true;
  $('knowledge-reviewed').hidden = true; $('knowledge-recall').hidden = true;
 }
 function bookEntry(book, conceptTitle) {
  const item = el('li', undefined, 'knowledge-book');
  if (!bookIdentifier.test(book.id) || book.read_url !== '/read/' + book.id) return null;
  const link = el('a', undefined, 'knowledge-book-title');
  link.href = 'read/' + encodeURIComponent(book.id); link.target = '_blank'; link.rel = 'noopener noreferrer';
  window.FormosaReader.renderTitle(link, book.title);
  item.append(link, el('span', book.authors, 'author'));
  const actions = el('span', undefined, 'knowledge-book-actions');
  const read = el('a', t('knowledge.readPdf', 'Read the shared PDF ↗'));
  read.href = link.href; read.target = '_blank'; read.rel = 'noopener noreferrer';
  actions.append(read);
  if (options.details && options.hasBook(book.id)) {
   const details = el('button', t('catalog.details', 'Details / save'), 'text-button'); details.type = 'button';
   details.addEventListener('click', () => options.details(book.id));
   actions.append(details);
  }
  const search = el('a', 'Search inside this book');
  search.href = '#search?' + new URLSearchParams({query:conceptTitle, book:book.id}); actions.append(search);
  item.append(actions);
  return item;
 }
 function drawDetail(row) {
  remember(row);
  $('knowledge-detail-subject').textContent = subjectLabel(row.subject);
  inline($('knowledge-detail-title'), row.title);
  // The self-check's help sits directly under it, before the common pitfall.
  const marker = '\n\n### Common pitfall\n', at = row.summary_md.indexOf(marker);
  block($('knowledge-summary'), at < 0 ? row.summary_md : row.summary_md.slice(0, at));
  practice($('knowledge-practice'), row.hint_md, row.solution_md);
  $('knowledge-pitfall').hidden = at < 0;
  if (at < 0) $('knowledge-pitfall').replaceChildren();
  else block($('knowledge-pitfall'), row.summary_md.slice(at + 2));
  $('knowledge-formula').hidden = !row.formula;
  if (row.formula) block($('knowledge-formula'), '$$\n' + row.formula + '\n$$');
  drawExercises(row);
  $('knowledge-detail-sections').hidden = false;
  $('knowledge-reviewed').hidden = false; studyProgress();
  const queued = schedule.get(row.id);
  if (queued && queued.title !== row.title.slice(0, 100)) { queued.title = row.title.slice(0, 100); saveSchedule(); drawReview(); }
  drawRecall();
  const back = trail[trail.length - 1];
  $('knowledge-trail').hidden = !back;
  if (back) {
   const button = el('button', '', 'text-button'); button.type = 'button';
   button.append('← ' + t('knowledge.back', 'Back to') + ' ');
   const name = el('span'); inline(name, back.title); button.append(name);
   button.addEventListener('click', () => { trail.pop(); choose(back.id, {from:null, focus:true}); });
   $('knowledge-trail').replaceChildren(button);
  }
  const prerequisites = row.prerequisites.filter(item => identifier.test(item.id)).map(item => {
   const button = el('button', undefined, 'prerequisite'); button.type = 'button';
   const name = el('span'); inline(name, item.title); button.append(name, el('span', ' →', 'arrow'));
   button.addEventListener('click', () => choose(item.id, {from:row, focus:true}));
   const entry = el('li'); entry.append(button); return entry;
  });
  $('knowledge-prerequisites').replaceChildren(...prerequisites);
  if (!prerequisites.length) $('knowledge-prerequisites').append(el('li', t('knowledge.noPrerequisites', 'No listed prerequisites. A good place to start.'), 'subtle'));
  const next = (row.next_concepts || []).filter(item => identifier.test(item.id)).map(item => {
   const button = el('button', item.title + ' →', 'prerequisite'); button.type = 'button';
   button.addEventListener('click', () => choose(item.id, {from:row, focus:true}));
   const itemNode = el('li'); itemNode.append(button); return itemNode;
  });
  $('knowledge-next').replaceChildren(...next);
  if (!next.length) $('knowledge-next').append(el('li', 'No further concepts are linked in this reference set.', 'subtle'));
  $('knowledge-paths').replaceChildren();
  for (const path of options.paths || []) if (identifier.test(path.id)
      && path.steps.some(step => (step.concepts || []).includes(row.id))) {
   const link = el('a', path.title); link.href = '#paths?' + new URLSearchParams({path:path.id});
   $('knowledge-paths').append(link);
  }
  if (!$('knowledge-paths').children.length) $('knowledge-paths').append(el('span', 'Explore Reading paths to choose a related subject.', 'subtle'));
  drawMap(row);
  drawBooks(row);
  const source = sourceUrl(row.source && row.source.url);
  $('knowledge-source').hidden = !source;
  if (source) $('knowledge-source').href = source;
 }
 function drawBooks(row) {
  const snapshot = JSON.stringify(row.books);
  if (snapshot === booksSnapshot) return;
  booksSnapshot = snapshot;
  const books = row.books.map(book => bookEntry(book, row.title)).filter(Boolean);
  $('knowledge-books').replaceChildren(...books);
  if (!books.length) $('knowledge-books').append(el('li', t('knowledge.noBooks', 'No PDF linked to this concept is shared right now.'), 'subtle'));
 }
 function drawExercises(row) {
  const entries = Array.isArray(row.exercises) ? row.exercises.slice(0, 3) : [];
  const snapshot = JSON.stringify(entries);
  if (snapshot === exercisesSnapshot) return;
  exercisesSnapshot = snapshot;
  const items = entries.filter(item => item && bookIdentifier.test(item.book)
   && (item.page === null || item.page === undefined || (Number.isInteger(item.page) && item.page > 0 && item.page <= 100000))
   && ['title', 'number', 'section_title'].every(key => typeof item[key] === 'string')).map(item => {
   const entry = el('li'), title = el('span', undefined, 'knowledge-book-title');
   inline(title, item.title);
   entry.append(title, el('span', item.section_title + ' — ' + item.number, 'exercise-citation'));
   const expected = '/read/' + item.book + (Number.isInteger(item.page) && item.page > 0 && item.page <= 100000 ? '#page=' + item.page : '');
   const search = typeof item.search_url === 'string' && item.search_url.startsWith('#search?')
    ? new URLSearchParams(item.search_url.slice(8)) : null;
   const safeSearch = search && [...search.keys()].length === 2 && search.getAll('book').length === 1
    && search.get('book') === item.book && search.getAll('query').length === 1
    && search.get('query').length <= 120 && /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(search.get('query'));
   if (item.read_url === expected && safeSearch) {
    const actions = el('span', undefined, 'knowledge-book-actions');
    const read = el('a', item.page ? 'Open PDF at page ' + item.page + ' ↗' : 'Open shared PDF ↗');
    read.href = 'read/' + encodeURIComponent(item.book) + (item.page ? '#page=' + item.page : '');
    read.target = '_blank'; read.rel = 'noopener noreferrer';
    const find = el('a', 'Search inside this book');
    find.href = '#search?' + search.toString();
    actions.append(read, find); entry.append(actions);
   } else entry.append(el('span', 'PDF is not currently shared.', 'subtle'));
   return entry;
  });
  $('knowledge-exercises-list').replaceChildren(...items);
  $('knowledge-exercises').hidden = !items.length;
 }
 async function refreshBooks() {
  if (!selected || $('knowledge-detail').getAttribute('aria-busy') === 'true') return;
  const id = selected, current = ++detailRequest;
  try {
   const result = await json('knowledge/concepts/' + encodeURIComponent(id));
   if (current !== detailRequest) return;
   if (!result) { clearDetail(t('knowledge.gone', 'Concept unavailable')); return; }
   // Keep the reading panel and focused controls intact when only sharing changes.
   drawBooks(result.concept); drawExercises(result.concept); showError('');
  } catch (failure) {
   if (current !== detailRequest) return;
   booksSnapshot = null; $('knowledge-books').replaceChildren();
   exercisesSnapshot = null; $('knowledge-exercises-list').replaceChildren(); $('knowledge-exercises').hidden = true;
   showError(failure.message);
  }
 }
 // Every selection fetches the concept again, so a withdrawn PDF disappears at once.
 async function choose(id, {from = '', focus = false} = {}) {
  if (!identifier.test(id)) return;
  if (from) trail.push({id:from.id, title:from.title});
  else if (from === '') trail = [];
  selected = id; markSelected();
  // Remove old PDF links while checking the newly selected concept's sharing.
  clearDetail(t('knowledge.loading', 'Loading concept...'));
  const current = detailRequest;
  $('knowledge-detail').setAttribute('aria-busy', 'true');
  try {
   const result = await json('knowledge/concepts/' + encodeURIComponent(id));
   if (current !== detailRequest) return;
   if (!result) { clearDetail(t('knowledge.gone', 'Concept unavailable'), t('knowledge.goneText', 'This concept is no longer in the reference index.')); return; }
   drawDetail(result.concept); showError('');
   $('knowledge-detail').setAttribute('aria-busy', 'false');
   writeHash();
   if (focus) {
    $('knowledge-detail-title').focus({preventScroll:true});
    $('knowledge-detail').scrollIntoView({block:'start', behavior:'smooth'});
   } else if (narrow.matches && from === '') {
    $('knowledge-detail').scrollIntoView({block:'start', behavior:'smooth'});
   }
  } catch (failure) {
   if (current !== detailRequest) return;
   // The panel repeats the reason, since the alert above may be scrolled out of view.
   clearDetail(t('knowledge.unavailableTitle', 'Reference unavailable'), failure.message);
   showError(failure.message);
  }
 }
 function writeHash() {
  if (!visible) return;
  try {
   const url = new URL(location.href);
   url.hash = selected ? 'knowledge?' + new URLSearchParams({concept:selected}) : 'knowledge';
   if (url.href !== location.href) history.replaceState(history.state, '', url);
  } catch (_) {}
 }
 async function load({keep = true} = {}) {
  const current = ++listRequest;
  // A new filter supersedes any in-flight selection and its old PDF links.
  clearDetail(t('knowledge.loading', 'Loading concept...'));
  $('knowledge-list').replaceChildren();
  const params = new URLSearchParams();
  const query = $('knowledge-query').value.trim().slice(0, 120), subject = $('knowledge-subject').value;
  if (query) params.set('query', query);
  if (subject) params.set('subject', subject);
  $('knowledge-list').setAttribute('aria-busy', 'true');
  try {
   const result = await json('knowledge/concepts' + ([...params].length ? '?' + params : ''));
   if (current !== listRequest) return;
   if (!result) throw new Unavailable(t('knowledge.failed', 'The reference service could not answer this request.'));
   if (!subjects.size) for (const item of result.subjects) {
    subjects.set(item.id, item.label);
    const option = el('option', item.label); option.value = item.id; $('knowledge-subject').append(option);
   }
   for (const row of result.concepts) remember(row);
   const state = $('knowledge-state').value;
   rows = result.concepts.filter(row => identifier.test(row.id)
    && (!state || (state === 'reviewed' ? reviewed.has(row.id) : !reviewed.has(row.id))));
   $('knowledge-count').textContent = t('knowledge.count', rows.length === 1 ? '{n} concept' : '{n} concepts', {n:rows.length});
   $('knowledge-empty').hidden = rows.length > 0;
   if (!rows.length) $('knowledge-empty-text').textContent = query
    ? t('knowledge.emptyQuery', 'No concepts match "{query}". Try a broader term or another subject.', {query})
    : t('knowledge.emptySubject', 'No concepts in this subject yet.');
   drawList(); showError('');
   if (rows.length) {
    const next = keep && rows.some(row => row.id === selected) ? selected : rows[0].id;
    await choose(next, {from: next === selected ? null : ''});
   } else {
    selected = ''; trail = []; writeHash();
    clearDetail(t('knowledge.none', 'No concept selected'));
   }
  } catch (failure) {
   if (current !== listRequest) return;
   rows = []; drawList(); $('knowledge-empty').hidden = true;
   $('knowledge-count').textContent = t('knowledge.unavailableTitle', 'Reference unavailable');
   // Without a fresh answer, no PDF link can be trusted to be shared.
   clearDetail(t('knowledge.unavailableTitle', 'Reference unavailable'), failure.message);
   showError(failure.message);
  } finally {
   if (current === listRequest) $('knowledge-list').setAttribute('aria-busy', 'false');
  }
 }
 async function loadSource() {
  try {
   const result = await json('knowledge/sources');
   const provider = result && result.sources.find(item => item.id === 'banana-space');
   const url = provider && sourceUrl(provider.url);
   if (!url) return;
   $('knowledge-provider-name').textContent = provider.name;
   $('knowledge-provider').href = url; $('knowledge-provider').hidden = false;
   // The flags are shown as reported; neither is ever presented as verified.
   $('knowledge-provider-mode').textContent = [
    provider.live_api_verified === true ? t('knowledge.apiReported', 'Live API: reported available') : t('knowledge.apiOff', 'Live API: not verified'),
    provider.article_import_enabled === true ? t('knowledge.importReported', 'Article import: reported on') : t('knowledge.importOff', 'Article import: off')
   ].join(' · ');
  } catch (_) { /* The strip keeps its static wording. */ }
 }

 let typing = 0;
 $('knowledge-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(typing); load({keep:false}); });
 $('knowledge-query').addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => load({keep:false}), 250); });
 $('knowledge-subject').addEventListener('change', () => load({keep:false}));
 $('knowledge-state').addEventListener('change', () => load({keep:false}));
 $('knowledge-reviewed').addEventListener('click', () => {
  if (!identifier.test(selected)) return;
  if (reviewed.has(selected)) { reviewed.delete(selected); schedule.delete(selected); }
  else {
   reviewed.add(selected);
   const title = $('knowledge-detail-title').textContent.slice(0, 100);
   schedule.set(selected, {due:dateKey(INTERVALS[0]), level:0, title:rows.find(row => row.id === selected)?.title.slice(0, 100) || title});
  }
  try { localStorage.setItem('formosa-reviewed-concepts-v1', JSON.stringify([...reviewed])); }
  catch (_) { storageAvailable = false; }
  saveSchedule(); studyProgress(); drawReview(); drawRecall();
  if ($('knowledge-state').value) load(); else drawList();
 });
 $('knowledge-recall-yes').addEventListener('click', () => recordRecall(true));
 $('knowledge-recall-no').addEventListener('click', () => recordRecall(false));
 studyProgress(); drawReview();
 $('knowledge-reset').addEventListener('click', () => { $('knowledge-query').value = ''; $('knowledge-subject').value = ''; $('knowledge-state').value = ''; load({keep:false}); $('knowledge-query').focus(); });
 $('knowledge-empty-reset').addEventListener('click', () => $('knowledge-reset').click());
 $('knowledge-to-index').addEventListener('click', () => {
  const button = [...$('knowledge-list').querySelectorAll('.concept-row')]
   .find(row => row.dataset.concept === selected);
  (button || $('knowledge-query')).focus({preventScroll:true});
  $('knowledge-list').scrollIntoView({block:'start', behavior:'smooth'});
 });
 $('knowledge-retry').addEventListener('click', () => load());
 document.addEventListener('visibilitychange', () => { if (visible && !document.hidden) load(); });

 if (!options.available) {
  $('knowledge-nav').hidden = true;
  $('knowledge-desk').hidden = true; $('knowledge-static').hidden = false;
 } else $('knowledge-nav').hidden = false;

 // Called by the router whenever the view changes.
 function show(active, linked) {
  visible = active && options.available;
  clearInterval(timer);
  if (!visible) {
   clearTimeout(typing);
   ++listRequest; ++detailRequest;
   $('knowledge-list').setAttribute('aria-busy', 'false');
   $('knowledge-detail').setAttribute('aria-busy', 'false');
   return;
  }
  drawReview();
  if (linked && identifier.test(linked)) {
   if (linked !== selected) trail = [];
   selected = linked;
   // A link from a route or another page must not be replaced by a filtered result.
   $('knowledge-query').value = ''; $('knowledge-subject').value = ''; $('knowledge-state').value = '';
  }
  if (!started) { started = true; loadSource(); }
  // Restore the list as well as the detail after a failed initial or filtered load.
  load();
  // Sharing can change while the desk stays open; check the current concept each minute.
  timer = setInterval(() => {
   if (document.hidden || $('knowledge-list').getAttribute('aria-busy') === 'true') return;
   if (rows.length && selected) refreshBooks();
   else load();
  }, 60000);
 }
 return {show};
}};
