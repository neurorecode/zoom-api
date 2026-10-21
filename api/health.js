import { loadData, loadSnapshot, liveStatus, cors } from '../lib/data.js';
import { encodeUuid } from '../lib/zoom.js';
import { probeScopes } from '../lib/probe.js';

// Reports where the data is coming from, so a stale dashboard can be diagnosed
// without reading build logs.
export default async function handler(req, res) {
  cors(res);
  const rows = await loadData();
  const status = liveStatus();

  const days = {};
  for (const m of rows) {
    const d = (m.meeting_start_time_display || '').substring(0, 10);
    if (d) days[d] = (days[d] || 0) + 1;
  }
  const recent = Object.keys(days).sort().slice(-7).map(d => ({ date: d, meetings: days[d] }));

  // /api/health?probe=1 asks Zoom which scopes are still missing.
  let scopes;
  if (status.configured && new URL(req.url, `http://${req.headers.host}`).searchParams.get('probe')) {
    const snap = loadSnapshot();
    const sample = snap.find(m => m.meeting_number && m.meeting_id) || {};
    scopes = await probeScopes(sample.meeting_number, encodeUuid(sample.meeting_id || ''))
      .catch(e => ({ error: String(e.message || e) }));
  }

  res.json({
    ok: true,
    scopes,
    zoom_configured: status.configured,
    source: status.configured ? (status.last_error ? 'snapshot (zoom error)' : 'snapshot + live') : 'snapshot only',
    snapshot_rows: loadSnapshot().length,
    live_rows_added: status.live_rows,
    total_rows: rows.length,
    cached_at: status.cached_at,
    cache_ttl_seconds: status.cache_ttl_seconds,
    last_error: status.last_error,
    server_time: new Date().toISOString(),
    recent_days: recent,
  });
}
