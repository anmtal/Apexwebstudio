// POST /api/email/move — move messages to a folder (delete → trash, restore
// → inbox, mark spam, etc). Body: { ids:[...], folder }  Owner-only.
const L = require('./_lib');
const FOLDERS = new Set(['inbox', 'sent', 'spam', 'trash', 'drafts', 'outbox']);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured()) return res.status(503).json({ error: 'CRM datastore not configured' });

  const b = L.readBody(req);
  const folder = String(b.folder || '').toLowerCase();
  if (!FOLDERS.has(folder)) return res.status(400).json({ error: 'invalid folder' });
  const list = (Array.isArray(b.ids) ? b.ids : []).map((x) => String(x).replace(/[^0-9]/g, '')).filter(Boolean);
  if (!list.length) return res.status(400).json({ error: 'no valid ids' });

  try {
    await L.sbUpdate('messages', `tenant_id=eq.${L.TENANT()}&id=in.(${list.join(',')})`, { folder });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to move messages' });
  }
};
