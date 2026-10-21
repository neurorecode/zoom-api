// The one source of meeting data: Zoom, for whichever account the environment's
// credentials belong to. Nothing here is specific to any account.
//
// Recurring rooms are reused for different people, so every past *instance* is
// its own record: one meeting_number, many meeting_ids (UUIDs).
//
// Listing instances is cheap (one call per room); describing one costs two or
// three. So a sync lists everything, then describes at most BACKFILL_BUDGET new
// instances. While a backfill is outstanding the next request continues it, so
// the dashboard fills in over a few page loads instead of timing out on one.

import { isConfigured, zoomGet, zoomGetOptional, zoomGetAll, encodeUuid, mapLimit } from './zoom.js';

const WINDOW_DAYS      = Number(process.env.ZOOM_WINDOW_DAYS || 180);
const TZ_OFFSET_MIN    = Number(process.env.ZOOM_TZ_OFFSET_MINUTES || 0);
const CACHE_SECONDS    = Number(process.env.ZOOM_CACHE_SECONDS || 600);
const BACKFILL_BUDGET  = Number(process.env.ZOOM_BACKFILL_BUDGET || 60);
const CONCURRENCY      = Number(process.env.ZOOM_CONCURRENCY || 5);
const WITH_SUMMARIES   = process.env.ZOOM_FETCH_SUMMARIES !== 'false';

const byUuid = new Map();   // uuid -> meeting record
let rooms = [];
let syncedAt = 0;
let pending = 0;            // instances listed but not yet described
let lastError = null;
let summaryScopeDenied = false;

const ms = (iso) => (iso ? Date.parse(iso) : 0);

// "2026-10-20 09:00:00" in the configured timezone.
function display(epochMs) {
  if (!epochMs) return '';
  return new Date(epochMs + TZ_OFFSET_MIN * 60000).toISOString().replace('T', ' ').substring(0, 19);
}

async function summaryFor(uuid) {
  if (!WITH_SUMMARIES || summaryScopeDenied) return '';
  try {
    const s = await zoomGet(`/meetings/${encodeUuid(uuid)}/meeting_summary`);
    const details = (s.summary_details || []).map(d => `${d.label}\n${d.summary}`).join('\n\n');
    return [s.summary_overview, details].filter(Boolean).join('\n\n');
  } catch (e) {
    // The summary scope is not grantable on every account; stop asking once refused.
    if (/does not contain scopes|4711/i.test(String(e.message))) summaryScopeDenied = true;
    return '';
  }
}

async function describe(uuid, room) {
  const d = await zoomGetOptional(`/past_meetings/${encodeUuid(uuid)}`);
  if (!d) return null;

  const [people, summary_content] = await Promise.all([
    zoomGetAll(`/past_meetings/${encodeUuid(uuid)}/participants`, {}, 'participants', 3).catch(() => []),
    summaryFor(uuid),
  ]);

  const start = ms(d.start_time), end = ms(d.end_time);
  return {
    meeting_topic: d.topic || '',
    meeting_id: d.uuid || uuid,
    host_id: d.host_id || '',
    owner_name: d.user_name || '',
    host_email: d.user_email || '',
    join_url: room?.join_url || '',
    participant_size: d.participants_count ?? people.length,
    meeting_start_time: start,
    meeting_end_time: end,
    schedule_start_time: start,
    schedule_end_time: end,
    meeting_start_time_display: display(start),
    meeting_end_time_display: display(end),
    schedule_start_time_display: display(start),
    schedule_end_time_display: display(end),
    is_upcoming_meeting: false,
    meeting_number: String(d.id || room?.number || ''),
    attendees: people.map((p, i) => ({
      user_name: p.name || 'Unknown',
      user_email: p.user_email || '',
      join_time: p.join_time || '',
      leave_time: p.leave_time || '',
      active_min: p.duration ? Math.round((p.duration / 60) * 10) / 10 : 0,
      is_host: i === 0,
    })),
    summary_content,
  };
}

function upcomingRecord(m) {
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
}

// Rooms are whatever this account hosts, from every listing Zoom offers.
// One listing failing is tolerable; all of them failing is a broken connection
// and must not be reported as an account with no meetings.
async function discoverRooms() {
  const found = new Map();
  const errors = [];
  const types = ['scheduled', 'upcoming', 'previous_meetings'];

  for (const type of types) {
    try {
      for (const m of await zoomGetAll('/users/me/meetings', { type }, 'meetings', 2)) {
        const n = String(m.id);
        if (n && !found.has(n)) found.set(n, { number: n, join_url: m.join_url || '' });
      }
    } catch (e) {
      errors.push(e);
    }
  }

  if (errors.length === types.length) throw errors[0];
  return [...found.values()];
}

async function sync() {
  rooms = await discoverRooms();
  const cutoff = Date.now() - WINDOW_DAYS * 86400000;

  const listed = await mapLimit(rooms, CONCURRENCY, async (room) => {
    const body = await zoomGetOptional(`/past_meetings/${room.number}/instances`);
    return (body?.meetings || [])
      .filter(i => ms(i.start_time) >= cutoff)
      .map(i => ({ uuid: i.uuid, room }));
  });

  const missing = listed.flat().filter(i => !byUuid.has(i.uuid));
  pending = Math.max(0, missing.length - BACKFILL_BUDGET);

  const batch = missing.slice(0, BACKFILL_BUDGET);
  const described = await mapLimit(batch, CONCURRENCY, i => describe(i.uuid, i.room).catch(() => null));
  for (const rec of described) if (rec) byUuid.set(rec.meeting_id, rec);

  // Upcoming meetings are replaced wholesale each sync, never backfilled.
  for (const [k, v] of byUuid) if (v.is_upcoming_meeting) byUuid.delete(k);
  const soon = await zoomGetAll('/users/me/meetings', { type: 'upcoming' }, 'meetings', 2).catch(() => []);
  for (const m of soon) { const r = upcomingRecord(m); byUuid.set(r.meeting_id, r); }

  syncedAt = Date.now();
}

export async function getMeetings() {
  if (!isConfigured()) return [];

  // Keep going while a backfill is outstanding; otherwise respect the cache.
  const fresh = Date.now() - syncedAt < CACHE_SECONDS * 1000;
  if (fresh && pending === 0) return [...byUuid.values()];

  try {
    await sync();
    lastError = null;
  } catch (e) {
    lastError = String(e.message || e);   // serve what we already have
  }
  return [...byUuid.values()];
}

export function status() {
  return {
    configured: isConfigured(),
    meetings_cached: byUuid.size,
    backfill_pending: pending,
    summaries: !WITH_SUMMARIES ? 'disabled' : (summaryScopeDenied ? 'scope denied' : 'on'),
    rooms: rooms.length,
    synced_at: syncedAt ? new Date(syncedAt).toISOString() : null,
    window_days: WINDOW_DAYS,
    tz_offset_minutes: TZ_OFFSET_MIN,
    last_error: lastError,
  };
}
