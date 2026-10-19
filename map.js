'use strict';
// Theory map: how the subjects in the catalog build on each other, with the catalog's books for each.
// Text comes from map.json in English and from i18n.js in Japanese. Study marks stay in this browser.
window.FormosaMap = (() => {
 const NS = 'http://www.w3.org/2000/svg';
 const W = 1260, ROW = 124, TOP = 46, NW = 182, NH = 58;
 const t = (key, english, vars) => (window.FormosaI18n ? window.FormosaI18n.t(key, english, vars) : english);

 // Every prerequisite of a theory, each listed after the theories it builds on.
 function readingRoute(map, id) {
  const nodes = new Map(map.nodes.map(node => [node.id, node]));
  const seen = new Set(), order = [];
  const visit = current => {
   if (seen.has(current)) return;
   seen.add(current);
   map.edges.filter(edge => edge.to === current).map(edge => edge.from)
    .sort((a, b) => nodes.get(a).layer - nodes.get(b).layer || nodes.get(a).x - nodes.get(b).x)
    .forEach(visit);
   order.push(current);
  };
  visit(id);
  return order;
 }
 // Theories not yet studied whose direct prerequisites are all studied, in map order.
 function readyTheories(map, studied) {
  return map.nodes
   .filter(node => !studied.has(node.id) && map.edges.every(edge => edge.to !== node.id || studied.has(edge.from)))
   .sort((a, b) => a.layer - b.layer || a.x - b.x)
   .map(node => node.id);
 }
 // Labels with spaces wrap greedily. Labels without them (Japanese) split once at the word
 // boundary that balances the two lines best, never right before punctuation or a
 // one-character word such as a particle.
 function wrapLabel(text, max) {
  if (text.includes(' ')) {
   const limit = max || 22, lines = [''];
   for (const word of text.split(' ')) {
    const line = lines[lines.length - 1];
    if (line && (line + ' ' + word).length > limit) lines.push(word); else lines[lines.length - 1] = line ? line + ' ' + word : word;
   }
   return lines;
  }
  const chars = [...text], limit = max || 11;
  if (chars.length <= limit) return [text];
  const cuts = new Map(); // where a word starts -> its length
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
   let at = 0;
   for (const {segment} of new Intl.Segmenter('ja', {granularity:'word'}).segment(text)) { cuts.set(at, [...segment].length); at += [...segment].length; }
  } else chars.forEach((_, i) => cuts.set(i, 2));
  let best = null;
  for (const [cut, size] of cuts) {
   if (cut <= 0 || size < 2 || /\p{P}/u.test(chars[cut])) continue;
   const longest = Math.max(cut, chars.length - cut);
   if (!best || longest < best.longest) best = {cut, longest};
  }
  return best ? [chars.slice(0, best.cut).join(''), chars.slice(best.cut).join('')] : [text];
 }

 function init({rows, titleLink, languageLabel, showResource, onSelect, initial}) {
  const $ = id => document.getElementById(id);
  const svg = $('theory-map'), panel = $('theory-panel');
  let map = null, nodes = new Map(), current = null, studied = new Set();
  try { studied = new Set(JSON.parse(localStorage.getItem('formosa-map-studied') || '[]')); } catch (_) {}
  const saveStudied = () => { try { localStorage.setItem('formosa-map-studied', JSON.stringify([...studied])); } catch (_) {} };
  const name = id => t('map.name.' + id, nodes.get(id).name);
  const el = (tag, className, text) => {
   const node = document.createElement(tag);
   if (className) node.className = className;
   if (text !== undefined) node.textContent = text;
   return node;
  };
  const svgEl = (tag, attributes) => {
   const node = document.createElementNS(NS, tag);
   for (const [key, value] of Object.entries(attributes || {})) node.setAttribute(key, value);
   return node;
  };
  const button = (text, className, action) => {
   const node = el('button', className, text);
   node.type = 'button'; node.addEventListener('click', action);
   return node;
  };
  // Hand-placed columns (90 to 1230) are fitted into the drawing width.
  const position = id => {
   const node = nodes.get(id);
   return {x: 104 + (node.x - 90) * (W - 208) / 1140, y: TOP + node.layer * ROW + 18};
  };

  let nodeEls = new Map(), edgeEls = [];
  function draw() {
   const height = TOP + ROW * map.layers.length - 20;
   svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
   svg.replaceChildren();
   map.layers.forEach((label, index) => {
    const y = TOP + index * ROW - 22;
    if (index % 2 === 0) svg.append(svgEl('rect', {class: 'map-band', x: 0, y, width: W, height: ROW}));
    const text = svgEl('text', {class: 'map-band-label', x: 8, y: y + 16});
    text.textContent = t('map.layer.' + index, label);
    svg.append(text);
   });
   const edges = svgEl('g'), boxes = svgEl('g');
   svg.append(edges, boxes);
   edgeEls = map.edges.map(edge => {
    const a = position(edge.from), b = position(edge.to);
    let d;
    if (nodes.get(edge.from).layer === nodes.get(edge.to).layer) {
     const dir = b.x > a.x ? 1 : -1, y = a.y + NH / 2;
     d = `M${a.x + dir * NW / 2},${a.y + 8} C${a.x + dir * (NW / 2 + 30)},${y + 34} ${b.x - dir * (NW / 2 + 30)},${y + 34} ${b.x - dir * NW / 2},${b.y + 8}`;
    } else {
     const y1 = a.y + NH, y2 = b.y, mid = (y1 + y2) / 2;
     d = `M${a.x},${y1} C${a.x},${mid} ${b.x},${mid} ${b.x},${y2}`;
    }
    const path = svgEl('path', {class: 'map-edge', d});
    const title = svgEl('title');
    title.textContent = `${name(edge.from)} → ${name(edge.to)}: ${t(`map.edge.${edge.from}.${edge.to}`, edge.why)}`;
    path.append(title); edges.append(path);
    return {edge, path};
   });
   nodeEls = new Map();
   for (const node of map.nodes) {
    const {x, y} = position(node.id);
    const g = svgEl('g', {class: 'map-node', tabindex: 0, role: 'button', 'aria-label': name(node.id)});
    g.append(svgEl('rect', {x: x - NW / 2, y, width: NW, height: NH, rx: 2}));
    const lines = wrapLabel(name(node.id));
    // Full-width characters are wider, so long Japanese lines use a smaller size to stay in the box.
    if (!name(node.id).includes(' ') && lines.some(line => [...line].length > 10)) g.classList.add('long');
    lines.forEach((line, i) => {
     const text = svgEl('text', {x, y: y + NH / 2 + 2 + (i - (lines.length - 1) / 2) * 18, 'text-anchor': 'middle'});
     text.textContent = line; g.append(text);
    });
    const tally = svgEl('text', {class: 'map-tally', x: x + NW / 2 - 6, y: y + NH - 6, 'text-anchor': 'end'});
    tally.textContent = node.books.length ? String(node.books.length) : '';
    g.append(tally, svgEl('circle', {class: 'map-done', cx: x - NW / 2 + 9, cy: y + 9, r: 3.5}));
    g.addEventListener('click', () => select(node.id, {reveal: true}));
    g.addEventListener('keydown', event => {
     if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node.id, {reveal: true}); }
    });
    boxes.append(g); nodeEls.set(node.id, g);
   }
  }

  function bookItem(id, here) {
   const row = rows.get(id);
   const item = el('li');
   item.append(titleLink(row));
   if (row.language && row.language !== 'en') {
    item.append(el('span', 'map-chip', languageLabel(row.language)));
   }
   item.append(el('span', 'map-meta', [row.authors, row.year].filter(Boolean).join(', ')));
   const others = map.nodes.filter(node => node.id !== here && node.books.includes(id)).map(node => node.id);
   const also = el('span', 'map-also');
   if (others.length) {
    also.append(t('map.also', 'Also covers:'));
    for (const other of others) also.append(button(name(other), 'text-button', () => select(other)));
   }
   also.append(button(t('map.inCatalog', 'Show in catalog'), 'text-button', () => showResource(id)));
   item.append(also);
   return item;
  }
  function linkList(edges, kind) {
   if (!edges.length) {
    return el('p', 'map-empty', kind === 'pre' ? t('map.start', 'A starting point: nothing on this map comes before it.')
     : t('map.end', 'A destination on this map.'));
   }
   const list = el('ul', 'map-links ' + kind);
   for (const edge of edges) {
    const other = kind === 'pre' ? edge.from : edge.to;
    const item = el('li');
    item.append(button(name(other), 'map-to', () => select(other)),
     el('span', 'map-why', t(`map.edge.${edge.from}.${edge.to}`, edge.why)));
    list.append(item);
   }
   return list;
  }
  function heading(text, count) {
   const h = el('h3', undefined, text);
   if (count) h.append(el('small', undefined, count));
   return h;
  }

  function select(id, {reveal = false} = {}) {
   if (!nodes.has(id)) return;
   current = id;
   const node = nodes.get(id);
   const pre = map.edges.filter(edge => edge.to === id), next = map.edges.filter(edge => edge.from === id);
   const route = readingRoute(map, id);
   const preIds = new Set(pre.map(edge => edge.from)), nextIds = new Set(next.map(edge => edge.to)), routeIds = new Set(route);
   svg.classList.add('map-dim');
   for (const [nodeId, g] of nodeEls) {
    g.classList.toggle('sel', nodeId === id);
    g.classList.toggle('pre', preIds.has(nodeId));
    g.classList.toggle('next', nextIds.has(nodeId));
    g.classList.toggle('route', routeIds.has(nodeId) && nodeId !== id && !preIds.has(nodeId));
    g.classList.toggle('studied', studied.has(nodeId));
    g.setAttribute('aria-pressed', String(nodeId === id));
   }
   for (const {edge, path} of edgeEls) {
    path.classList.toggle('pre', edge.to === id);
    path.classList.toggle('next', edge.from === id);
    path.classList.toggle('route', edge.to !== id && routeIds.has(edge.to) && routeIds.has(edge.from));
   }
   const box = el('input'); box.type = 'checkbox'; box.id = 'theory-studied'; box.checked = studied.has(id);
   box.addEventListener('change', () => {
    if (box.checked) studied.add(id); else studied.delete(id);
    saveStudied(); select(id);
   });
   const studyLabel = el('label', 'map-study'); studyLabel.htmlFor = box.id;
   studyLabel.append(box, t('map.studied', 'I have studied this'));
   const books = node.books.filter(bookId => rows.has(bookId));
   const routeList = el('ol', 'map-route');
   for (const step of route) {
    const item = el('li', step === id ? 'here' : studied.has(step) ? 'studied' : '');
    item.append(button(name(step), '', () => select(step)));
    routeList.append(item);
   }
   const copy = button(t('map.copy', 'Copy link to this theory'), 'text-button', async () => {
    try { await navigator.clipboard.writeText(location.href); status.textContent = t('catalog.copied', 'Link copied.'); }
    catch (_) { status.textContent = t('catalog.copyFailed', 'Could not copy. Copy the address from the address bar instead.'); }
   });
   const status = el('span', 'subtle map-status'); status.setAttribute('role', 'status');
   const first = el('div', 'map-col'), second = el('div', 'map-col');
   const tools = el('p', 'map-tools'); tools.append(studyLabel, copy, status);
   first.append(el('p', 'map-layer', t('map.layer.' + node.layer, map.layers[node.layer])),
    el('h2', undefined, name(id)), el('p', 'map-summary', t('map.summary.' + id, node.summary)), tools,
    heading(t('map.pre', 'Builds on'), pre.length ? t('map.direct', '{n} direct', {n:pre.length}) : ''), linkList(pre, 'pre'),
    heading(t('map.next', 'Leads to'), next.length ? t('map.direct', '{n} direct', {n:next.length}) : ''), linkList(next, 'next'));
   second.append(heading(t('map.route', 'Reading route'), t('map.steps', '{n} steps', {n:route.length})), routeList,
    heading(t('map.books', 'In the catalog'), String(books.length)));
   if (books.length) {
    const list = el('ul', 'map-books');
    for (const bookId of books) list.append(bookItem(bookId, id));
    second.append(list);
   } else second.append(el('p', 'map-empty', t('map.noBooks', 'No catalog books for this theory yet.')));
   panel.replaceChildren(first, second);
   renderReady();
   onSelect(id);
   // After a click on the map, bring the details into view if they start below the screen.
   if (reveal && panel.getBoundingClientRect().top > window.innerHeight - 120) panel.scrollIntoView({block: 'start'});
  }

  // Study progress and the theories whose prerequisites are all marked studied.
  function renderReady() {
   const line = $('map-ready');
   const done = map.nodes.filter(node => studied.has(node.id)).length;
   const ready = readyTheories(map, studied);
   line.replaceChildren(el('span', 'map-ready-count', t('map.studiedCount', '{n} of {total} studied', {n:done, total:map.nodes.length})));
   if (!ready.length) { line.append(' ', t('map.allDone', 'Every theory on the map is marked studied.')); return; }
   line.append(' ', t('map.ready', 'Ready to study next:'));
   for (const id of ready) line.append(' ', button(name(id), 'map-ready-theory', () => select(id, {reveal: true})));
  }

  function render() {
   if (!map) return;
   const books = new Set(map.nodes.flatMap(node => node.books));
   $('map-count').textContent = t('map.count', '{theories} theories, {edges} connections, {books} catalog books',
    {theories:map.nodes.length, edges:map.edges.length, books:books.size});
   draw();
   select(current || (nodes.has(initial) ? initial : 'padic'));
  }
  fetch('map.json', {cache:'no-cache'}).then(response => {
   if (!response.ok) throw Error('Map unavailable');
   return response.json();
  }).then(data => {
   if (data.schema !== 1 || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !Array.isArray(data.layers)) throw Error('Invalid map');
   // Only books that are in this catalog are shown.
   for (const node of data.nodes) node.books = node.books.filter(id => rows.has(id));
   map = data; nodes = new Map(data.nodes.map(node => [node.id, node]));
   render();
  }).catch(() => {
   panel.replaceChildren(el('p', 'map-empty', t('map.failed', 'The theory map could not be loaded. Refresh the page to try again.')));
  });
  if (window.FormosaI18n) window.FormosaI18n.onChange(render);
  // refresh() redraws the details, for example after a local library is connected.
  return {refresh: () => { if (map && current) select(current); }, show: id => { if (map) select(id); else initial = id; },
   get current() { return current; }};
 }
 return {readingRoute, readyTheories, wrapLabel, init};
})();
