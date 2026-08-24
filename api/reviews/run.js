// GET|POST /api/reviews/run — send any review-drip emails that are due.
// Vercel Cron (Authorization: Bearer <CRON_SECRET>) or manual (Bearer <CRM_TOKEN>).
const { L, THREE_DAYS, sendStep, loadSender } = require('./_shared');

function authed(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  return L.ownerOK(req);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!authed(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured() || !process.env.CRM_SECRET_KEY) return res.status(503).json({ error: 'Not configured' });

  const nowIso = new Date().toISOString();
  let due;
  try {
    due = await L.sbSelect('review_requests', `tenant_id=eq.${L.TENANT()}&status=eq.active&sent_count=lt.3&next_send_at=lte.${nowIso}&order=next_send_at.asc&limit=200`);
  } catch (err) { return res.status(502).json({ error: 'Failed to load due requests' }); }

  const senders = {};   // cache connection per from_account
  let sent = 0;
  const results = [];
  for (const r of (due || [])) {
    try {
      if (!(r.from_account in senders)) senders[r.from_account] = await loadSender(r.from_account);
      const conn = senders[r.from_account];
      if (!conn) { await L.sbUpdate('review_requests', `id=eq.${r.id}&tenant_id=eq.${L.TENANT()}`, { last_error: 'sending mailbox not connected' }).catch(() => {}); continue; }
      await sendStep(conn, r, r.sent_count);
      const n = r.sent_count + 1;
      const now = Date.now();
      await L.sbUpdate('review_requests', `id=eq.${r.id}&tenant_id=eq.${L.TENANT()}`, {
        sent_count: n, last_sent_at: new Date(now).toISOString(),
        next_send_at: n >= 3 ? null : new Date(now + THREE_DAYS).toISOString(),
        status: n >= 3 ? 'done' : 'active', last_error: null
      });
      sent++; results.push({ id: r.id, step: n });
    } catch (err) {
      await L.sbUpdate('review_requests', `id=eq.${r.id}&tenant_id=eq.${L.TENANT()}`, { last_error: String(err.message || err).slice(0, 200) }).catch(() => {});
      results.push({ id: r.id, error: true });
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ due: (due || []).length, sent, results });
};
