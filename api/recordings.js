import { loadData, dur, health, cors } from './lib.js';
export default function handler(req, res) {
  cors(res);
  const meetings = loadData();
  const recs = meetings.map((m, idx) => {
    if (!m.summary_content) return null;
    return {
      _idx: idx, meeting_id: m.meeting_id || '', topic: m.meeting_topic || '',
      date: m.meeting_start_time_display || '', duration: dur(m.meeting_start_time, m.meeting_end_time),
      participants: m.participant_size || 0, summary: m.summary_content || '',
      host: m.owner_name || '', health_score: health(m).score,
      attendees: (m.attendees || []).map(a => a.user_name || ''),
    };
  }).filter(Boolean);
  recs.sort((a, b) => b.date.localeCompare(a.date));
  res.json({ recordings: recs, total: recs.length });
}
