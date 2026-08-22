// POST /api/email/send — send a reply over the connected mailbox's SMTP.
// Body: { to, subject, text, connectionId? }  Owner-only (CRM_TOKEN).
const L = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured() || !process.env.CRM_SECRET_KEY) return res.status(503).json({ error: 'Email connector not configured' });

  const b = L.readBody(req);
  const to = String(b.to || '').trim();
  const cc = String(b.cc || '').trim();
  const bcc = String(b.bcc || '').trim();
  const inReplyTo = String(b.inReplyTo || '').trim();
  const subject = String(b.subject || '').trim();
  const text = String(b.text || '');
  if (!to || !text) return res.status(400).json({ error: 'Recipient and message body are required' });

  // pick the connection (specific id, or the first active mailbox)
  const q = b.connectionId
    ? `id=eq.${b.connectionId}&select=*`
    : `tenant_id=eq.${L.TENANT()}&status=eq.active&order=created_at.asc&limit=1&select=*`;
  let conn;
  try { conn = (await L.sbSelect('email_connections', q))[0]; }
  catch (err) { return res.status(502).json({ error: 'Failed to load the mailbox' }); }
  if (!conn) return res.status(400).json({ error: 'No connected mailbox to send from' });

  try {
    await L.sendMail(conn, L.decrypt(conn.secret_enc), { to, cc, bcc, subject, text, inReplyTo });
  } catch (err) {
    return res.status(502).json({ error: 'Send failed — check the SMTP host/port.', detail: String(err.message || err).slice(0, 200) });
  }

  // log the outbound message so it shows in the thread
  try {
    await L.sbInsert('messages', [{
      tenant_id: conn.tenant_id, channel: 'email', direction: 'out', account: conn.email,
      name: to, address: to, to_addrs: to, cc_addrs: cc || null,
      subject, snippet: text.replace(/\s+/g, ' ').slice(0, 240), body: text.slice(0, 20000),
      external_id: 'out-' + Date.now(), unread: false, created_at: new Date().toISOString()
    }]);
  } catch (e) { /* sent already; log is best-effort */ }

  return res.status(200).json({ ok: true });
};
