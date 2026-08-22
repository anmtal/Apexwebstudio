// POST /api/email/connect  — link a mailbox over IMAP/SMTP.
// Body: { email, password, imap_host?, imap_port?, smtp_host?, smtp_port? }
// Owner-only (CRM_TOKEN). Verifies the login, encrypts the app password,
// stores the connection, and pulls the first batch of mail.
const L = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured()) return res.status(503).json({ error: 'CRM datastore not configured' });

  // disconnect a mailbox
  if (req.method === 'DELETE') {
    const id = (req.query && req.query.id) || '';
    if (!id) return res.status(400).json({ error: 'id required' });
    try { await L.sbUpdate('email_connections', `id=eq.${id}&tenant_id=eq.${L.TENANT()}`, { status: 'disabled' }); return res.status(200).json({ ok: true }); }
    catch (err) { return res.status(502).json({ error: 'Failed to disconnect' }); }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, DELETE'); return res.status(405).end(); }
  if (!process.env.CRM_SECRET_KEY) return res.status(503).json({ error: 'CRM_SECRET_KEY not set' });

  const b = L.readBody(req);
  const email = String(b.email || '').trim();
  const password = String(b.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and app password are required' });

  const hosts = L.detect(email, b);
  const conn = { tenant_id: L.TENANT(), email, provider: 'imap', ...hosts };

  // 1) verify the credentials before storing anything
  try {
    await L.verifyImap(conn, password);
  } catch (err) {
    return res.status(400).json({ error: 'Could not sign in to that mailbox. Check the app password and IMAP host/port.', detail: String(err.message || err).slice(0, 200) });
  }

  // 2) upsert the connection (one per email per tenant)
  let row;
  try {
    const secret_enc = L.encrypt(password);
    const existing = await L.sbSelect('email_connections', `tenant_id=eq.${conn.tenant_id}&email=eq.${encodeURIComponent(email)}&select=id`);
    const patch = { ...conn, secret_enc, status: 'active', last_error: null };
    if (existing && existing.length) {
      row = (await L.sbUpdate('email_connections', `id=eq.${existing[0].id}`, patch))[0];
    } else {
      row = (await L.sbInsert('email_connections', patch))[0];
    }
  } catch (err) {
    return res.status(502).json({ error: 'Failed to save the connection' });
  }

  // 3) pull the first batch of mail (best-effort — connection is saved regardless)
  let inserted = 0;
  try { inserted = (await L.syncConnection(row)).inserted; } catch (e) { /* status set to error inside */ }

  // never return the secret
  const { secret_enc, ...safe } = row;
  return res.status(200).json({ connection: safe, imported: inserted });
};
