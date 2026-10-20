import { loadData, enrich, cors } from './lib.js';

export default function handler(req, res) {
  cors(res);
  const meetings = loadData();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const search = (url.searchParams.get('search') || '').toLowerCase();
  const status = url.searchParams.get('status') || '';
  const dateFrom = url.searchParams.get('dateFrom') || '';
  const dateTo = url.searchParams.get('dateTo') || '';
  const durMin = parseFloat(url.searchParams.get('durMin') || '0');
  const durMax = parseFloat(url.searchParams.get('durMax') || '99999');
  const healthMin = parseInt(url.searchParams.get('healthMin') || '0');
  const partMin = parseInt(url.searchParams.get('partMin') || '0');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const sort = url.searchParams.get('sort') || 'date_desc';

  let enriched = meetings.map((m, idx) => ({ ...enrich(m), _idx: idx }));

  if (status) enriched = enriched.filter(m => m.status.toLowerCase() === status.toLowerCase());
  if (search) enriched = enriched.filter(m =>
    (m.meeting_topic || '').toLowerCase().includes(search) ||
    (m.owner_name || '').toLowerCase().includes(search) ||
    (m.meeting_id || '').toLowerCase().includes(search) ||
    (m.attendees || []).some(a => (a.user_name || '').toLowerCase().includes(search) || (a.user_email || '').toLowerCase().includes(search))
  );
  if (dateFrom) {
    const fromTs = new Date(dateFrom).getTime();
    enriched = enriched.filter(m => (m.meeting_start_time || m.schedule_start_time || 0) >= fromTs);
  }
  if (dateTo) {
    const toTs = new Date(dateTo + 'T23:59:59').getTime();
    enriched = enriched.filter(m => (m.meeting_start_time || m.schedule_start_time || Infinity) <= toTs);
  }
  if (durMin > 0) enriched = enriched.filter(m => m.duration_minutes >= durMin);
  if (durMax < 99999) enriched = enriched.filter(m => m.duration_minutes <= durMax);
  if (healthMin > 0) enriched = enriched.filter(m => m.health.score >= healthMin);
  if (partMin > 0) enriched = enriched.filter(m => (m.participant_size || 0) >= partMin);

  // Sort
  const sortMap = {
    date_desc: (a, b) => (b.meeting_start_time || b.schedule_start_time || 0) - (a.meeting_start_time || a.schedule_start_time || 0),
    date_asc: (a, b) => (a.meeting_start_time || a.schedule_start_time || 0) - (b.meeting_start_time || b.schedule_start_time || 0),
    duration_desc: (a, b) => b.duration_minutes - a.duration_minutes,
    duration_asc: (a, b) => a.duration_minutes - b.duration_minutes,
    health_desc: (a, b) => b.health.score - a.health.score,
    health_asc: (a, b) => a.health.score - b.health.score,
    participants_desc: (a, b) => (b.participant_size || 0) - (a.participant_size || 0),
  };
  enriched.sort(sortMap[sort] || sortMap.date_desc);

  const total = enriched.length;
  const start = (page - 1) * limit;
  const paginated = enriched.slice(start, start + limit);

  res.json({ meetings: paginated, total, page, pages: Math.ceil(total / limit) });
}
