import { loadData, dur, health, cors } from './lib.js';
export default function handler(req, res) {
  cors(res);
  const meetings = loadData();
  const rows = meetings.map(m => {
    const d = dur(m.meeting_start_time, m.meeting_end_time);
    const h = health(m);
    const st = m.is_upcoming_meeting ? 'Upcoming' : (m.meeting_end_time ? 'Completed' : 'In Progress');
    return {
      'Meeting Topic': m.meeting_topic || '', 'Meeting ID': m.meeting_id || '', Status: st,
      Host: m.owner_name || '', 'Host Email': m.host_email || '',
      'Scheduled Start': m.schedule_start_time_display || '', 'Scheduled End': m.schedule_end_time_display || '',
      'Actual Start': m.meeting_start_time_display || '', 'Actual End': m.meeting_end_time_display || '',
      'Duration (min)': d, 'Participants': m.participant_size || 0,
      'Participant Names': (m.attendees || []).map(a => a.user_name || '').join(', '),
      'Participant Emails': (m.attendees || []).filter(a => a.user_email).map(a => a.user_email).join(', '),
      'Health Score': h.score, 'Health Label': h.label,
      'Has Recording': m.summary_content ? 'Yes' : 'No',
      'Summary': (m.summary_content || '').substring(0, 500),
      'Join URL': m.join_url || '', 'Meeting Number': m.meeting_number || '',
    };
  });
  res.json({ rows, total: rows.length });
}
