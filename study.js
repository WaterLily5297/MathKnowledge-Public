'use strict';
// Study progress stays in this browser; no learning state is sent to the server.
window.FormosaStudy = {init(data, helpers) {
 const $ = id => document.getElementById(id), el = helpers.element;
 const pattern = /^[a-z][a-z0-9-]{0,79}$/;
 const PROGRESS = 'formosa-study-progress-v1', POSITION = 'formosa-study-position-v1';
 // Routes are listed from first steps to research-level material; unknown levels follow.
 const LEVELS = ['Foundation', 'Foundation to undergraduate', 'Undergraduate', 'Undergraduate to graduate', 'Graduate', 'Custom route'];
 const levelRank = level => { const rank = LEVELS.indexOf(level); return rank < 0 ? LEVELS.length : rank; };
 const books = new Map(data.items.map(row => [row.id, row]));
 const paths = (data.reading_paths || []).map((route, i) => ({...route,
  id: pattern.test(route.id) ? route.id : 'custom-' + (i + 1),
  subject: route.subject || 'reference', level: route.level || 'Custom route',
  steps: route.steps.map((step, n) => ({...step, id: pattern.test(step.id || '') ? step.id : 'step-' + (n + 1)}))}))
  .map((route, order) => ({...route, order}))
  .sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.order - b.order);
 const valid = new Set(paths.flatMap(path => path.steps.map(step => path.id + '/' + step.id)));
 let completed = new Set(), selected = '', visible = false, storageAvailable = true, titles = new Map(), titlesRequested = false;
 let conceptLinks = [];
 let lastPath = '';
 try {
  const saved = JSON.parse(localStorage.getItem(PROGRESS) || '[]');
  if (Array.isArray(saved)) completed = new Set(saved.filter(key => valid.has(key)));
  const last = JSON.parse(localStorage.getItem(POSITION) || 'null');
  if (last && paths.some(path => path.id === last.path)) lastPath = last.path;
 } catch (_) { storageAvailable = false; }
 // Concept and subject identifiers become readable names until the real titles arrive.
 const label = id => id.split('-').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
 const conceptTitle = id => titles.get(id) || label(id);
 function progress(path) { return path.steps.filter(step => completed.has(path.id + '/' + step.id)).length; }
 function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (_) { storageAvailable = false; }
 }
 // The route used last reopens when Reading paths is opened without a link.
 function remember() {
  if (lastPath === selected) return;
  lastPath = selected; store(POSITION, {path:selected});
 }
 const nextStep = path => path.steps.find(step => !completed.has(path.id + '/' + step.id));
 function counts() {
  const path = paths.find(row => row.id === selected);
  if (path) {
   const done = progress(path), next = nextStep(path);
   $('study-progress').textContent = done + ' of ' + path.steps.length + ' checkpoints completed';
   $('study-meter-bar').style.setProperty('--done', (done / path.steps.length).toFixed(4));
   $('study-resume').textContent = next
    ? (done ? 'Continue with ' : 'Start with ') + (path.steps.indexOf(next) + 1) + '. ' + next.title
    : 'Route complete. Review from the first checkpoint';
  }
  $('study-storage').textContent = storageAvailable ? 'Progress is saved only in this browser.' : 'Browser storage is unavailable; progress will last only for this visit.';
  $('study-summary').textContent = paths.length + ' routes · ' + paths.reduce((n, row) => n + row.steps.length, 0) + ' checkpoints · ' + completed.size + ' completed';
 }
 function conceptLink(id) {
  const link = el('a', conceptTitle(id), 'study-concept');
  link.dataset.concept = id; conceptLinks.push(link);
  link.href = '#knowledge?' + new URLSearchParams({concept:id}); return link;
 }
 function relabel() {
  for (const link of conceptLinks) link.textContent = conceptTitle(link.dataset.concept);
 }
 // Reading paths exist only on the live library, which also serves the concept titles.
 async function loadTitles() {
  if (titlesRequested || !Object.hasOwn(data, 'shared_pdfs')) return;
  titlesRequested = true;
  try {
   const response = await fetch('knowledge/concepts', {cache:'no-store', credentials:'same-origin'});
   if (!response.ok) return;
   const result = await response.json();
   for (const row of result.concepts || []) if (pattern.test(row.id) && typeof row.title === 'string') titles.set(row.id, row.title);
   relabel();
  } catch (_) { /* Readable identifiers remain. */ }
 }
 function filtered() {
  const query = $('study-query').value.trim().toLowerCase(), subject = $('study-subject').value, level = $('study-level').value;
  return paths.filter(path => (!subject || path.subject === subject) && (!level || path.level === level)
   && (!query || [path.title, path.description, ...path.steps.map(step => [step.title, step.goal, step.example, step.checkpoint].join(' '))]
    .join(' ').toLowerCase().includes(query)));
 }
 function drawList() {
  const shown = filtered(), groups = [];
  $('study-count').textContent = shown.length === 1 ? '1 matching route' : shown.length + ' matching routes';
  for (const path of shown) {
   if (!groups.length || groups[groups.length - 1].level !== path.level) groups.push({level:path.level, routes:[]});
   groups[groups.length - 1].routes.push(path);
  }
  $('study-list').replaceChildren(...groups.map(group => {
   const section = el('section', undefined, 'study-group'), heading = el('h3', group.level, 'knowledge-label');
   section.append(heading);
   for (const path of group.routes) {
    const button = el('button', undefined, 'study-route'); button.type = 'button'; button.dataset.path = path.id;
    button.setAttribute('aria-pressed', String(selected === path.id));
    const done = progress(path);
    button.append(el('strong', path.title), el('span', label(path.subject) + ' · ' + done + ' of ' + path.steps.length + ' completed', 'subtle'));
    if (done === path.steps.length) button.className += ' is-complete';
    button.addEventListener('click', () => choose(path.id, {focus:true}));
    button.addEventListener('keydown', event => {
     const all = [...$('study-list').querySelectorAll('.study-route')], index = all.indexOf(button);
     const target = {ArrowDown:all[index + 1], ArrowUp:all[index - 1], Home:all[0], End:all[all.length - 1]}[event.key];
     if (target) { event.preventDefault(); target.focus(); }
    });
    section.append(button);
   }
   return section;
  }));
  $('study-empty').hidden = shown.length > 0;
 }
 function writeHash(step) {
  if (!visible) return;
  try {
   const url = new URL(location.href), params = new URLSearchParams({path:selected});
   if (step) params.set('step', step);
   url.hash = 'paths?' + params;
   if (url.href !== location.href) history.replaceState(history.state, '', url);
  } catch (_) {}
 }
 function goTo(stepId, smooth = true) {
  const card = $('study-step-' + stepId); if (!card) return;
  card.focus({preventScroll:true}); card.scrollIntoView({block:'start', behavior:smooth ? 'smooth' : 'auto'});
  writeHash(stepId);
 }
 function markCard(card, badge, done) {
  card.className = 'study-step' + (done ? ' is-complete' : '');
  badge.hidden = !done;
 }
 function drawOutline(path) {
  $('study-outline').replaceChildren(...path.steps.map((step, index) => {
   const item = el('li'), button = el('button', undefined, 'study-outline-step'); button.type = 'button';
   const done = completed.has(path.id + '/' + step.id);
   button.append(el('span', done ? '✓' : String(index + 1), 'study-outline-mark'), el('span', step.title));
   button.setAttribute('aria-label', (index + 1) + '. ' + step.title + (done ? ', completed' : ''));
   if (done) button.className += ' is-complete';
   button.addEventListener('click', () => goTo(step.id));
   item.append(button); return item;
  }));
 }
 function choose(id, {focus = false, step = ''} = {}) {
  const path = paths.find(row => row.id === id); if (!path) return;
  selected = id; conceptLinks = []; drawList();
  $('study-title').textContent = path.title;
  $('study-meta').textContent = label(path.subject) + ' · ' + path.level;
  $('study-description').textContent = path.description || 'Work through each reading and explain its main ideas before continuing.';
  $('study-prerequisites').replaceChildren(...(path.prerequisites || []).filter(key => pattern.test(key)).map(conceptLink));
  if (!$('study-prerequisites').children.length) $('study-prerequisites').append(el('span', 'Start here; no listed prerequisites.', 'subtle'));
  drawOutline(path);
  $('study-steps').replaceChildren(...path.steps.map((step, index) => {
   const key = path.id + '/' + step.id, done = completed.has(key);
   const card = el('article', undefined, 'study-step'); card.id = 'study-step-' + step.id; card.tabIndex = -1;
   const heading = el('h3', (index + 1) + '. ' + step.title), goal = el('div', undefined, 'rich-text');
   const badge = el('span', 'Completed', 'study-done'); heading.append(badge);
   card.setAttribute('aria-label', 'Checkpoint ' + (index + 1) + ': ' + step.title);
   window.FormosaRichText.renderBlock(goal, step.goal, {links:false});
   card.append(heading, goal);
   if (step.formula) {
    const formula = el('div', undefined, 'rich-text study-formula');
    window.FormosaRichText.renderBlock(formula, '$$\n' + step.formula + '\n$$', {links:false}); card.append(formula);
   }
   if (step.example) {
    const example = el('p', undefined, 'study-example'); example.append(el('strong', 'Example. '), step.example); card.append(example);
   }
   const checkpoint = el('p', undefined, 'study-checkpoint');
   checkpoint.append(el('strong', 'Checkpoint. '), step.checkpoint || 'Explain the main definition and solve a representative example.');
   card.append(checkpoint);
   const concepts = el('div', undefined, 'study-links');
   for (const concept of step.concepts || []) if (pattern.test(concept)) concepts.append(conceptLink(concept));
   if (concepts.children.length) card.append(el('h4', 'Concept notes', 'knowledge-label'), concepts);
   const readings = el('ul', undefined, 'study-readings');
   for (const book of step.books || []) if (books.has(book)) {
    const item = el('li'); item.append(helpers.titleLink(books.get(book)));
    const button = el('button', 'Details / save', 'text-button'); button.type = 'button';
    button.addEventListener('click', () => helpers.details(book)); item.append(button); readings.append(item);
   }
   if (!readings.children.length) readings.append(el('li', 'No catalog reading is currently linked. Start with the concept notes.', 'subtle'));
   card.append(el('h4', 'Readings', 'knowledge-label'), readings);
   const check = el('label', undefined, 'study-check'), checkbox = el('input'); checkbox.type = 'checkbox';
   checkbox.checked = done;
   check.append(checkbox, el('span', 'I can explain this checkpoint'));
   checkbox.addEventListener('change', () => {
    if (checkbox.checked) completed.add(key); else completed.delete(key);
    store(PROGRESS, [...completed]);
    markCard(card, badge, checkbox.checked); drawOutline(path); counts(); drawList();
   });
   card.append(check); markCard(card, badge, done); return card;
  }));
  counts(); relabel(); remember();
  if (step && path.steps.some(row => row.id === step)) { goTo(step, false); return; }
  writeHash();
  if (focus) { $('study-title').focus({preventScroll:true}); $('study-panel').scrollIntoView({block:'start'}); }
 }
 for (const [control, values] of [
  ['study-subject', [...new Set(paths.map(row => row.subject))].sort()],
  ['study-level', [...new Set(paths.map(row => row.level))].sort((a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b))]]) {
  for (const value of values) { const option = el('option', control === 'study-subject' ? label(value) : value); option.value = value; $(control).append(option); }
  $(control).addEventListener('change', drawList);
 }
 $('study-query').addEventListener('input', drawList);
 $('study-reset').addEventListener('click', () => { $('study-query').value = ''; $('study-subject').value = ''; $('study-level').value = ''; drawList(); });
 $('study-resume').addEventListener('click', () => {
  const path = paths.find(row => row.id === selected); if (!path) return;
  goTo((nextStep(path) || path.steps[0]).id);
 });
 $('study-layout').hidden = !paths.length; $('study-static').hidden = !!paths.length;
 $('paths-nav').hidden = !paths.length;
 if (paths.length) choose(lastPath || paths[0].id);
 return {show(active, params) {
  visible = active;
  if (!active || !paths.length) return;
  loadTitles();
  const linked = params ? params.get('path') : null, step = params ? params.get('step') || '' : '';
  choose(paths.some(row => row.id === linked) ? linked : selected || paths[0].id, {step});
 }};
}};
