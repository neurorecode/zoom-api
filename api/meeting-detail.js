import { getMeetings } from '../lib/meetings.js';
import { cors } from '../lib/http.js';
import { enrich } from '../lib/metrics.js';

export default async function handler(req, res) {
  cors(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Use numeric index instead of base64 meeting IDs to avoid URL encoding issues
  const idx = parseInt(url.searchParams.get('idx'));
  const meetings = await getMeetings();
  if (isNaN(idx) || idx < 0 || idx >= meetings.length) {
    return res.status(404).json({ error: 'Meeting not found' });
  }
  const m = meetings[idx];
  res.json({ ...enrich(m), _idx: idx });
}
