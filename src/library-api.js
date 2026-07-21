/**
 * Library admin API client — one-click publish from the browser.
 *
 * The tumei server runs a small admin API (deploy/library-api.py) behind
 * nginx at /api/. Every call carries the admin password in X-Admin-Token.
 * The password is remembered in sessionStorage after the first prompt —
 * cleared when the tab closes, unlike localStorage, to shrink how long a
 * same-origin script compromise could keep using it.
 *
 * The API lives only on audiobook.tumei.online — from local dev or the
 * GitHub Pages build we still talk to the production API (CORS enabled).
 */

const TOKEN_KEY = 'audiobook.adminToken';
const PROD_ORIGIN = 'https://audiobook.tumei.online';

/** API base URL: same origin on the tumei site, production otherwise. */
export function apiOrigin(loc = globalThis.location) {
  if (loc && loc.hostname === 'audiobook.tumei.online') return '';
  return PROD_ORIGIN;
}

/**
 * Normalize the admin's access input into an API query value.
 * "alice, Bob," → "alice,bob"; ""/"public"/"公开" → "public".
 */
export function normalizeAccessInput(raw) {
  const s = (raw || '').trim();
  if (!s || /^(public|公开)$/i.test(s)) return 'public';
  const codes = s.split(/[,，、\s]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
  return codes.length ? codes.join(',') : 'public';
}

/** Access value from the catalog → editable text for the admin. */
export function accessToInput(access) {
  return access === 'public' || !access ? 'public' : (access || []).join(', ');
}

/**
 * Server-safe book id from a title: lowercase [a-z0-9-] slug, must start
 * alphanumeric, ≤60 chars. Titles with no latin letters/digits (e.g. pure
 * Chinese) get a stable hash id so republishing overwrites the same book.
 */
export function makePublishId(title) {
  const raw = (title || '').trim();
  const slug = raw.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  if (slug) return slug;
  let h = 0;
  for (const ch of raw) h = (h * 31 + ch.codePointAt(0)) | 0;
  return 'book-' + (h >>> 0).toString(36);
}

export function getSavedToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function saveToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, { token, body, json } = {}) {
  const res = await fetch(`${apiOrigin()}${path}`, {
    method,
    headers: {
      'X-Admin-Token': token,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : body,
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (res.status === 401) { const e = new Error('管理员密码错误'); e.badToken = true; throw e; }
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data;
}

export const pingApi = (token) => request('GET', '/api/ping', { token });
export const fetchAdminCatalog = (token) => request('GET', '/api/catalog', { token });
export const setBookAccess = (token, bookId, access) =>
  request('POST', '/api/access', { token, json: { bookId, access } });
export const setValidCodes = (token, codes) =>
  request('POST', '/api/codes', { token, json: { codes } });
export const deleteBook = (token, bookId) =>
  request('DELETE', `/api/books/${encodeURIComponent(bookId)}`, { token });

/**
 * Upload a publish ZIP with progress reporting (XHR — fetch has no
 * upload progress). onProgress receives 0..1.
 */
export function uploadPublishZip(token, zipBlob, access, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${apiOrigin()}/api/publish?access=${encodeURIComponent(access)}`;
    xhr.open('POST', url);
    xhr.setRequestHeader('X-Admin-Token', token);
    xhr.responseType = 'json';
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      const data = xhr.response || {};
      if (xhr.status === 401) {
        const e = new Error('管理员密码错误'); e.badToken = true; reject(e);
      } else if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.error || `API ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('无法连接发布服务'));
    xhr.send(zipBlob);
  });
}
