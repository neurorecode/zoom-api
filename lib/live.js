// Fetches the recent slice of Zoom activity and maps it onto the shape the
// snapshot already uses, so the API handlers stay unchanged.
//
// The 13 meeting rooms are recurring and reused for different clients, so each
// past *instance* is its own row: one meeting_number, many meeting_ids (UUIDs).

import { zoomGet, zoomGetOptional, zoomGetAll, encodeUuid, mapLimit } from './zoom.js';

const WINDOW_DAYS = Number(process.env.ZOOM_WINDOW_DAYS || 7);
const TZ_OFFSET_MIN = Number(process.env.ZOOM_TZ_OFFSET_MINUTES || 330); // IST, matching the snapshot
const WITH_SUMMARIES = process.env.ZOOM_FETCH_SUMMARIES !== 'false';
const CONCURRENCY = 5;

// "2026-10-19 14:57:25" in the snapshot's timezone.
function display(epochMs) {
  if (!epochMs) return '';
  return new Date(epochMs + TZ_OFFSET_MIN * 60000).toISOString().replace('T', ' ').substring(0, 19);
}

const ms = (iso) => (iso ? Date.parse(iso) : 0);

// Zoom's summary scope is not grantable on every account. Once a call comes
// back as a scope failure, stop asking for the rest of the run.
let summaryScopeDenied = false;

async function summaryFor(uuid) {
  if (!WITH_SUMMARIES || summaryScopeDenied) return '';
  let s;
  try {
    s = await zoomGet(`/meetings/${encodeUuid(uuid)}/meeting_summary`);
  } catch (e) {
    if (/does not contain scopes|4711/i.test(String(e.message))) summaryScopeDenied = true;
    return '';
  }
  if (!s) return '';
  const details = (s.summary_details || []).map(d => `${d.label}\n${d.summary}`).join('\n\n');
  return [s.summary_overview, details].filter(Boolean).join('\n\n');
}

async function buildInstance(inst, roomNumber, joinUrl) {
  const detail = await zoomGetOptional(`/past_meetings/${encodeUuid(inst.uuid)}`);
  if (!detail) return null;

  const [participants, summary_content] = await Promise.all([
    zoomGetAll(`/past_meetings/${encodeUuid(inst.uuid)}/participants`, {}, 'participants', 3).catch(() => []),
    summaryFor(inst.uuid).catch(() => ''),
  ]);

  const start = ms(detail.start_time);
  const end = ms(detail.end_time);

  return {
    meeting_topic: detail.topic || '',
    meeting_id: detail.uuid || inst.uuid,
    host_id: detail.host_id || '',
    owner_name: detail.user_name || '',
    host_email: detail.user_email || '',
    join_url: joinUrl || '',
    participant_size: detail.participants_count ?? participants.length,
    meeting_start_time: start,
    meeting_end_time: end,
    schedule_start_time: start,
    schedule_end_time: end,
    meeting_start_time_display: display(start),
    meeting_end_time_display: display(end),
    schedule_start_time_display: display(start),
    schedule_end_time_display: display(end),
    is_upcoming_meeting: false,
    meeting_number: String(detail.id || roomNumber),
    attendees: participants.map(p => ({ user_name: p.name || 'Unknown', user_email: p.user_email || '' })),
    summary_content,
  };
}

async function upcoming() {
  const list = await zoomGetAll('/users/me/meetings', { type: 'upcoming' }, 'meetings', 2).catch(() => []);
  return list.map(m => {
    const start = ms(m.start_time);
    const end = start + (m.duration || 0) * 60000;
    return {
      meeting_topic: m.topic || '',
      meeting_id: m.uuid || String(m.id),
      host_id: m.host_id || '',
      owner_name: m.host_email || '',
      host_email: m.host_email || '',
      join_url: m.join_url || '',
      participant_size: 0,
      meeting_start_time: 0,
      meeting_end_time: 0,
      schedule_start_time: start,
      schedule_end_time: end,
      meeting_start_time_display: '',
      meeting_end_time_display: '',
      schedule_start_time_display: display(start),
      schedule_end_time_display: display(end),
      is_upcoming_meeting: true,
      meeting_number: String(m.id),
      attendees: [],
      summary_content: '',
    };
  });
}

export function summariesDenied() { return summaryScopeDenied; }

// Returns rows for instances that finished inside the window and are not
// already in the snapshot, plus any upcoming meetings.
export async function fetchRecent(knownUuids, rooms) {
  const cutoff = Date.now() - WINDOW_DAYS * 86400000;

  const perRoom = await mapLimit(rooms, CONCURRENCY, async (room) => {
    const body = await zoomGetOptional(`/past_meetings/${room.number}/instances`);
    return (body?.meetings || [])
      .filter(i => ms(i.start_time) >= cutoff && !knownUuids.has(i.uuid))
      .map(i => ({ inst: i, room }));
  });

  const fresh = perRoom.flat();
  const built = await mapLimit(fresh, CONCURRENCY, ({ inst, room }) =>
    buildInstance(inst, room.number, room.join_url).catch(() => null));

  return { past: built.filter(Boolean), upcoming: await upcoming().catch(() => []) };
}

// Rooms to poll: every meeting_number in the snapshot, plus any room Zoom now
// lists that the snapshot has never seen.
export async function discoverRooms(snapshot) {
  const rooms = new Map();
  for (const m of snapshot) {
    if (m.meeting_number) rooms.set(String(m.meeting_number), { number: String(m.meeting_number), join_url: m.join_url || '' });
  }
  const live = await zoomGetAll('/users/me/meetings', { type: 'scheduled' }, 'meetings', 2).catch(() => []);
  for (const m of live) {
    const n = String(m.id);
    if (!rooms.has(n)) rooms.set(n, { number: n, join_url: m.join_url || '' });
  }
  return [...rooms.values()];
}
