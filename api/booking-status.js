// Vercel serverless function — dashboard write-back for a booking.
// POST { id, status?, is_client? } with Authorization: Bearer <CRM_TOKEN>
// → updates the given fields in Supabase (tenant-scoped, service role).
// Same access key as the dashboard read, so only the owner can change it.
const ALLOWED = ['new', 'meeting', 'pending', 'confirmed', 'completed', 'cancelled', 'noshow'];

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
  const id = parseInt(body.id, 10);
  if (!id) return res.status(400).json({ error: 'Bad input' });

  const patch = {};
  if (body.status !== undefined) {
    if (!ALLOWED.includes(String(body.status))) return res.status(400).json({ error: 'Bad status' });
    patch.status = body.status;
  }
  if (body.is_client !== undefined) patch.is_client = !!body.is_client;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bookings?id=eq.${id}&tenant_id=eq.${process.env.TENANT_APEX}`, {
      method: 'PATCH',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify(patch)
    });
    if (!r.ok) throw new Error('Supabase ' + r.status);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: 'Update failed' });
  }
};
