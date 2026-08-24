// GET|POST /api/whatsapp/refresh — refresh Embedded Signup tokens before they
// expire. Embedded Signup issues a System-User token that expires in ~60 days;
// exchanging a still-valid one for a fresh 60-day token keeps connections alive.
// Vercel Cron (Authorization: Bearer <CRON_SECRET>) or manual (Bearer <CRM_TOKEN>).
//
//   GET https://graph.facebook.com/v20.0/oauth/access_token
//     ?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET
//     &set_token_expires_in_60_days=true&fb_exchange_token=<current token>
//
// Only rows with a non-null token_expires_at are expiring (manual permanent
// tokens have null and are skipped). We refresh anything within 14 days of expiry.
const L = require('../email/_lib');
const GRAPH = 'https://graph.facebook.com/v20.0';
const DAY = 86400000;

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
  const appId = process.env.WHATSAPP_APP_ID, appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) return res.status(503).json({ error: 'WHATSAPP_APP_ID / WHATSAPP_APP_SECRET not set' });

  const cutoff = new Date(Date.now() + 14 * DAY).toISOString();   // refresh anything expiring within 14 days
  let rows;
  try {
    rows = await L.sbSelect('whatsapp_connections', `tenant_id=eq.${L.TENANT()}&status=eq.active&token_expires_at=not.is.null&token_expires_at=lte.${cutoff}&select=id,access_token`);
  } catch (err) { return res.status(502).json({ error: 'Failed to load connections' }); }

  let refreshed = 0; const results = [];
  for (const c of (rows || [])) {
    try {
      const cur = L.decrypt(c.access_token);
      const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&set_token_expires_in_60_days=true&fb_exchange_token=${encodeURIComponent(cur)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || !j.access_token) {
        await L.sbUpdate('whatsapp_connections', `id=eq.${c.id}&tenant_id=eq.${L.TENANT()}`, { last_error: 'token refresh failed: ' + ((j.error && j.error.message) || r.status) }).catch(() => {});
        results.push({ id: c.id, error: true });
        continue;
      }
      const expMs = Date.now() + ((Number(j.expires_in) || 60 * 86400) * 1000);
      await L.sbUpdate('whatsapp_connections', `id=eq.${c.id}&tenant_id=eq.${L.TENANT()}`, { access_token: L.encrypt(j.access_token), token_expires_at: new Date(expMs).toISOString(), last_error: null });
      refreshed++; results.push({ id: c.id, ok: true });
    } catch (err) {
      await L.sbUpdate('whatsapp_connections', `id=eq.${c.id}&tenant_id=eq.${L.TENANT()}`, { last_error: String(err.message || err).slice(0, 200) }).catch(() => {});
      results.push({ id: c.id, error: true });
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ due: (rows || []).length, refreshed, results });
};
