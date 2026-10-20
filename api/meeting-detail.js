import { loadData, enrich, cors } from './lib.js';

export default function handler(req, res) {
  cors(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Use numeric index instead of base64 meeting IDs to avoid URL encoding issues
  const idx = parseInt(url.searchParams.get('idx'));
  const meetings = loadData();
  if (isNaN(idx) || idx < 0 || idx >= meetings.length) {
    return res.status(404).json({ error: 'Meeting not found' });
  }
  const m = meetings[idx];
  res.json({ ...enrich(m), _idx: idx });
}
