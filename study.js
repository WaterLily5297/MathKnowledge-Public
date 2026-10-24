'use strict';
// Study progress stays in this browser; no learning state is sent to the server.
window.FormosaStudy = {init(data, helpers) {
 const $ = id => document.getElementById(id), el = helpers.element;
 const pattern = /^[a-z][a-z0-9-]{0,79}$/;
 const books = new Map(data.items.map(row => [row.id, row]));
 const paths = (data.reading_paths || []).map((route, i) => ({...route,
  id: pattern.test(route.id) ? route.id : 'custom-' + (i + 1),
  subject: route.subject || 'reference', level: route.level || 'Custom route',
  steps: route.steps.map((step, n) => ({...step, id: step.id || 'step-' + (n + 1)}))}));
 const valid = new Set(paths.flatMap(path => path.steps.map(step => path.id + '/' + step.id)));
 let completed = new Set(), selected = '', visible = false, storageAvailable = true;
 try {
  const saved = JSON.parse(localStorage.getItem('formosa-study-progress-v1') || '[]');
  if (Array.isArray(saved)) completed = new Set(saved.filter(key => valid.has(key)));
 } catch (_) { storageAvailable = false; }
 const label = id => id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
 // A step's hint and solution sketch stay closed and are rendered when first opened.
 function practice(hint, solution) {
  const items = [['Hint', hint], ['Solution sketch', solution]]
   .filter(([, text]) => typeof text === 'string' && text.trim()).map(([name, text]) => {
    const item = el('details', undefined, 'practice-item'), body = el('div', undefined, 'rich-text practice-body');
    let drawn = false;
    item.append(el('summary', name), body);
    item.addEventListener('toggle', () => {
     if (item.open && !drawn) { drawn = true; window.FormosaRichText.renderBlock(body, text, {links:false}); }
    });
    return item;
   });
  if (!items.length) return null;
  const box = el('div', undefined, 'practice'); box.append(...items); return box;
 }
 function progress(path) { return path.steps.filter(step => completed.has(path.id + '/' + step.id)).length; }
 function save() {
  try { localStorage.setItem('formosa-study-progress-v1', JSON.stringify([...completed])); }
  catch (_) { storageAvailable = false; }
 }
 function counts() {
  const path = paths.find(row => row.id === selected);
  $('study-progress').textContent = path ? progress(path) + ' of ' + path.steps.length + ' checkpoints completed' : '';
  $('study-meter').max = path ? path.steps.length : 1;
  $('study-meter').value = path ? progress(path) : 0;
  $('study-storage').textContent = storageAvailable ? 'Progress is saved only in this browser.' : 'Browser storage is unavailable; progress will last only for this visit.';
  $('study-summary').textContent = paths.length + ' routes · ' + paths.reduce((n, row) => n + row.steps.length, 0) + ' checkpoints · ' + completed.size + ' completed';
 }
 function conceptLink(id) {
  const link = el('a', label(id), 'study-concept');
  link.href = '#knowledge?' + new URLSearchParams({concept:id}); return link;
 }
 function filtered() {
  const query = $('study-query').value.trim().toLowerCase(), subject = $('study-subject').value, level = $('study-level').value;
  return paths.filter(path => (!subject || path.subject === subject) && (!level || path.level === level)
   && (!query || [path.title, path.description, ...path.steps.map(step => step.title + ' ' + step.goal)].join(' ').toLowerCase().includes(query)));
 }
 function drawList() {
  const shown = filtered();
  $('study-count').textContent = shown.length + ' matching routes';
  $('study-list').replaceChildren(...shown.map(path => {
   const button = el('button', undefined, 'study-route'); button.type = 'button';
   button.setAttribute('aria-pressed', String(selected === path.id));
   button.append(el('span', path.level, 'knowledge-label'), el('strong', path.title),
    el('span', progress(path) + '/' + path.steps.length + ' completed', 'subtle'));
   button.addEventListener('click', () => choose(path.id, true)); return button;
  }));
  $('study-empty').hidden = shown.length > 0;
 }
 function choose(id, focus = false) {
  const path = paths.find(row => row.id === id); if (!path) return;
  selected = id; drawList();
  $('study-title').textContent = path.title;
  $('study-meta').textContent = label(path.subject) + ' · ' + path.level;
  $('study-description').textContent = path.description || 'Work through each reading and explain its main ideas before continuing.';
  $('study-prerequisites').replaceChildren(...(path.prerequisites || []).filter(key => pattern.test(key)).map(conceptLink));
  if (!$('study-prerequisites').children.length) $('study-prerequisites').append(el('span', 'Start here; no listed prerequisites.', 'subtle'));
  $('study-steps').replaceChildren(...path.steps.map((step, index) => {
   const card = el('article', undefined, 'study-step'); card.id = 'study-step-' + step.id; card.tabIndex = -1;
   const heading = el('h3', (index + 1) + '. ' + step.title), goal = el('div', undefined, 'rich-text');
   window.FormosaRichText.renderBlock(goal, step.goal, {links:false});
   const check = el('label', undefined, 'study-check'), checkbox = el('input'); checkbox.type = 'checkbox';
   const key = path.id + '/' + step.id; checkbox.checked = completed.has(key);
   check.append(checkbox, el('span', 'I can explain this checkpoint'));
   checkbox.addEventListener('change', () => {
    if (checkbox.checked) completed.add(key); else completed.delete(key);
    save(); counts(); drawList();
   });
   card.append(heading, goal);
   if (step.formula) {
    const formula = el('div', undefined, 'rich-text');
    window.FormosaRichText.renderBlock(formula, '$$\n' + step.formula + '\n$$', {links:false}); card.append(formula);
   }
   if (step.example) {
    const example = el('div', undefined, 'rich-text study-example');
    window.FormosaRichText.renderBlock(example, step.example, {links:false});
    card.append(el('h4', 'Example', 'knowledge-label'), example);
   }
   const checkpoint = el('div', undefined, 'rich-text study-checkpoint');
   window.FormosaRichText.renderBlock(checkpoint,
    step.checkpoint || 'Explain the main definition and solve a representative example.', {links:false});
   card.append(el('h4', 'Check your understanding', 'knowledge-label'), checkpoint);
   const help = practice(step.hint, step.solution);
   if (help) card.append(help);
   const concepts = el('div', undefined, 'study-links');
   for (const key of step.concepts || []) if (pattern.test(key)) concepts.append(conceptLink(key));
   card.append(concepts);
   const readings = el('ul', undefined, 'study-readings');
   for (const key of step.books || []) if (books.has(key)) {
    const item = el('li'); item.append(helpers.titleLink(books.get(key)));
    const button = el('button', 'Details / save', 'text-button'); button.type = 'button';
    button.addEventListener('click', () => helpers.details(key)); item.append(button); readings.append(item);
   }
   if (!readings.children.length) readings.append(el('li', 'No catalog reading is currently linked. Start with the concept notes.', 'subtle'));
   card.append(readings, check); return card;
  }));
  $('study-outline').replaceChildren(...path.steps.map((step, index) => {
   const button = el('button', (index + 1) + '. ' + step.title, 'text-button'); button.type = 'button';
   button.addEventListener('click', () => {
    const card = $('study-step-' + step.id);
    card.focus({preventScroll:true}); card.scrollIntoView({block:'start', behavior:'smooth'});
   });
   return button;
  }));
  counts();
  if (visible) {
   const url = new URL(location.href); url.hash = 'paths?' + new URLSearchParams({path:id});
   if (url.href !== location.href) history.replaceState(history.state, '', url);
  }
  if (focus) { $('study-title').focus({preventScroll:true}); $('study-panel').scrollIntoView({block:'start'}); }
 }
 for (const [control, values] of [
  ['study-subject', [...new Set(paths.map(row => row.subject))].sort()],
  ['study-level', [...new Set(paths.map(row => row.level))].sort()]]) {
  for (const value of values) { const option = el('option', control === 'study-subject' ? label(value) : value); option.value = value; $(control).append(option); }
  $(control).addEventListener('change', drawList);
 }
 $('study-query').addEventListener('input', drawList);
 $('study-reset').addEventListener('click', () => { $('study-query').value = ''; $('study-subject').value = ''; $('study-level').value = ''; drawList(); });
 $('study-resume').addEventListener('click', () => {
  const path = paths.find(row => row.id === selected); if (!path) return;
  const next = path.steps.find(step => !completed.has(path.id + '/' + step.id)) || path.steps[0];
  const card = $('study-step-' + next.id); card.focus({preventScroll:true}); card.scrollIntoView({block:'start', behavior:'smooth'});
 });
 $('study-layout').hidden = !paths.length; $('study-static').hidden = !!paths.length;
 $('paths-nav').hidden = !paths.length;
 if (paths.length) choose(paths[0].id);
 return {show(active, linked) {
  visible = active;
  if (active && paths.some(row => row.id === linked) && !filtered().some(row => row.id === linked)) {
   $('study-query').value = ''; $('study-subject').value = ''; $('study-level').value = '';
  }
  if (active && paths.length) choose(paths.some(row => row.id === linked) ? linked : selected || paths[0].id);
 }};
}};
