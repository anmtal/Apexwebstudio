// POST /api/email/clear — delete messages. Body: { ids:[...] } or { account }
// Owner-only. Removes CRM copies only; the mail stays in the real mailbox.
const L = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured()) return res.status(503).json({ error: 'CRM datastore not configured' });

  const b = L.readBody(req);
  try {
    if (Array.isArray(b.ids) && b.ids.length) {
      const list = b.ids.map((x) => String(x).replace(/[^0-9]/g, '')).filter(Boolean);   // live ids are bigints
      if (!list.length) return res.status(400).json({ error: 'no valid ids' });
      await L.sbDelete('messages', `tenant_id=eq.${L.TENANT()}&id=in.(${list.join(',')})`);
    } else if (b.account != null) {
      await L.sbDelete('messages', `tenant_id=eq.${L.TENANT()}&channel=eq.email&account=eq.${encodeURIComponent(b.account)}`);
    } else {
      return res.status(400).json({ error: 'ids or account required' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to clear messages' });
  }
};
