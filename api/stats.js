import { loadData, dur, health, cors } from './lib.js';

export default function handler(req, res) {
  cors(res);
  const meetings = loadData();
  const enriched = meetings.map(m => {
    const d = dur(m.meeting_start_time, m.meeting_end_time);
    const h = health(m);
    const st = m.is_upcoming_meeting ? 'Upcoming' : (m.meeting_end_time ? 'Completed' : 'In Progress');
    return { ...m, duration: d, health: h, status: st };
  });
  const completed = enriched.filter(m => m.status === 'Completed');
  const upcoming = enriched.filter(m => m.status === 'Upcoming');
  const withRec = enriched.filter(m => !!m.summary_content);
  const durations = completed.map(m => m.duration).filter(d => d > 0);
  const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length * 10) / 10 : 0;
  const totalHrs = Math.round(durations.reduce((a, b) => a + b, 0) / 60 * 10) / 10;
  const maxDur = durations.length ? Math.max(...durations) : 0;
  const minDur = durations.length ? Math.min(...durations) : 0;
  const healthDist = {}; completed.forEach(m => { healthDist[m.health.label] = (healthDist[m.health.label] || 0) + 1; });
  const scores = completed.map(m => m.health.score);
  const avgHealth = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;

  const pFreq = {}; const pDur = {};
  enriched.forEach(m => (m.attendees || []).forEach(a => {
    const n = a.user_name || 'Unknown';
    if (n !== 'Coach Neuro Recode') { pFreq[n] = (pFreq[n] || 0) + 1; pDur[n] = (pDur[n] || 0) + m.duration; }
  }));
  const topP = Object.entries(pFreq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, meetings]) => ({ name, meetings, totalMin: Math.round(pDur[name] || 0) }));
  const uniqueP = new Set(); enriched.forEach(m => (m.attendees || []).forEach(a => { const n = a.user_name || 'Unknown'; if (n !== 'Coach Neuro Recode') uniqueP.add(n); }));

  const daily = {}; const dailyDur = {};
  completed.forEach(m => { if (m.meeting_start_time_display) { const d = m.meeting_start_time_display.substring(0, 10); daily[d] = (daily[d] || 0) + 1; dailyDur[d] = (dailyDur[d] || 0) + m.duration; } });
  const dailyChart = Object.entries(daily).map(([date, meetings]) => ({ date, meetings, mins: Math.round(dailyDur[date] || 0) })).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

  const weekly = {};
  completed.forEach(m => { if (m.meeting_start_time) { const dt = new Date(m.meeting_start_time); const w = dt.getFullYear() + '-W' + String(Math.ceil(((dt - new Date(dt.getFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0'); weekly[w] = (weekly[w] || 0) + 1; } });
  const weeklyChart = Object.entries(weekly).map(([week, meetings]) => ({ week, meetings })).sort((a, b) => a.week.localeCompare(b.week)).slice(-12);

  const hourly = {};
  completed.forEach(m => { if (m.meeting_start_time_display) { try { const h = parseInt(m.meeting_start_time_display.split(' ')[1].split(':')[0]); hourly[h] = (hourly[h] || 0) + 1; } catch (e) { } } });
  const hourlyChart = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourly[h] || 0 }));

  // Day of week distribution
  const dow = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  completed.forEach(m => { if (m.meeting_start_time) { const d = new Date(m.meeting_start_time); dow[dowNames[d.getDay()]] += 1; } });
  const dowChart = Object.entries(dow).map(([day, count]) => ({ day, count }));

  // Duration distribution buckets
  const durBuckets = { '0-15m': 0, '15-30m': 0, '30-60m': 0, '60-90m': 0, '90m+': 0 };
  durations.forEach(d => { if (d < 15) durBuckets['0-15m']++; else if (d < 30) durBuckets['15-30m']++; else if (d < 60) durBuckets['30-60m']++; else if (d < 90) durBuckets['60-90m']++; else durBuckets['90m+']++; });
  const durChart = Object.entries(durBuckets).map(([range, count]) => ({ range, count }));

  // Participant size distribution
  const sizeBuckets = { '1:1': 0, '3-5': 0, '6-10': 0, '10+': 0 };
  enriched.forEach(m => { const p = m.participant_size || 0; if (p <= 2) sizeBuckets['1:1']++; else if (p <= 5) sizeBuckets['3-5']++; else if (p <= 10) sizeBuckets['6-10']++; else sizeBuckets['10+']++; });
  const sizeChart = Object.entries(sizeBuckets).map(([range, count]) => ({ range, count }));

  // Recording rate over time
  const recRate = {};
  enriched.forEach(m => { if (m.meeting_start_time_display) { const w = m.meeting_start_time_display.substring(0, 7); if (!recRate[w]) recRate[w] = { total: 0, rec: 0 }; recRate[w].total++; if (m.summary_content) recRate[w].rec++; } });
  const recChart = Object.entries(recRate).map(([month, v]) => ({ month, rate: Math.round(v.rec / v.total * 100) })).sort((a, b) => a.month.localeCompare(b.month));

  res.json({
    total_meetings: enriched.length, completed_meetings: completed.length, upcoming_meetings: upcoming.length,
    meetings_with_recordings: withRec.length, total_participants_unique: uniqueP.size,
    avg_duration_minutes: avgDur, total_hours: totalHrs, max_duration: maxDur, min_duration: minDur,
    avg_health_score: avgHealth, health_distribution: healthDist,
    top_participants: topP, daily_chart: dailyChart, weekly_chart: weeklyChart, hourly_chart: hourlyChart,
    dow_chart: dowChart, dur_chart: durChart, size_chart: sizeChart, rec_chart: recChart,
  });
}
