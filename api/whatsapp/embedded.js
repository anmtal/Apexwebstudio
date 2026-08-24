// /api/whatsapp/embedded — Meta Embedded Signup onboarding (the all-clients path).
//   GET  : returns the PUBLIC front-end config (appId, configId, graph version)
//          so the dashboard can launch the Meta popup. Owner-gated.
//   POST : { code, waba_id, phone_number_id } from the finished popup →
//          exchange the code for a token, subscribe our app to the client's
//          WABA, register the number for Cloud API, store the connection.
// One Apex Meta app serves every client; each client authorizes their own
// WhatsApp Business Account in the popup, so there is no token to paste.
const L = require('../email/_lib');
const GRAPH = 'https://graph.facebook.com/v20.0';
const canonPhone = (s) => { const d = String(s || '').replace(/[^\d]/g, ''); return d ? '+' + d : ''; };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });

  const appId = process.env.WHATSAPP_APP_ID || '';
  const configId = process.env.WHATSAPP_CONFIG_ID || '';
  const appSecret = process.env.WHATSAPP_APP_SECRET || '';

  // ---- public front-end config ----
  if (req.method === 'GET') {
    return res.status(200).json({ enabled: !!(appId && configId), appId, configId, graphVersion: 'v20.0' });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  if (!L.sbConfigured() || !process.env.CRM_SECRET_KEY) return res.status(503).json({ error: 'WhatsApp connector not configured' });
  if (!appId || !appSecret) return res.status(503).json({ error: 'Embedded Signup is not configured (missing WHATSAPP_APP_ID / WHATSAPP_APP_SECRET).' });

  const b = L.readBody(req);
  const code = String(b.code || '').trim();
  const phoneId = String(b.phone_number_id || '').trim();
  const wabaId = String(b.waba_id || '').trim();
  if (!code || !phoneId) return res.status(400).json({ error: 'Signup did not complete — please try connecting again.' });

  // 1) exchange the popup's authorization code for a long-lived token
  let token = '';
  try {
    const r = await fetch(`${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`);
    const j = await r.json();
    if (!r.ok || !j.access_token) return res.status(400).json({ error: 'Could not complete the WhatsApp connection.', detail: (j.error && j.error.message || '').slice(0, 200) });
    token = j.access_token;
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach WhatsApp to finish signup — try again.' });
  }

  // 2) subscribe our app to the client's WABA so inbound messages hit our webhook (best-effort)
  let lastError = null;
  if (wabaId) {
    try {
      const r = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { const j = await r.json().catch(() => ({})); lastError = 'subscribe: ' + ((j.error && j.error.message) || r.status); }
    } catch (err) { lastError = 'subscribe failed'; }
  }

  // 3) register the number for Cloud API sending (best-effort; may already be done by signup)
  try {
    const pin = String(Math.floor(100000 + (Number(String(phoneId).slice(-6)) % 900000))); // deterministic 6-digit, no RNG
    const r = await fetch(`${GRAPH}/${encodeURIComponent(phoneId)}/register`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin })
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); const msg = (j.error && j.error.message) || ''; if (!/already/i.test(msg)) lastError = (lastError ? lastError + '; ' : '') + 'register: ' + (msg || r.status); }
  } catch (err) { /* non-fatal: receiving still works; sending may need manual registration */ }

  // 4) read the display number
  let display = '';
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(phoneId)}?fields=display_phone_number`, { headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json(); if (r.ok) display = j.display_phone_number || '';
  } catch (err) { /* label optional */ }
  display = canonPhone(display) || phoneId;

  // 5) store (encrypted token), upsert by phone_number_id
  try {
    const patch = { tenant_id: L.TENANT(), phone_number_id: phoneId, display_phone: display, waba_id: wabaId || null, access_token: L.encrypt(token), status: 'active', last_error: lastError };
    const existing = await L.sbSelect('whatsapp_connections', `tenant_id=eq.${L.TENANT()}&phone_number_id=eq.${encodeURIComponent(phoneId)}&select=id`);
    let row;
    if (existing && existing.length) row = (await L.sbUpdate('whatsapp_connections', `id=eq.${existing[0].id}`, patch))[0];
    else row = (await L.sbInsert('whatsapp_connections', [patch]))[0];
    const { access_token, ...safe } = row;
    return res.status(200).json({ connection: safe, warning: lastError || undefined });
  } catch (err) {
    return res.status(502).json({ error: 'Connected, but failed to save — please retry.' });
  }
};
