// Derived meeting analytics. Pure functions over a normalised meeting record.

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
  return {
    ...m,
    duration_minutes: dur(m.meeting_start_time, m.meeting_end_time),
    health: health(m),
    status: m.is_upcoming_meeting ? 'Upcoming' : (m.meeting_end_time ? 'Completed' : 'In Progress'),
    has_recording: !!m.summary_content,
    // Real join/leave times from Zoom, not estimates.
    participant_details: (m.attendees || []).map(a => ({
      name: a.user_name || 'Unknown',
      email: a.user_email || '',
      join_time: a.join_time || '',
      leave_time: a.leave_time || '',
      active_min: a.active_min || 0,
      is_host: !!a.is_host,
    })),
  };
}
