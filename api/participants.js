import { loadData, dur, cors } from './lib.js';
export default function handler(req, res) {
  cors(res);
  const meetings = loadData();
  const pm = {};
  meetings.forEach(m => {
    const d = dur(m.meeting_start_time, m.meeting_end_time);
    (m.attendees || []).forEach(a => {
      const n = a.user_name || 'Unknown';
      if (!pm[n]) pm[n] = { name: n, email: '', total_meetings: 0, total_min: 0, first_seen: null, last_seen: null, topics: new Set() };
      const p = pm[n]; p.email = a.user_email || p.email; p.total_meetings++; p.total_min += d;
      p.topics.add(m.meeting_topic || '');
      const ts = m.meeting_start_time || m.schedule_start_time;
      if (ts) { if (!p.first_seen || ts < p.first_seen) p.first_seen = ts; if (!p.last_seen || ts > p.last_seen) p.last_seen = ts; }
    });
  });
  const result = Object.values(pm).sort((a, b) => b.total_meetings - a.total_meetings).map(p => ({
    ...p, topics: [...p.topics].slice(0, 5),
    avg_min: p.total_meetings > 0 ? Math.round(p.total_min / p.total_meetings * 10) / 10 : 0,
    first_seen: p.first_seen ? new Date(p.first_seen).toISOString().substring(0, 16).replace('T', ' ') : null,
    last_seen: p.last_seen ? new Date(p.last_seen).toISOString().substring(0, 16).replace('T', ' ') : null,
  }));
  res.json({ participants: result, total: result.length });
}
