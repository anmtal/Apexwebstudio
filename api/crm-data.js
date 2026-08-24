// Vercel serverless function — the owner dashboard's read endpoint.
// Returns this tenant's bookings + traffic events as JSON, using the
// server-side SERVICE ROLE key (never exposed to the browser). Gated by
// a shared access token so only the owner (who typed it at the dashboard
// login) can pull the data. Same-origin with the site, so no CORS needed.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, TENANT_APEX, CRM_TOKEN
// Upgrade path: swap this shared-token gate for Supabase Auth + RLS when
// you host multiple client dashboards (schema.sql already supports it).

async function sbSelect(table, tenantId, extra = '') {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}?tenant_id=eq.${tenantId}${extra}`;
  const r = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`
    }
  });
  if (!r.ok) throw new Error(table + ' ' + r.status);
  return r.json();
}

module.exports = async (req, res) => {
  // token: Authorization: Bearer <CRM_TOKEN>  (preferred)  or  ?token=
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = auth || (req.query && req.query.token) || '';
  if (!process.env.CRM_TOKEN || token !== process.env.CRM_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE || !process.env.TENANT_APEX) {
    return res.status(503).json({ error: 'CRM datastore not configured' });
  }

  try {
    const tenant = process.env.TENANT_APEX;
    const [bookings, events, reviews, appointments, messages, emailConnections, reviewRequests, whatsappConnections] = await Promise.all([
      sbSelect('bookings', tenant, '&order=created_at.desc&limit=2000'),
      sbSelect('events', tenant, '&order=created_at.desc&limit=20000'),
      sbSelect('reviews', tenant, '&order=created_at.desc&limit=200').catch(() => []),
      sbSelect('appointments', tenant, '&order=starts_at.asc&limit=2000').catch(() => []),
      sbSelect('messages', tenant, '&order=created_at.desc&limit=500').catch(() => []),
      // sanitized: never expose secret_enc / access_token to the browser
      sbSelect('email_connections', tenant, '&select=id,email,provider,status,last_synced,last_error&order=created_at.asc').catch(() => []),
      sbSelect('review_requests', tenant, '&order=created_at.desc&limit=500').catch(() => []),
      sbSelect('whatsapp_connections', tenant, '&select=id,phone_number_id,display_phone,waba_id,status,last_error,created_at&order=created_at.asc').catch(() => [])
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ bookings, events, reviews, appointments, messages, emailConnections, reviewRequests, whatsappConnections });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to load CRM data' });
  }
};
