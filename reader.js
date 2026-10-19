'use strict';
// Local handles and paths stay in memory. This module makes no network requests.
window.FormosaReader = (() => {
 // Messages are English unless the optional interface translations are loaded.
 const t = (key, english) => (window.FormosaI18n ? window.FormosaI18n.t(key, english) : english);
 const formula = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^\\$\n])+?\$/g;
 const mathOptions = Object.freeze({output:'mathml',displayMode:false,throwOnError:true,
  trust:false,strict:'error',maxExpand:200,maxSize:10});
 function renderTitle(target, title) {
  target.replaceChildren();
  let end = 0;
  for (const match of title.matchAll(formula)) {
   target.append(document.createTextNode(title.slice(end, match.index)));
   const span = document.createElement('span'); span.className = 'title-math';
   const width = match[0].startsWith('$$') || match[0].startsWith('\\') ? 2 : 1;
   try {
    window.katex.render(match[0].slice(width, -width), span, {...mathOptions,macros:{}});
   } catch (_) {
    span.textContent = match[0]; span.title = t('reader.formula', 'Formula could not be rendered');
   }
   target.append(span); end = match.index + match[0].length;
  }
  target.append(document.createTextNode(title.slice(end)));
 }

 function pdfPath(value) {
  if (typeof value !== 'string' || value.length > 1500 || /[\x00-\x1f<>:"|?*]/.test(value.replace(/^[A-Za-z]:[\\/]/, ''))) return null;
  const path = value.replaceAll('\\', '/');
  const absolute = /^[A-Za-z]:\//.test(path);
  const parts = (absolute ? path.slice(3) : path).split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || !/\.pdf$/i.test(parts.at(-1))) return null;
  return {absolute,parts};
 }
 function catalogIndex(rows, publicIds) {
  if (!Array.isArray(rows) || rows.length > 100000) throw Error('Invalid local catalog');
  const records = new Map(), ambiguous = new Set();
  for (const row of rows) {
   if (!row || !publicIds.has(row.id) || row.kind !== 'pdf' || row.status !== 'downloaded') continue;
   const path = pdfPath(row.file);
   if (!path) continue;
   if (records.has(row.id)) ambiguous.add(row.id);
   records.set(row.id, path);
  }
  for (const id of ambiguous) records.delete(id);
  return records;
 }
 async function readCatalog(root) {
  // Read exactly one known metadata file; do not enumerate the selected tree.
  let file, base;
  try {
   const data = await root.getDirectoryHandle('data', {create:false});
   file = await (await data.getFileHandle('catalog.json', {create:false})).getFile();
   base = data;
  } catch (error) {
   if (!['NotFoundError', 'TypeMismatchError'].includes(error.name)) throw error;
   file = await (await root.getFileHandle('catalog.json', {create:false})).getFile();
   base = root;
  }
  if (file.size > 20000000) throw Error('Local catalog is too large');
  return {rows:JSON.parse(await file.text()),base};
 }
 async function resolvePdf(path, directories) {
  for (const directory of directories) {
   const candidates = [];
   if (!path.absolute && directory.library) candidates.push(path.parts);
   // External drives require a separately selected containing folder. The
   // file API receives only relative names inside explicitly selected folders.
   for (let n = path.parts.length - 2; n >= 0; n--) {
    if (path.parts[n].toLocaleLowerCase('en') === directory.handle.name.toLocaleLowerCase('en')) {
     candidates.push(path.parts.slice(n + 1));
    }
   }
   for (const parts of candidates) {
    let current = directory.handle;
    try {
     for (const part of parts.slice(0, -1)) current = await current.getDirectoryHandle(part, {create:false});
     const file = await (await current.getFileHandle(parts.at(-1), {create:false})).getFile();
     const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
     if (String.fromCharCode(...header) !== '%PDF-') throw Error('Selected file is not a PDF');
     return file;
    } catch (error) {
     if (!['NotFoundError', 'TypeMismatchError'].includes(error.name)) throw error;
    }
   }
  }
  throw Error('PDF storage folder is not connected');
 }

 function init(publicItems, refresh) {
  const connect = document.getElementById('connect-library');
  const storage = document.getElementById('connect-storage');
  const disconnect = document.getElementById('disconnect-library');
  const status = document.getElementById('local-status');
  const publicIds = new Set(publicItems.map(row => row.id));
  let records = new Map(), directories = [], busy = false, generation = 0;
  const urls = new Set();
  let last = null;
  const message = (key, text) => { last = [key, text]; status.textContent = t(key, text); };
  // Keep the latest status in the chosen interface language.
  if (window.FormosaI18n) window.FormosaI18n.onChange(() => { if (last) status.textContent = t(...last); });
  const release = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  function controls() {
   connect.disabled = busy; storage.disabled = busy; disconnect.disabled = busy;
   storage.hidden = !directories.length; disconnect.hidden = !directories.length;
  }
  async function choose(library) {
   if (busy) return;
   if (!window.showDirectoryPicker) {
    message('reader.noPicker', 'Local folder access requires a browser that supports directory access, such as Chrome or Edge.'); return;
   }
   busy = true; controls();
   try {
    const handle = await window.showDirectoryPicker({mode:'read',id:library ? 'formosa-library' : 'formosa-storage'});
    if (library) {
     const catalog = await readCatalog(handle);
     const next = catalogIndex(catalog.rows, publicIds);
     if (!next.size) throw Error('No matching PDFs');
     generation++; release(); records = next; directories = [{handle:catalog.base,library:true}];
     message('reader.connected', 'Local library connected. Open PDFs from the catalog. For files stored elsewhere, connect their storage folder.');
    } else {
     directories.push({handle,library:false});
     message('reader.storageConnected', 'Storage folder connected. Try opening the PDF again.');
    }
    refresh();
   } catch (error) {
    if (error.name !== 'AbortError') {
     if (library) message('reader.connectFailed', 'Could not connect. Choose the MathKnowledge folder containing catalog.json, and allow read access.');
     else message('reader.storageFailed', 'Could not connect the storage folder. Allow read access and try again.');
    }
   } finally { busy = false; controls(); }
  }
  connect.addEventListener('click', () => choose(true));
  storage.addEventListener('click', () => choose(false));
  disconnect.addEventListener('click', () => {
   generation++; records.clear(); directories = []; release(); controls(); refresh();
   message('reader.disconnected', 'Local library disconnected. Local file access has ended for this page.');
  });
  window.addEventListener('pagehide', release);
  controls();
  return {
   has: id => records.has(id),
   async open(id) {
    const path = records.get(id);
    if (!path) return;
    const currentGeneration = generation;
    // Open the tab during the click, before asynchronous file access, to avoid
    // popup blocking. Remove its opener before navigating to the PDF blob.
    const preview = window.open('about:blank', '_blank');
    if (!preview) { message('reader.popup', 'Allow a new tab to open the local PDF, then try again.'); return; }
    preview.opener = null;
    try {
     const file = await resolvePdf(path, directories);
     if (generation !== currentGeneration) { preview.close(); return; }
     const pdf = file.type === 'application/pdf' ? file : file.slice(0, file.size, 'application/pdf');
     const url = URL.createObjectURL(pdf); urls.add(url); preview.location.replace(url);
     message('reader.opened', 'PDF opened locally. No file was uploaded.');
    } catch (error) {
     preview.close();
     if (error.message === 'PDF storage folder is not connected') message('reader.outside', 'This PDF is outside the connected folders, or is missing. Connect its storage folder and try again.');
     else message('reader.readFailed', 'Could not read this PDF. Check its availability and folder permission, then try again.');
    }
   }
  };
 }
 return {renderTitle,init,pdfPath,catalogIndex,resolvePdf,readCatalog,mathOptions};
})();
