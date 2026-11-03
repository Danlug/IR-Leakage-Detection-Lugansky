// Reports: AES-GCM encrypted files in a public GitHub repo. The key lives only in the link fragment (#id.key),
// which browsers never send to a server, so the repo alone reveals nothing.
const REPORTS_REPO = 'Danlug/IR-Reports-Lugansky';
const RAW = `https://raw.githubusercontent.com/${REPORTS_REPO}/main/reports/`;
const VIEW_URL = typeof location === 'object' ? new URL('view.html', location.href).href : 'view.html';

const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const randId = (n = 12) => b64u(crypto.getRandomValues(new Uint8Array(n))).replace(/[-_]/g, 'x');

async function newKey() {
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return b64u(await crypto.subtle.exportKey('raw', k));
}
const importKey = s => crypto.subtle.importKey('raw', unb64u(s), 'AES-GCM', false, ['encrypt', 'decrypt']);

async function encrypt(keyStr, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyStr), bytes);
  const out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12); return out;
}
async function decrypt(keyStr, bytes) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await importKey(keyStr), bytes.slice(12));
}

const reportLink = (id, key) => `${VIEW_URL}#${id}.${key}`;
function parseLink(s) { const m = /#?([A-Za-z0-9]+)\.([A-Za-z0-9_-]{43})\s*$/.exec(s || ''); return m && { id: m[1], key: m[2] }; }

// Read: public, no token. cache: 'no-store' so a just-edited report is not served from the browser cache.
async function fetchFile(id, key, name) {
  const r = await fetch(`${RAW}${id}/${name}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return decrypt(key, new Uint8Array(await r.arrayBuffer()));
}
async function fetchReport(id, key) { return JSON.parse(new TextDecoder().decode(await fetchFile(id, key, 'report.enc'))); }

// Write: author only, needs a GitHub token with Contents read/write on REPORTS_REPO.
async function gh(token, method, path, body) {
  const r = await fetch(`https://api.github.com/repos/${REPORTS_REPO}/contents/reports/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, body: body && JSON.stringify(body),
  });
  if (method === 'GET' && r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function putFile(token, id, key, name, bytes) {
  const enc = await encrypt(key, bytes);
  let bin = ''; for (let i = 0; i < enc.length; i += 0x8000) bin += String.fromCharCode(...enc.subarray(i, i + 0x8000));
  const old = await gh(token, 'GET', `${id}/${name}`);
  await gh(token, 'PUT', `${id}/${name}`, { message: `report ${id}: ${name}`, content: btoa(bin), sha: old && old.sha });
}

if (typeof module === 'object') module.exports = { b64u, unb64u, newKey, encrypt, decrypt, parseLink, reportLink };
