// Vercel serverless function — first-party, cookie-free analytics.
// The tracker in app.js POSTs page views + contact clicks here; we
// store them in Supabase so the owner dashboard can show live traffic.
const TYPES = ['pageview', 'wa_click', 'ig_click', 'call_click', 'email_click', 'form_start', 'form_submit'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (!TYPES.includes(body.type)) return res.status(400).json({ error: 'bad type' });

  // No datastore configured yet? Accept silently so the site never sees errors.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE || !process.env.TENANT_APEX) {
    return res.status(200).json({ ok: true });
  }

  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/events`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        tenant_id: process.env.TENANT_APEX,
        type: body.type,
        path: (body.path || '').slice(0, 300),
        referrer: (body.referrer || 'Direct').slice(0, 120),
        session: (body.session || '').slice(0, 60),
        duration: Number.isFinite(body.duration) ? Math.min(body.duration, 3600) : null
      })
    });
  } catch { /* swallow — analytics must never break the page */ }
  return res.status(200).json({ ok: true });
};
