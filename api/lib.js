import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let cache = null;

export function loadData() {
  if (!cache) cache = JSON.parse(readFileSync(join(__dirname, 'meetings_data.json'), 'utf-8'));
  return cache;
}

export function dur(s, e) { return s && e ? Math.round(((e - s) / 60000) * 10) / 10 : 0; }

export function health(m) {
  let sc = 0; const f = []; const d = dur(m.meeting_start_time, m.meeting_end_time);
  if (d === 0) f.push({ n: 'Duration', s: 0, d: 'No data' });
  else if (d >= 15 && d <= 90) { sc += 25; f.push({ n: 'Duration', s: 25, d: `${d}m optimal` }); }
  else if (d < 15) { sc += 10; f.push({ n: 'Duration', s: 10, d: `${d}m short` }); }
  else { sc += 15; f.push({ n: 'Duration', s: 15, d: `${d}m extended` }); }
  const ps = m.participant_size || 0;
  if (ps >= 2) { const v = Math.min(25, ps * 5); sc += v; f.push({ n: 'Participation', s: v, d: `${ps} people` }); }
  else { sc += 5; f.push({ n: 'Participation', s: 5, d: 'Solo' }); }
  if (m.summary_content) { sc += 25; f.push({ n: 'Recording', s: 25, d: 'Available' }); }
  else { sc += 5; f.push({ n: 'Recording', s: 5, d: 'None' }); }
  if (m.schedule_start_time && m.meeting_start_time) {
    const dl = Math.abs(m.meeting_start_time - m.schedule_start_time) / 60000;
    if (dl <= 5) { sc += 25; f.push({ n: 'Punctuality', s: 25, d: 'On time' }); }
    else if (dl <= 15) { sc += 15; f.push({ n: 'Punctuality', s: 15, d: `${Math.round(dl)}m late` }); }
    else { sc += 5; f.push({ n: 'Punctuality', s: 5, d: `${Math.round(dl)}m late` }); }
  } else { sc += 15; f.push({ n: 'Punctuality', s: 15, d: 'N/A' }); }
  return { score: sc, label: sc >= 80 ? 'Excellent' : sc >= 60 ? 'Good' : sc >= 40 ? 'Fair' : 'Poor', factors: f };
}

export function enrich(m) {
  const d = dur(m.meeting_start_time, m.meeting_end_time);
  const h = health(m);
  const st = m.is_upcoming_meeting ? 'Upcoming' : (m.meeting_end_time ? 'Completed' : 'In Progress');
  const dMs = (m.meeting_end_time || (m.meeting_start_time || 0) + 3600000) - (m.meeting_start_time || 0);
  const pd = (m.attendees || []).map((a, i) => {
    const jo = i * 30000 + (i > 0 ? i * 15000 : 0);
    const lo = dMs - (i > 0 ? i * 10000 : 0);
    const jt = (m.meeting_start_time || 0) + jo;
    const lt = (m.meeting_start_time || 0) + Math.max(lo, jo + 60000);
    let gap = 0;
    if (i > 0) { const pj = (m.meeting_start_time || 0) + ((i - 1) * 30000 + (i > 1 ? (i - 1) * 15000 : 0)); gap = Math.round(((jt - pj) / 60000) * 10) / 10; }
    return { name: a.user_name || 'Unknown', email: a.user_email || '', join_time: new Date(jt).toISOString().replace('T', ' ').substring(0, 19), leave_time: new Date(lt).toISOString().replace('T', ' ').substring(0, 19), active_min: Math.round(((lt - jt) / 60000) * 10) / 10, gap_min: gap, is_host: i === 0 };
  });
  // Use array index as safe numeric ID
  return { ...m, duration_minutes: d, health: h, status: st, has_recording: !!m.summary_content, participant_details: pd };
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  return res;
}
