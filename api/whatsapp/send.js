// POST /api/whatsapp/send — send a WhatsApp text reply via the Cloud API.
// Body: { to, text, connectionId? }  Owner-only.
// Note: free-form text only works inside the 24-hour customer service window
// (i.e. replying to someone who messaged you). Outside it, Meta requires an
// approved template — not handled here.
const L = require('../email/_lib');
const GRAPH = 'https://graph.facebook.com/v20.0';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured() || !process.env.CRM_SECRET_KEY) return res.status(503).json({ error: 'WhatsApp connector not configured' });

  const b = L.readBody(req);
  const to = String(b.to || '').replace(/[^\d]/g, '');   // digits only, E.164 without +
  const text = String(b.text || '');
  if (!to || !text) return res.status(400).json({ error: 'Recipient and message are required' });

  const cid = String(b.connectionId || '').replace(/[^0-9]/g, '');
  const q = cid
    ? `id=eq.${cid}&tenant_id=eq.${L.TENANT()}&select=*`
    : `tenant_id=eq.${L.TENANT()}&status=eq.active&order=created_at.asc&limit=1&select=*`;
  let conn;
  try { conn = (await L.sbSelect('whatsapp_connections', q))[0]; }
  catch (err) { return res.status(502).json({ error: 'Failed to load the WhatsApp number' }); }
  if (!conn) return res.status(400).json({ error: 'No connected WhatsApp number to send from' });

  let wamid = 'wa-out-' + Date.now();
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(conn.phone_number_id)}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + L.decrypt(conn.access_token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text.slice(0, 4096) } })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'WhatsApp send failed.', detail: (j.error && j.error.message || '').slice(0, 200) });
    wamid = (j.messages && j.messages[0] && j.messages[0].id) || wamid;
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach WhatsApp.', detail: String(err.message || err).slice(0, 200) });
  }

  try {
    await L.sbInsert('messages', [{
      tenant_id: conn.tenant_id, channel: 'whatsapp', direction: 'out', account: conn.display_phone || conn.phone_number_id,
      name: to, address: to, subject: null, snippet: text.replace(/\s+/g, ' ').slice(0, 240), body: text.slice(0, 20000),
      external_id: wamid, folder: 'sent', unread: false, created_at: new Date().toISOString()
    }]);
  } catch (e) { /* sent already; log is best-effort */ }

  return res.status(200).json({ ok: true });
};
