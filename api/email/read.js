// POST /api/email/read — mark a message read.  Body: { id }  Owner-only.
const L = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured()) return res.status(503).json({ error: 'CRM datastore not configured' });

  const b = L.readBody(req);
  const id = b.id;
  if (id == null) return res.status(400).json({ error: 'id required' });
  try {
    await L.sbUpdate('messages', `id=eq.${encodeURIComponent(id)}&tenant_id=eq.${L.TENANT()}`, { unread: false });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to update' });
  }
};
