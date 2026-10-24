'use strict';
window.FormosaLibraryConnection = {
 normalize(value) {
  try {
   if (typeof value !== 'string' || value.length > 2000 || /[\s\\]/.test(value)) return '';
   const url = new URL(value), host = url.hostname.toLowerCase();
   const local = url.protocol === 'http:' && host === '127.0.0.1';
   if ((!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search
       || !host.includes('.') || host.startsWith('[') || (!local && /^[\d.]+$/.test(host))
       || /(?:^|\.)(?:localhost|local|internal|lan|invalid)$/.test(host)) return '';
   url.hash = ''; return url.href;
  } catch (_) { return ''; }
 },
 init(data) {
  const $ = id => document.getElementById(id), key = 'formosa-library-address-v1';
  const live = Object.hasOwn(data, 'shared_pdfs') || Object.hasOwn(data, 'local_pdfs');
  const nav = $('pdf-library-nav'), banner = $('public-library-entry');
  if (!nav || !banner) return;
  nav.hidden = false;
  if (live) { nav.href = '#catalog'; banner.hidden = true; return; }
  const input = $('library-address'), status = $('library-connection-status');
  let address = '', stored = true;
  try { address = this.normalize(localStorage.getItem(key)); } catch (_) { stored = false; }
  const normalize = value => this.normalize(value);
  function refresh() {
   input.value = address;
   $('library-open-pdfs').href = address ? address + '#catalog' : '#library';
   $('library-open-search').href = address ? address + '#search' : '#library';
   $('public-open-pdfs').href = address ? address + '#catalog' : '#library';
   $('library-forget').hidden = !address;
   status.textContent = address
    ? (stored ? 'Library address saved in this browser. Choose Read PDFs or Search inside PDFs.'
              : 'Library address ready for this visit. Browser storage is unavailable.')
    : (stored ? 'Enter the public library address once to enable PDF reading and full-text search.'
              : 'Browser storage is unavailable. You can still connect for this visit.');
  }
  banner.hidden = false; $('search-nav').hidden = false;
  $('fulltext-public-notice').hidden = false;
  $('fulltext-public-notice').textContent = 'Full-text search opens the connected public PDF library. Its address stays in your browser. Configure the library if you have not connected yet.';
  $('library-settings').hidden = false;
  $('library-connection-form').addEventListener('submit', event => {
   event.preventDefault();
   const value = normalize(input.value.trim());
   if (!value) { status.textContent = 'Use the HTTPS root address of a public library, or the local address from your SSH launcher, with no sign-in details or query parameters.'; input.focus(); return; }
   address = value;
   try { localStorage.setItem(key, address); stored = true; } catch (_) { stored = false; }
   refresh();
  });
  $('library-forget').addEventListener('click', () => {
   address = '';
   try { localStorage.removeItem(key); } catch (_) { stored = false; }
   refresh(); input.focus();
  });
  // Capture the static form before legacy tunnel handlers can reject the saved address.
  $('fulltext-form').addEventListener('submit', event => {
   event.preventDefault(); event.stopImmediatePropagation();
   const query = $('fulltext-query').value.trim();
   if (!query || query.length > 200) { $('fulltext-status').textContent = 'Enter between 1 and 200 characters to search.'; return; }
   if (!address) { $('fulltext-status').textContent = 'Connect the public PDF library first.'; location.hash = 'library'; input.focus(); return; }
   const params = new URLSearchParams({query, page_size: $('fulltext-page-size')?.value || '12',
    fuzzy: $('fulltext-fuzzy')?.checked !== false ? '1' : '0', page: '1'});
   const book = $('fulltext-book')?.value; if (book) params.set('book', book);
   location.assign(address + '#search?' + params);
  }, true);
  refresh();
 }
};
