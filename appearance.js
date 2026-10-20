'use strict';
// Personal appearance settings. A background image chosen here stays in this browser:
// it is resized locally, kept in IndexedDB and shown only to this visitor. Nothing is
// uploaded, published or sent to the library computer. Other visitors see the default page.
window.FormosaAppearance = (() => {
 const SETTINGS = 'formosa-background-v1', DATABASE = 'formosa-appearance', STORE = 'images', KEY = 'background';
 const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
 const MAX_BYTES = 20 * 1024 * 1024, MAX_SIDE = 2400, MAX_STORED = 8 * 1024 * 1024;
 const FITS = ['cover', 'contain-right', 'contain-left'];
 const defaults = Object.freeze({strength:35, fit:'cover'});

 // Settings are clamped so a damaged or edited value can never hide the page text.
 function clean(value) {
  // A missing or blank value means "not chosen yet" (Number(null) would be 0, not the default).
  const raw = value && value.strength, strength = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
  return {strength:Number.isFinite(strength) ? Math.min(70, Math.max(10, Math.round(strength / 5) * 5)) : defaults.strength,
   fit:FITS.includes(value && value.fit) ? value.fit : defaults.fit};
 }
 // Raster images only: SVG and other formats are refused before anything is read.
 function check(file) {
  if (!file) return 'Choose an image file.';
  if (!TYPES.includes(file.type)) return 'Use a PNG, JPEG or WebP image.';
  if (!(file.size > 0) || file.size > MAX_BYTES) return 'Use an image smaller than 20 MB.';
  return '';
 }
 function apply(root, image, settings) {
  const style = root.style;
  if (!image) {
   delete root.dataset.background;
   style.removeProperty('--user-background');
   style.removeProperty('--user-background-opacity');
   return;
  }
  // The data URL comes from the browser's own canvas encoder, so it holds no quotes.
  style.setProperty('--user-background', 'url("' + image + '")');
  style.setProperty('--user-background-opacity', String(settings.strength / 100));
  root.dataset.background = settings.fit;
 }

 function database() {
  return new Promise((resolve, reject) => {
   if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
   const request = indexedDB.open(DATABASE, 1);
   request.onupgradeneeded = () => request.result.createObjectStore(STORE);
   request.onsuccess = () => resolve(request.result);
   request.onerror = () => reject(request.error);
  });
 }
 async function stored(mode, value) {
  const db = await database();
  try {
   return await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode), store = transaction.objectStore(STORE);
    const request = mode === 'readonly' ? store.get(KEY) : value === undefined ? store.delete(KEY) : store.put(value, KEY);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
   });
  } finally { db.close(); }
 }

 // Decode through a data URL (the page's CSP allows data: images, not blob:), then
 // re-encode on a canvas: this strips metadata and bounds the stored size.
 function readFile(file) {
  return new Promise((resolve, reject) => {
   const reader = new FileReader();
   reader.onload = () => resolve(reader.result);
   reader.onerror = () => reject(reader.error);
   reader.readAsDataURL(file);
  });
 }
 function decode(url) {
  return new Promise((resolve, reject) => {
   const image = new Image();
   image.onload = () => resolve(image);
   image.onerror = () => reject(new Error('This image could not be opened.'));
   image.src = url;
  });
 }
 async function prepare(file) {
  const image = await decode(await readFile(file));
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  // WebP keeps transparency (character art often has it) at a small size; PNG otherwise.
  let url = canvas.toDataURL('image/webp', 0.86);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');
  if (!/^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/.test(url)) throw new Error('This image could not be opened.');
  if (url.length > MAX_STORED) throw new Error('This image is too detailed to keep; try a smaller one.');
  return url;
 }

 function init() {
  const $ = id => document.getElementById(id), root = document.documentElement;
  let settings = {...defaults}, image = '', persistent = true;
  try { settings = clean(JSON.parse(localStorage.getItem(SETTINGS) || 'null')); } catch (_) { persistent = false; }
  const status = message => { $('background-status').textContent = message; };
  function controls() {
   $('background-strength').value = String(settings.strength);
   $('background-fit').value = settings.fit;
   $('background-strength-value').textContent = settings.strength + '%';
   for (const id of ['background-remove', 'background-adjust']) $(id).hidden = !image;
  }
  function saveSettings() {
   try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch (_) { persistent = false; }
  }
  function show() { apply(root, image, settings); controls(); }
  stored('readonly').then(value => {
   if (typeof value === 'string' && value.startsWith('data:image/')) { image = value; show(); }
  }).catch(() => { persistent = false; });

  $('background-file').addEventListener('change', async event => {
   const file = event.target.files && event.target.files[0];
   event.target.value = '';
   const problem = check(file);
   if (problem) { status(problem); return; }
   status('Preparing the image...');
   try {
    const prepared = await prepare(file);
    image = prepared; show();
    try { await stored('readwrite', prepared); status('Background saved in this browser only. Other visitors see the default page.'); }
    catch (_) { persistent = false; status('Background shown for this visit only; this browser does not allow saving it.'); }
   } catch (error) { status(error.message || 'This image could not be opened.'); }
  });
  $('background-remove').addEventListener('click', async () => {
   // The button hides itself, so focus moves on at once rather than after storage answers.
   image = ''; show(); $('background-file').focus();
   try { await stored('readwrite', undefined); } catch (_) {}
   status('Background removed.');
  });
  $('background-strength').addEventListener('input', () => {
   settings = clean({...settings, strength:$('background-strength').value}); saveSettings(); show();
  });
  $('background-fit').addEventListener('change', () => {
   settings = clean({...settings, fit:$('background-fit').value}); saveSettings(); show();
  });
  // The menu closes with Escape or a click elsewhere, returning focus to its button.
  const menu = $('appearance');
  document.addEventListener('keydown', event => {
   if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  document.addEventListener('click', event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  menu.addEventListener('toggle', () => { if (menu.open && !persistent) status('Browser storage is unavailable; changes last only for this visit.'); });

  // Long routes and concept lists get a quiet way back to the top.
  const top = $('back-to-top');
  const update = () => { top.hidden = window.scrollY < 900; };
  window.addEventListener('scroll', update, {passive:true});
  top.addEventListener('click', () => {
   window.scrollTo({top:0, behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
   $('main').focus({preventScroll:true});
  });
  controls(); update();
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
 return {clean, check, apply, defaults};
})();
