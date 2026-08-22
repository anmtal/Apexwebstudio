// GET|POST /api/email/sync — pull new mail for the tenant's connections.
// Invoked by Vercel Cron (Authorization: Bearer <CRON_SECRET>) or manually
// from the dashboard (Bearer <CRM_TOKEN>). Optional ?id= to sync one.
const L = require('./_lib');

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
  if (!L.sbConfigured() || !process.env.CRM_SECRET_KEY) return res.status(503).json({ error: 'Email connector not configured' });

  const id = (req.query && req.query.id) || '';
  const filter = id ? `id=eq.${id}` : `tenant_id=eq.${L.TENANT()}&status=neq.disabled`;

  let conns;
  try { conns = await L.sbSelect('email_connections', `${filter}&select=*`); }
  catch (err) { return res.status(502).json({ error: 'Failed to load connections' }); }

  const results = [];
  for (const c of (conns || [])) {
    try { const r = await L.syncConnection(c); results.push({ id: c.id, email: c.email, imported: r.inserted }); }
    catch (err) { results.push({ id: c.id, email: c.email, error: String(err.message || err).slice(0, 200) }); }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ synced: results.length, results });
};
