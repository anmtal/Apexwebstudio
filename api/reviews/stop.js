// POST /api/reviews/stop — stop a review-request drip (no more emails).
// Body: { id }  DELETE removes it entirely. Owner-only.
const { L } = require('./_shared');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured()) return res.status(503).json({ error: 'CRM datastore not configured' });

  const id = (req.query && req.query.id) || (L.readBody(req).id);
  const cid = String(id || '').replace(/[^0-9]/g, '');
  if (!cid) return res.status(400).json({ error: 'id required' });

  try {
    if (req.method === 'DELETE') await L.sbDelete('review_requests', `id=eq.${cid}&tenant_id=eq.${L.TENANT()}`);
    else await L.sbUpdate('review_requests', `id=eq.${cid}&tenant_id=eq.${L.TENANT()}`, { status: 'stopped', next_send_at: null });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to update' });
  }
};
