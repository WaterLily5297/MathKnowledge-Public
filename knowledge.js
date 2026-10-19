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
 let started = false, visible = false, timer = 0;

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
   button.append(el('span', subjectLabel(row.subject), 'concept-subject'), title, preview);
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
  $('knowledge-detail').setAttribute('aria-busy', 'false');
  $('knowledge-detail-subject').textContent = t('knowledge.note', 'Reference note');
  $('knowledge-detail-title').textContent = title;
  $('knowledge-summary').replaceChildren(); if (note) $('knowledge-summary').append(el('p', note, 'subtle'));
  for (const id of ['knowledge-formula', 'knowledge-prerequisites', 'knowledge-books', 'knowledge-trail'])
   $(id).replaceChildren();
  $('knowledge-formula').hidden = true; $('knowledge-trail').hidden = true;
  $('knowledge-detail-sections').hidden = true;
 }
 function bookEntry(book) {
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
  item.append(actions);
  return item;
 }
 function drawDetail(row) {
  $('knowledge-detail-subject').textContent = subjectLabel(row.subject);
  inline($('knowledge-detail-title'), row.title);
  block($('knowledge-summary'), row.summary_md);
  $('knowledge-formula').hidden = !row.formula;
  if (row.formula) block($('knowledge-formula'), '$$\n' + row.formula + '\n$$');
  $('knowledge-detail-sections').hidden = false;
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
  const books = row.books.map(bookEntry).filter(Boolean);
  $('knowledge-books').replaceChildren(...books);
  if (!books.length) $('knowledge-books').append(el('li', t('knowledge.noBooks', 'No PDF linked to this concept is shared right now.'), 'subtle'));
  const source = sourceUrl(row.source && row.source.url);
  $('knowledge-source').hidden = !source;
  if (source) $('knowledge-source').href = source;
 }
 // Every selection fetches the concept again, so a withdrawn PDF disappears at once.
 async function choose(id, {from = '', focus = false} = {}) {
  if (!identifier.test(id)) return;
  if (from) trail.push({id:from.id, title:from.title});
  else if (from === '') trail = [];
  selected = id; markSelected();
  const current = ++detailRequest;
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
   rows = result.concepts.filter(row => identifier.test(row.id));
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
 $('knowledge-reset').addEventListener('click', () => { $('knowledge-query').value = ''; $('knowledge-subject').value = ''; load({keep:false}); $('knowledge-query').focus(); });
 $('knowledge-empty-reset').addEventListener('click', () => $('knowledge-reset').click());
 $('knowledge-retry').addEventListener('click', () => load());
 document.addEventListener('visibilitychange', () => { if (visible && !document.hidden && selected) choose(selected, {from:null}); });

 if (!options.available) {
  $('knowledge-nav').hidden = true;
  $('knowledge-desk').hidden = true; $('knowledge-static').hidden = false;
 } else $('knowledge-nav').hidden = false;

 // Called by the router whenever the view changes.
 function show(active, linked) {
  visible = active && options.available;
  clearInterval(timer);
  if (!visible) return;
  if (linked && identifier.test(linked)) selected = linked;
  if (!started) { started = true; loadSource(); load(); }
  else if (selected) choose(selected, {from:null});
  // Sharing can change while the desk stays open; check the current concept each minute.
  timer = setInterval(() => { if (!document.hidden && selected) choose(selected, {from:null}); }, 60000);
 }
 return {show};
}};
