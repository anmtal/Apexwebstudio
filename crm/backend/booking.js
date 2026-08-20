// Vercel serverless function — receives a booking/enquiry from a
// client site, computes the conservative estimated value, stores it
// in Supabase, and (optionally) forwards to Make.com for notifications.
//
// DEPLOY: copy this to /api/booking.js in the site repo and set these
// env vars in Vercel → Settings → Environment Variables:
//   SUPABASE_URL           https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE  (service role key — server-side ONLY, never in the browser)
//   LEAD_WEBHOOK_URL       (optional Make.com hook for email/WhatsApp alerts)
//
// Point the booking form at:  fetch('/api/booking?tenant=<slug>', { method:'POST', ... })

// Price list per tenant slug — the same numbers shown on the site.
const PRICES = {
  'vip-diamond-barber': {
    'Haircut': 35, 'Skin Fade': 40, 'Haircut & Beard': 50, 'Beard Trim & Shape': 20,
    'Hot Towel Shave': 35, 'Lineup / Edge-up': 15, 'Kids Cut': 25, 'VIP Package': 65
  }
};
const TENANT_IDS = {
  'vip-diamond-barber': process.env.TENANT_VIP || '' // set to the tenant UUID from Supabase
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const slug = (req.query && req.query.tenant) || 'vip-diamond-barber';
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // honeypot — pretend success, never store
  if (body.companyWebsite) return res.status(200).json({ ok: true });
  if (!body.name || (!body.phone && !body.email)) return res.status(400).json({ error: 'Missing required fields' });

  // normalise services + compute conservative estimated value
  const priceList = PRICES[slug] || {};
  const services = (Array.isArray(body.services) ? body.services : [body.services])
    .filter(Boolean)
    .map((name) => ({ name, price: priceList[name] || 0 }));
  const est_value = services.reduce((a, s) => a + s.price, 0);

  const row = {
    tenant_id: TENANT_IDS[slug],
    name: body.name,
    phone: body.phone || null,
    email: body.email || null,
    services,
    est_value,
    preferred_date: body.eventDate || body.preferred_date || null,
    preferred_time: body.time || body.preferred_time || null,
    notes: body.message || body.notes || null,
    source: body.source || 'website',
    status: 'new'
  };

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bookings`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });
    if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()));

    // optional: fire a notification too (keeps your existing Make.com flow)
    if (process.env.LEAD_WEBHOOK_URL) {
      fetch(process.env.LEAD_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...row, submittedAt: new Date().toISOString() })
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true, est_value });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to save booking' });
  }
};
