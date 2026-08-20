// Vercel serverless function — first-party, cookie-free website
// analytics. The tracker snippet (tracker-snippet.html) POSTs page
// views and contact-clicks here; we stamp and store them in Supabase.
// No third-party scripts, no cookies — a privacy-first selling point.
//
// DEPLOY: copy to /api/track.js and reuse the SUPABASE_* env vars.

const TENANT_IDS = { 'vip-diamond-barber': process.env.TENANT_VIP || '' };
const TYPES = ['pageview','wa_click','ig_click','call_click','email_click','form_start','form_submit'];

module.exports = async (req, res) => {
  // permissive CORS so the snippet works from the live site origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (!TYPES.includes(body.type)) return res.status(400).json({ error: 'bad type' });

  const row = {
    tenant_id: TENANT_IDS[(req.query && req.query.tenant) || 'vip-diamond-barber'],
    type: body.type,
    path: (body.path || '').slice(0, 300),
    referrer: (body.referrer || 'Direct').slice(0, 120),
    session: (body.session || '').slice(0, 60),
    duration: Number.isFinite(body.duration) ? Math.min(body.duration, 3600) : null
  };

  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/events`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });
    return res.status(200).json({ ok: true });
  } catch { return res.status(200).json({ ok: true }); } // never block the page
};
