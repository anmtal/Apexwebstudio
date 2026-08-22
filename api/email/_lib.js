// Shared helpers for the email connector (IMAP/SMTP universal adapter).
// Underscore-prefixed → Vercel does NOT expose this as a route.
//
// Secrets: the client's app password is AES-256-GCM encrypted with a key
// derived from CRM_SECRET_KEY and stored in email_connections.secret_enc.
// It is decrypted only here, server-side, never returned to the browser.
const crypto = require('crypto');

// ---- encryption -------------------------------------------------------
function key() {
  const s = process.env.CRM_SECRET_KEY;
  if (!s) throw new Error('CRM_SECRET_KEY not set');
  return crypto.createHash('sha256').update(String(s)).digest(); // 32 bytes
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(b64) {
  const raw = Buffer.from(String(b64), 'base64');
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), data = raw.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// ---- provider auto-detect (host/port from the email domain) -----------
const PROVIDERS = {
  'gmail.com':      { imap: ['imap.gmail.com', 993],          smtp: ['smtp.gmail.com', 465] },
  'googlemail.com': { imap: ['imap.gmail.com', 993],          smtp: ['smtp.gmail.com', 465] },
  'outlook.com':    { imap: ['outlook.office365.com', 993],   smtp: ['smtp.office365.com', 587] },
  'hotmail.com':    { imap: ['outlook.office365.com', 993],   smtp: ['smtp.office365.com', 587] },
  'live.com':       { imap: ['outlook.office365.com', 993],   smtp: ['smtp.office365.com', 587] },
  'office365.com':  { imap: ['outlook.office365.com', 993],   smtp: ['smtp.office365.com', 587] },
  'yahoo.com':      { imap: ['imap.mail.yahoo.com', 993],     smtp: ['smtp.mail.yahoo.com', 465] },
  'icloud.com':     { imap: ['imap.mail.me.com', 993],        smtp: ['smtp.mail.me.com', 587] },
  'me.com':         { imap: ['imap.mail.me.com', 993],        smtp: ['smtp.mail.me.com', 587] },
  'zoho.com':       { imap: ['imap.zoho.com', 993],           smtp: ['smtp.zoho.com', 465] },
  'fastmail.com':   { imap: ['imap.fastmail.com', 993],       smtp: ['smtp.fastmail.com', 465] }
};
// map a domain's MX host to the right mail servers when it's not a known domain
const HOSTS = {
  ionos:    { imap: ['imap.ionos.com', 993],         smtp: ['smtp.ionos.com', 465] },
  godaddy:  { imap: ['imap.secureserver.net', 993],  smtp: ['smtpout.secureserver.net', 465] },
  gmail:    PROVIDERS['gmail.com'],
  outlook:  PROVIDERS['outlook.com'],
  zoho:     PROVIDERS['zoho.com'],
  fastmail: PROVIDERS['fastmail.com'],
  icloud:   PROVIDERS['icloud.com'],
  namecheap:{ imap: ['mail.privateemail.com', 993],  smtp: ['mail.privateemail.com', 465] }
};
const MX_MAP = [
  [/ionos|1und1|1and1|kundenserver/, 'ionos'],
  [/secureserver\.net/, 'godaddy'],
  [/aspmx|google|googlemail/, 'gmail'],
  [/outlook\.com|office365|protection\.outlook|hotmail/, 'outlook'],
  [/zoho/, 'zoho'],
  [/messagingengine|fastmail/, 'fastmail'],
  [/icloud|apple/, 'icloud'],
  [/privateemail|namecheap/, 'namecheap']
];
async function mxProvider(domain) {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, { headers: { accept: 'application/dns-json' } });
    const j = await r.json();
    const mx = (j.Answer || []).map((a) => a.data || '').join(' ').toLowerCase();
    for (const [re, key] of MX_MAP) if (re.test(mx)) return key;
  } catch { /* fall through to mail.<domain> */ }
  return null;
}
async function detect(email, override) {
  const domain = String(email || '').split('@')[1] || '';
  let base = PROVIDERS[domain.toLowerCase()];
  const hasOverride = override && (override.imap_host || override.smtp_host);
  if (!base && !hasOverride) { const key = await mxProvider(domain); if (key && HOSTS[key]) base = HOSTS[key]; }
  const imap = (override && override.imap_host) ? [override.imap_host, Number(override.imap_port) || 993]
    : base ? base.imap : ['mail.' + domain, 993];               // cPanel/custom hosts commonly use mail.<domain>
  const smtp = (override && override.smtp_host) ? [override.smtp_host, Number(override.smtp_port) || 465]
    : base ? base.smtp : ['mail.' + domain, 465];
  return { imap_host: imap[0], imap_port: imap[1], smtp_host: smtp[0], smtp_port: smtp[1] };
}

// ---- supabase REST (service role — bypasses RLS) ----------------------
const SB = () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE });
function sbConfigured() { const s = SB(); return !!(s.url && s.key && process.env.TENANT_APEX); }
async function sbFetch(pathAndQuery, init = {}) {
  const s = SB();
  const r = await fetch(`${s.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  if (!r.ok) throw new Error('supabase ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}
const sbSelect = (table, q = '') => sbFetch(`${table}?${q}`);
const sbInsert = (table, rows) => sbFetch(table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(rows) });
// upsert that skips rows already present (ON CONFLICT DO NOTHING) — one dup
// never aborts the whole batch. Requires a unique index on `conflict` cols.
const sbInsertIgnore = (table, rows, conflict) => sbFetch(`${table}?on_conflict=${conflict}`, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows) });
const sbUpdate = (table, q, patch) => sbFetch(`${table}?${q}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });

// ---- IMAP (imapflow) --------------------------------------------------
function imapClient(conn, secret) {
  const { ImapFlow } = require('imapflow');
  const port = Number(conn.imap_port) || 993;
  return new ImapFlow({ host: conn.imap_host, port, secure: port === 993, auth: { user: conn.email, pass: secret }, logger: false });
}
// verify credentials by logging in (throws on failure)
async function verifyImap(conn, secret) {
  const client = imapClient(conn, secret);
  await client.connect();
  await client.logout().catch(() => {});
}
// pull recent inbox messages → normalized rows
async function fetchInbox(conn, secret, sinceDate, limit = 200) {
  const { simpleParser } = require('mailparser');
  const client = imapClient(conn, secret);
  const out = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // IMAP SINCE is date-granular; overlap the window by a day and let the
      // dedupe drop anything already stored, so the boundary is never missed.
      const base = sinceDate ? new Date(sinceDate) : new Date(Date.now() - 14 * 864e5);
      const since = new Date(base.getTime() - 864e5);
      let uids = await client.search({ since }, { uid: true });
      uids = (uids || []).slice(0, limit);   // OLDEST-first — overflow is the newest mail, caught next run; never strand the earliest unseen
      for (const uid of uids) {
        const msg = await client.fetchOne(uid, { envelope: true, source: true }, { uid: true });
        if (!msg) continue;
        let text = '';
        try { const p = await simpleParser(msg.source); text = (p.text || p.html || '').replace(/<[^>]+>/g, ' ').trim(); } catch {}
        const env = msg.envelope || {};
        const from = (env.from && env.from[0]) || {};
        const addrs = (list) => (list || []).map((a) => a.address).filter(Boolean).join(', ');
        out.push({
          external_id: env.messageId || ('uid-' + conn.id + '-' + uid),   // namespace by mailbox: UIDs aren't unique across mailboxes
          name: from.name || String(from.address || '').split('@')[0] || 'Unknown',
          address: from.address || '',
          to_addrs: addrs(env.to),
          cc_addrs: addrs(env.cc),
          subject: env.subject || '(no subject)',
          snippet: (text || env.subject || '').replace(/\s+/g, ' ').slice(0, 240),
          body: text.slice(0, 20000),
          created_at: (env.date ? new Date(env.date) : new Date()).toISOString()
        });
      }
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
  return out;
}

// ---- SMTP (nodemailer) ------------------------------------------------
async function sendMail(conn, secret, { to, cc, bcc, subject, text, inReplyTo }) {
  const nodemailer = require('nodemailer');
  const port = Number(conn.smtp_port) || 465;
  const secure = port === 465;
  // requireTLS on non-465 ports forces STARTTLS — never send the app password over cleartext
  const t = nodemailer.createTransport({ host: conn.smtp_host, port, secure, requireTLS: !secure, auth: { user: conn.email, pass: secret } });
  return t.sendMail({ from: conn.email, to, cc: cc || undefined, bcc: bcc || undefined, subject, text, inReplyTo: inReplyTo || undefined, references: inReplyTo || undefined });
}

// pull new mail for one connection and upsert into messages (deduped)
async function syncConnection(conn) {
  const secret = decrypt(conn.secret_enc);
  try {
    const msgs = await fetchInbox(conn, secret, conn.last_synced, 25);
    let inserted = 0;
    if (msgs.length) {
      const existing = await sbSelect('messages', `tenant_id=eq.${conn.tenant_id}&channel=eq.email&order=created_at.desc&limit=500&select=external_id`);
      const seen = new Set((existing || []).map((r) => r.external_id));
      const fresh = msgs.filter((m) => !seen.has(m.external_id)).map((m) => ({
        tenant_id: conn.tenant_id, channel: 'email', direction: 'in', account: conn.email,
        name: m.name, address: m.address, to_addrs: m.to_addrs, cc_addrs: m.cc_addrs,
        subject: m.subject, snippet: m.snippet, body: m.body,
        external_id: m.external_id, unread: true, created_at: m.created_at
      }));
      if (fresh.length) { const ins = await sbInsertIgnore('messages', fresh, 'tenant_id,channel,external_id'); inserted = Array.isArray(ins) ? ins.length : fresh.length; }
    }
    await sbUpdate('email_connections', `id=eq.${conn.id}`, { status: 'active', last_synced: new Date().toISOString(), last_error: null });
    return { inserted };
  } catch (err) {
    await sbUpdate('email_connections', `id=eq.${conn.id}`, { status: 'error', last_error: String(err.message || err).slice(0, 300) }).catch(() => {});
    throw err;
  }
}

// small helpers shared by the route handlers
function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}
function ownerOK(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return process.env.CRM_TOKEN && token === process.env.CRM_TOKEN;
}

module.exports = { encrypt, decrypt, detect, sbConfigured, sbSelect, sbInsert, sbUpdate, verifyImap, fetchInbox, sendMail, syncConnection, readBody, ownerOK, TENANT: () => process.env.TENANT_APEX };
