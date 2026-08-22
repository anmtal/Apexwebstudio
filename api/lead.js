// Vercel serverless function — receives lead-form submissions.
//   1) forwards them to the Make.com webhook (email/WhatsApp alerts), and
//   2) stores them in the Apex CRM (Supabase) so they appear on the owner
//      dashboard with an estimated monthly-pipeline value.
// Both are best-effort and independent: the form still succeeds if either
// side is momentarily down. The honeypot silently drops obvious spam.

// Package + add-on monthly prices — mirror the booking form on the site.
const PACKAGES = {
  'Landing Page (Monthly)': 149,
  'Growth Package (Monthly)': 199,
  'Enterprise Package (Monthly)': 349,
  'E-Commerce Package (Monthly)': 559
};
// Add-ons. recurring:true counts toward MRR/pipeline; the Brand Kit is a
// one-time setup fee — stored on the lead, but excluded from the monthly value.
const ADDON_RULES = [
  { match: /local seo/i,          name: 'Local SEO & Map Pack',        price: 499, recurring: true },
  { match: /automation|booking/i, name: 'Booking & Automation Suite',  price: 499, recurring: true },
  { match: /brand/i,              name: 'Brand Identity & Logo Kit',   price: 249, recurring: false }
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookURL = process.env.LEAD_WEBHOOK_URL
    || 'https://hook.us2.make.com/v6go83c3ratvdbb1tgskxe39nprwpunu';

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Honeypot: real users never fill this hidden field.
  if (body.companyWebsite) return res.status(200).json({ ok: true });
  if (!body.clientName || !body.clientEmail) return res.status(400).json({ error: 'Missing required fields' });

  const { companyWebsite, ...lead } = body;

  // ---- build the CRM booking row (estimated monthly pipeline) ----
  const services = [];
  const pkgPrice = PACKAGES[lead.selectedPackage];
  if (lead.selectedPackage) services.push({ name: lead.selectedPackage.replace(' (Monthly)', ''), price: pkgPrice || 0 });
  const addonStr = lead.selectedAddons || '';
  let oneTime = 0;
  for (const r of ADDON_RULES) if (r.match.test(addonStr)) {
    services.push({ name: r.name, price: r.price });          // stored so it's not lost
    if (r.recurring === false) oneTime += r.price;
  }
  // full estimated value (recurring + one-time) — consistent with the manual
  // add-lead path & the mock; the dashboard re-derives monthly vs one-time
  // from the services list via splitValue, so nothing double-counts.
  const est_value = services.reduce((a, s) => a + s.price, 0);

  // ---- 1) forward to Make.com (notifications) ----
  const forward = fetch(webhookURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...lead, estValue: est_value, submittedAt: new Date().toISOString() })
  }).then((r) => r.ok).catch(() => false);

  // ---- 2) store in the CRM (Supabase) ----
  const store = (async () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE || !process.env.TENANT_APEX) return false;
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bookings`, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          tenant_id: process.env.TENANT_APEX,
          name: lead.clientName,
          email: lead.clientEmail,
          phone: lead.clientPhone || null,
          services, est_value,
          notes: [lead.leadSource, lead.clientMessage].filter(Boolean).join(' — ') || null,
          source: 'website',
          status: 'new'
        })
      });
      return r.ok;
    } catch { return false; }
  })();

  const [forwarded, stored] = await Promise.all([forward, store]);
  if (!forwarded && !stored) return res.status(502).json({ error: 'Failed to deliver lead' });
  return res.status(200).json({ ok: true });
};
