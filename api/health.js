import { loadData, loadSnapshot, liveStatus, cors } from '../lib/data.js';

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

  res.json({
    ok: true,
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
