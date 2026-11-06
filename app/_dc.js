// Local stand-in for the claude.ai .dc.html runtime: holes, sc-if, sc-for, events, React state, dc-import.
// Used by _harness.html (local preview) and web/index.html (live Mapbox page). Never published to the canvas.
(function () {
const h = React.createElement;
function get(path, scope) {
  path = path.trim();
  if (path === 'true') return true; if (path === 'false') return false;
  if (/^-?\d/.test(path)) return +path;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
}
function interp(str, scope) {
  const m = str.match(/^\s*\{\{([^}]+)\}\}\s*$/);
  if (m) return get(m[1], scope);
  return str.replace(/\{\{([^}]+)\}\}/g, (_, p) => { const v = get(p, scope); return v == null ? '' : v; });
}
function styleObj(s) {
  const o = {};
  s.split(';').forEach(d => { const i = d.indexOf(':'); if (i < 0) return; const k = d.slice(0, i).trim(); if (!k) return;
    o[k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = d.slice(i + 1).trim(); });
  return o;
}
function props(el, scope, key) {
  const p = { key };
  for (const a of el.attributes) {
    let n = a.name, v = a.value;
    if (n.startsWith('hint-')) continue;
    let val = /\{\{/.test(v) ? interp(v, scope) : v;
    if (n === 'class') n = 'className';
    else if (n === 'for') n = 'htmlFor';
    else if (/^on[a-z]+$/.test(n)) n = 'on' + n[2].toUpperCase() + n.slice(3);
    if (n === 'style' && typeof val === 'string') val = styleObj(val);
    p[n] = val;
  }
  return p;
}
const COMPS = {};   // name -> React component, for dc-import
const loadedCss = new Set();
function addCss(href) {
  if (!href || loadedCss.has(href)) return; loadedCss.add(href);
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}
function build(node, scope, key) {
  if (node.nodeType === 3) { const t = node.nodeValue; return /\{\{/.test(t) ? h('span', { key }, String(interp(t, scope) ?? '')) : t; }
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  if (tag === 'helmet' || tag === 'script') return null;
  const kids = (sc) => Array.from(node.childNodes).map((c, i) => build(c, sc, i));
  if (tag === 'sc-if') return get(node.getAttribute('value').replace(/[{}]/g, ''), scope) ? h(React.Fragment, { key }, kids(scope)) : null;
  if (tag === 'sc-for') {
    const list = get(node.getAttribute('list').replace(/[{}]/g, ''), scope) || [];
    const as = node.getAttribute('as');
    return h(React.Fragment, { key }, list.map((it, i) => h(React.Fragment, { key: i }, kids({ ...scope, [as]: it, $index: i }))));
  }
  if (tag === 'dc-import') {
    const C = COMPS[node.getAttribute('name')]; if (!C) return null;
    const p = { key }; for (const a of node.attributes) if (a.name !== 'name' && !a.name.startsWith('hint-')) p[a.name] = /\{\{/.test(a.value) ? interp(a.value, scope) : a.value;
    const size = (node.getAttribute('hint-size') || '').split(',');
    return h('div', { key, style: size.length === 2 ? { width: size[0].trim(), height: size[1].trim(), position: 'relative', overflow: 'hidden' } : null }, h(C, p));
  }
  return h(node.namespaceURI === 'http://www.w3.org/2000/svg' ? node.tagName : tag, props(node, scope, key), ...(node.childNodes.length ? kids(scope) : []));
}
// Load a .dc.html file, its stylesheets and everything it imports; returns its component.
async function load(name) {
  const src = await fetch(name).then(r => { if (!r.ok) throw new Error(name + ' ' + r.status); return r.text(); });
  const doc = new DOMParser().parseFromString(src, 'text/html');
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => addCss(l.getAttribute('href')));
  doc.querySelectorAll('helmet style').forEach(s => { const st = document.createElement('style'); st.textContent = s.textContent; document.head.appendChild(st); });
  const tpl = doc.querySelector('x-dc');
  for (const imp of tpl.querySelectorAll('dc-import')) {
    const n = imp.getAttribute('name'); if (!COMPS[n]) COMPS[n] = await load(n + '.dc.html');
  }
  const code = doc.querySelector('script[type="text/x-dc"]').textContent;
  class DCLogic extends React.Component { render() { const v = this.renderVals(); return h(React.Fragment, null, Array.from(tpl.childNodes).map((c, i) => build(c, v, i))); } }
  return new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
}
window.DC = { load, h };
})();
