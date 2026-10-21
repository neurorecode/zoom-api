import { getMeetings, status } from '../lib/meetings.js';
import { cors } from '../lib/http.js';
import { encodeUuid } from '../lib/zoom.js';
import { probeScopes } from '../lib/probe.js';

// Says which build is serving, which Zoom account it reached, and what it found.
export default async function handler(req, res) {
  cors(res);
  const rows = await getMeetings();
  const st = status();

  const days = {};
  for (const m of rows) {
    const d = (m.meeting_start_time_display || '').substring(0, 10);
    if (d) days[d] = (days[d] || 0) + 1;
  }

  let scopes;
  if (st.configured && new URL(req.url, `http://${req.headers.host}`).searchParams.get('probe')) {
    const sample = rows.find(m => m.meeting_number && m.meeting_id && !m.is_upcoming_meeting);
    scopes = await probeScopes(sample?.meeting_number || '0', encodeUuid(sample?.meeting_id || 'x'))
      .catch(e => ({ error: String(e.message || e) }));
  }

  res.json({
    ok: true,
    deployment: {
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'unknown',
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      env: process.env.VERCEL_ENV || 'local',
    },
    zoom: st,
    total_meetings: rows.length,
    upcoming: rows.filter(m => m.is_upcoming_meeting).length,
    server_time: new Date().toISOString(),
    recent_days: Object.keys(days).sort().slice(-7).map(d => ({ date: d, meetings: days[d] })),
    scopes,
  });
}
