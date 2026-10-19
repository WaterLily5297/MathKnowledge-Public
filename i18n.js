'use strict';
// English interface helpers retained for compatibility with the upstream UI.
window.FormosaI18n = (() => {
 const t = (key, english, values = {}) => String(english || key).replace(
  /\{([^}]+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
 const apply = () => { document.documentElement.lang = 'en'; };
 return {
  t, apply, set: apply, lang: 'en', locale: 'en-US', onChange() {},
  subject: (id, fallback) => fallback || id,
  subjectJa: () => '',
  type: (kind, fallback) => fallback || kind,
  language: (code, fallback) => fallback || code,
  number: value => Number(value).toLocaleString('en-US')
 };
})();
