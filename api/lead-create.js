// Vercel serverless function — manually add a lead or client from the
// dashboard (cold call, walk-in, off-portal client). Owner-only (CRM_TOKEN).
// POST { name, email?, phone?, services?, est_value?, notes?, source?, is_client? }
// The dashboard sends services as [{name, price}] and the computed est_value.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!process.env.CRM_TOKEN || token !== process.env.CRM_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE || !process.env.TENANT_APEX) return res.status(503).json({ error: 'CRM datastore not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (!body.name || !String(body.name).trim()) return res.status(400).json({ error: 'Name is required' });

  const services = Array.isArray(body.services) ? body.services.filter((s) => s && s.name) : [];
  const est_value = Number(body.est_value) || services.reduce((a, s) => a + (Number(s.price) || 0), 0);

  const row = {
    tenant_id: process.env.TENANT_APEX,
    name: String(body.name).trim(),
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    services, est_value,
    notes: body.notes ? String(body.notes).trim() : null,
    source: body.source || 'manual',
    status: 'new',
    is_client: !!body.is_client
  };

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bookings`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify(row)
    });
    if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()));
    const created = (await r.json())[0] || row;
    return res.status(200).json(created);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to create record' });
  }
};
