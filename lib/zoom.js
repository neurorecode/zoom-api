// Zoom Server-to-Server OAuth client.
//
// Credentials come from the environment, never from the repo:
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
// Without them the app serves the bundled snapshot alone (see data.js).

const TOKEN_URL = 'https://zoom.us/oauth/token';
const API = 'https://api.zoom.us/v2';

let token = null;

export function isConfigured() {
  return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function accessToken() {
  if (token && Date.now() < token.expiresAt) return token.value;

  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`Zoom auth failed (${res.status}): ${(await res.text()).slice(0, 200)}`);

  const body = await res.json();
  // Refresh a minute early so a token never expires mid-request.
  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return token.value;
}

// A UUID that starts with / or contains // must be double-encoded for Zoom.
export function encodeUuid(uuid) {
  const once = encodeURIComponent(uuid);
  return (uuid.startsWith('/') || uuid.includes('//')) ? encodeURIComponent(once) : once;
}

export async function zoomGet(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) {
    const err = new Error(`Zoom ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Returns null for the "expected" misses: a room with no past instances,
// a meeting with no AI summary. Real failures still throw.
export async function zoomGetOptional(path, params) {
  try {
    return await zoomGet(path, params);
  } catch (e) {
    if (e.status === 400 || e.status === 404) return null;
    throw e;
  }
}

export async function zoomGetAll(path, params, key, maxPages = 10) {
  const out = [];
  let next;
  for (let i = 0; i < maxPages; i++) {
    const body = await zoomGet(path, { ...params, page_size: 300, next_page_token: next });
    out.push(...(body[key] || []));
    next = body.next_page_token;
    if (!next) break;
  }
  return out;
}

// Zoom rate-limits hard, so fan out in small batches rather than all at once.
export async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
  }
  return out;
}
