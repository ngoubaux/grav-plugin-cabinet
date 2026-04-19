/* Cabinet — pure utility functions */

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

function compactUuid(v) { return String(v||'').replace(/-/g,''); }

function uuidv4() {
  if(typeof crypto!=='undefined' && typeof crypto.randomUUID==='function')
    return compactUuid(crypto.randomUUID());
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

function normalizeUuid(v) { return String(v||'').replace(/-/g,'').toLowerCase(); }

function asPlainObject(v) {
  if(v && typeof v==='object' && !Array.isArray(v)) return v;
  if(Array.isArray(v)) return Object.assign({},v);
  return {};
}

function capitalize(text) {
  const v=String(text||'');
  return v ? v.charAt(0).toUpperCase()+v.slice(1) : '';
}

function toMinuteCount(v) {
  const n=parseInt(String(v||''),10);
  return Number.isFinite(n)&&n>0 ? n : 75;
}
