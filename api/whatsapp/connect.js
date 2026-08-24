// POST /api/whatsapp/connect — link a WhatsApp Business number.
// Body: { phone_number_id, access_token, display_phone?, waba_id? }
// Verifies the token against the Graph API, encrypts it, stores the row.
// Owner-only. DELETE ?id= disconnects (also drops its messages).
const L = require('../email/_lib');
const GRAPH = 'https://graph.facebook.com/v20.0';

// Canonical phone label: "+" + digits. Deterministic regardless of how Graph
// formats display_phone_number or how the owner types it, so the `account` key
// (which groups messages and drives disconnect cleanup) never drifts between
// reconnects and strands old messages under a stale label.
const canonPhone = (s) => { const d = String(s || '').replace(/[^\d]/g, ''); return d ? '+' + d : ''; };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured()) return res.status(503).json({ error: 'CRM datastore not configured' });

  if (req.method === 'DELETE') {
    const id = String((req.query && req.query.id) || '').replace(/[^0-9]/g, '');
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const rows = await L.sbSelect('whatsapp_connections', `id=eq.${id}&tenant_id=eq.${L.TENANT()}&select=display_phone,phone_number_id`);
      const c = (rows || [])[0];
      await L.sbDelete('whatsapp_connections', `id=eq.${id}&tenant_id=eq.${L.TENANT()}`);
      // purge this number's messages under BOTH possible account labels (the
      // canonical display and the raw phone_number_id) so nothing is stranded
      if (c) for (const lbl of [c.display_phone, c.phone_number_id].filter(Boolean)) {
        await L.sbDelete('messages', `tenant_id=eq.${L.TENANT()}&channel=eq.whatsapp&account=eq.${encodeURIComponent(lbl)}`);
      }
      return res.status(200).json({ ok: true });
    } catch (err) { return res.status(502).json({ error: 'Failed to disconnect' }); }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, DELETE'); return res.status(405).end(); }
  if (!process.env.CRM_SECRET_KEY) return res.status(503).json({ error: 'CRM_SECRET_KEY not set' });

  const b = L.readBody(req);
  const phoneId = String(b.phone_number_id || '').trim();
  const token = String(b.access_token || '').trim();
  if (!phoneId || !token) return res.status(400).json({ error: 'Phone number ID and access token are required' });

  // verify the token + phone id against the Graph API, and read the number
  let display = String(b.display_phone || '').trim();
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name`, { headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json();
    if (!r.ok) return res.status(400).json({ error: 'WhatsApp rejected those credentials.', detail: (j.error && j.error.message || '').slice(0, 200) });
    if (!display) display = j.display_phone_number || '';
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach WhatsApp to verify — try again.' });
  }
  display = canonPhone(display) || phoneId;   // stable label; last-resort to the id if no number is available

  try {
    const patch = { tenant_id: L.TENANT(), phone_number_id: phoneId, display_phone: display, waba_id: String(b.waba_id || '').trim() || null, access_token: L.encrypt(token), status: 'active', last_error: null };
    const existing = await L.sbSelect('whatsapp_connections', `tenant_id=eq.${L.TENANT()}&phone_number_id=eq.${encodeURIComponent(phoneId)}&select=id`);
    let row;
    if (existing && existing.length) row = (await L.sbUpdate('whatsapp_connections', `id=eq.${existing[0].id}`, patch))[0];
    else row = (await L.sbInsert('whatsapp_connections', [patch]))[0];
    const { access_token, ...safe } = row;
    return res.status(200).json({ connection: safe });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to save the connection' });
  }
};
