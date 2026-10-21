// Asks Zoom which scopes this app is actually missing.
//
// Zoom answers a scope failure with error 4711 and the required scope spelled
// out, e.g. "does not contain scopes:[meeting:read:list_past_instances:admin]".
// Reading that back is more reliable than guessing from the scope picker.

import { zoomGet } from './zoom.js';

const SCOPE_RE = /scopes:\s*\[([^\]]+)\]/i;

async function probe(label, path, params) {
  try {
    await zoomGet(path, params);
    return { endpoint: label, ok: true };
  } catch (e) {
    const msg = String(e.message || e);
    const m = msg.match(SCOPE_RE);
    return {
      endpoint: label,
      ok: false,
      status: e.status || null,
      required_scope: m ? m[1].trim() : null,
      zoom_said: msg.slice(0, 180),
    };
  }
}

// One cheap call per endpoint the dashboard depends on.
export async function probeScopes(sampleRoom, sampleUuid) {
  const checks = [
    ['list meetings',           '/users/me/meetings',                      { type: 'scheduled', page_size: 1 }],
    ['past meeting instances',  `/past_meetings/${sampleRoom}/instances`,  {}],
    ['past meeting detail',     `/past_meetings/${sampleUuid}`,            {}],
    ['past participants',       `/past_meetings/${sampleUuid}/participants`, { page_size: 1 }],
    ['meeting summary',         `/meetings/${sampleUuid}/meeting_summary`, {}],
  ];
  const results = [];
  for (const [label, path, params] of checks) results.push(await probe(label, path, params));

  const missing = [...new Set(results.filter(r => r.required_scope).map(r => r.required_scope))];
  return { results, missing_scopes: missing };
}
