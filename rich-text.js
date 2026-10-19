'use strict';
// Build an allowlisted DOM; raw HTML, images and trusted TeX stay disabled.
window.FormosaRichText = (() => {
 const mathOptions = Object.freeze({output:'mathml', throwOnError:true, trust:false,
  strict:'error', maxExpand:200, maxSize:10});
 const formula = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^\\$\n])+?\$/gy;
 let parser;
 function markdown() {
  if (parser) return parser;
  parser = window.markdownit({html:false, linkify:false, typographer:false});
  parser.inline.ruler.before('escape', 'formosa_math', (state, silent) => {
   if (!['$', '\\'].includes(state.src[state.pos])) return false;
   formula.lastIndex = state.pos;
   const match = formula.exec(state.src);
   if (!match || match[0].length > 50000 || state.pos + match[0].length > state.posMax) return false;
   if (!silent) {
    const token = state.push('formosa_math', '', 0), raw = match[0];
    const width = raw.startsWith('$$') || raw.startsWith('\\') ? 2 : 1;
    token.content = raw.slice(width, -width);
    token.meta = {raw, display:raw.startsWith('$$') || raw.startsWith('\\[')};
   }
   state.pos += match[0].length;
   return true;
  });
  parser.block.ruler.before('fence', 'formosa_math_block', (state, start, end, silent) => {
   if (state.sCount[start] - state.blkIndent >= 4) return false;
   const begin = state.bMarks[start] + state.tShift[start];
   const open = state.src.slice(begin, begin + 2);
   if (!['$$', '\\['].includes(open)) return false;
   const finish = state.src.indexOf(open === '$$' ? '$$' : '\\]', begin + 2);
   if (finish < 0 || finish - begin > 50000) return false;
   let line = start;
   while (line < end && state.eMarks[line] < finish + 2) line++;
   if (line >= end || state.src.slice(finish + 2, state.eMarks[line]).trim()) return false;
   if (!silent) {
    const token = state.push('formosa_math_block', '', 0);
    token.block = true; token.content = state.src.slice(begin + 2, finish).trim();
    token.meta = {raw:state.src.slice(begin, finish + 2), display:true};
    token.map = [start, line + 1];
   }
   if (!silent) state.line = line + 1;
   return true;
  }, {alt:['paragraph', 'reference', 'blockquote', 'list']});
  return parser;
 }
 function safeLink(value) {
  if (/^#[A-Za-z0-9_.:-]+$/.test(value || '')) return value;
  try {
   const url = new URL(value);
   if (url.protocol === 'https:' && !url.username && !url.password
       && /^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname)
       && !/\.(?:localhost|local|internal|lan|invalid)$/i.test(url.hostname)) return url.href;
  } catch (_) {}
  return null;
 }
 function appendTokens(target, tokens, links, inline) {
  const stack = [target];
  const tags = new Set(['p','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li',
   'strong','em','s','table','thead','tbody','tr','th','td']);
  for (const token of tokens || []) {
   const parent = stack[stack.length - 1];
   if (token.type === 'inline') {
    appendTokens(parent, token.children, links, inline);
   } else if (token.type === 'formosa_math' || token.type === 'formosa_math_block') {
    const display = !inline && token.meta.display;
    const node = document.createElement(token.block ? 'div' : 'span');
    node.className = display ? 'math-block' : 'title-math';
    try { window.katex.render(token.content, node, {...mathOptions, displayMode:display, macros:{}}); }
    catch (_) { node.textContent = token.meta.raw; node.title = 'Formula could not be rendered'; }
    parent.append(node);
   } else if (token.type === 'code_inline') {
    const node = document.createElement('code'); node.textContent = token.content; parent.append(node);
   } else if (token.type === 'fence' || token.type === 'code_block') {
    const pre = document.createElement('pre'), code = document.createElement('code');
    code.textContent = token.content; pre.append(code); parent.append(pre);
   } else if (token.type === 'hardbreak' || token.type === 'hr') {
    parent.append(document.createElement(token.type === 'hr' ? 'hr' : 'br'));
   } else if (token.type === 'softbreak') {
    parent.append(document.createTextNode('\n'));
   } else if (token.nesting === 1 && (tags.has(token.tag) || token.type === 'link_open')) {
    const href = token.type === 'link_open' && links ? safeLink(token.attrGet('href')) : null;
    const node = document.createElement(token.type === 'link_open' ? (href ? 'a' : 'span') : token.tag);
    if (href) {
     node.href = href;
     if (!href.startsWith('#')) { node.target = '_blank'; node.rel = 'noopener noreferrer'; }
    }
    if (token.tag === 'ol' && /^\d{1,9}$/.test(token.attrGet('start') || '')) {
     node.setAttribute('start', token.attrGet('start'));
    }
    parent.append(node); stack.push(node);
   } else if (token.nesting === -1) {
    if (stack.length > 1) stack.pop();
   } else if (token.content) {
    parent.append(document.createTextNode(token.content));
   }
  }
 }
 function render(target, source, inline, options = {}) {
  const text = String(source ?? '').slice(0, 100000);
  target.replaceChildren();
  const tokens = inline ? markdown().parseInline(text, {}) : markdown().parse(text, {});
  appendTokens(target, tokens, options.links !== false, inline);
 }
 return {renderInline:(target, text, options) => render(target, text, true, options),
  renderBlock:(target, text, options) => render(target, text, false, options), mathOptions};
})();
