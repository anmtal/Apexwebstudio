// /api/whatsapp/webhook — Meta WhatsApp Cloud API webhook.
//   GET  : verification handshake (echoes hub.challenge when the token matches)
//   POST : inbound messages → stored in `messages` (channel='whatsapp')
// Public endpoint (Meta calls it). Protected by the verify token (GET) and,
// when WHATSAPP_APP_SECRET is set, the X-Hub-Signature-256 payload signature.
//
// We disable Vercel's automatic body parser (config below) so the RAW request
// bytes are available for the HMAC — re-serialising a parsed object would not
// reproduce Meta's exact payload and the signature would never match. A
// fallback still reads req.body if some runtime parses it anyway, so ingest
// keeps working even if the config is ignored (signature then best-effort).
const crypto = require('crypto');
const L = require('../email/_lib');

// Collect the body as Buffers and concat — NEVER `str += chunk`, which utf8-
// decodes each chunk independently and mangles a multi-byte sequence split
// across a chunk boundary (emoji, accents), corrupting the bytes the HMAC
// signs. Resolves a Buffer (empty if the stream was already consumed).
function streamRaw(req) {
  return new Promise((resolve) => {
    if (req.readableEnded || req.complete) return resolve(Buffer.alloc(0));   // stream already consumed → no wait
    const chunks = []; let done = false;
    const finish = () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } };
    try { req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))); req.on('end', finish); req.on('error', finish); }
    catch { finish(); }
    setTimeout(finish, 2000);   // never hang the function if the stream stalls
  });
}

// Return { raw (Buffer), body, exact } — `exact` true only when raw is the real bytes.
// Read the STREAM FIRST: on @vercel/node, req.body is a lazy getter that drains
// the stream the moment it's accessed, so touching it first would forfeit the
// exact bytes the HMAC needs. Only fall back to req.body if the stream is empty.
async function getPayload(req) {
  const raw = await streamRaw(req);
  if (raw.length) { let body = {}; try { body = JSON.parse(raw.toString('utf8')); } catch {} return { raw, body, exact: true }; }
  const b = req.body;
  if (b != null && typeof b === 'object') return { raw: Buffer.from(JSON.stringify(b), 'utf8'), body: b, exact: false };
  if (typeof b === 'string' && b) { let body = {}; try { body = JSON.parse(b); } catch {} return { raw: Buffer.from(b, 'utf8'), body, exact: true }; }
  return { raw: Buffer.alloc(0), body: {}, exact: false };
}

function signatureOK(raw, header, exact) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;                 // not configured → accept (set it in prod)
  if (!exact) return true;                   // body was pre-parsed; can't reproduce exact bytes → don't block ingest
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');   // raw is a Buffer → exact bytes
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(header))); } catch { return false; }
}

async function handler(req, res) {
  // ---- verification handshake ----
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] && q['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(String(q['hub.challenge'] || ''));
    }
    return res.status(403).end();
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }

  const { raw, body, exact } = await getPayload(req);
  if (!signatureOK(raw, req.headers['x-hub-signature-256'], exact)) return res.status(401).end();
  // ACK Meta immediately; do the work after (Meta retries on non-200 / timeouts)
  res.status(200).json({ ok: true });

  if (!L.sbConfigured()) return;
  try {
    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        const v = change.value || {};
        const messages = v.messages || [];
        if (!messages.length) continue;                         // ignore status/delivery receipts
        const phoneId = (v.metadata && v.metadata.phone_number_id) || '';
        const conns = await L.sbSelect('whatsapp_connections', `phone_number_id=eq.${encodeURIComponent(phoneId)}&select=tenant_id,display_phone`);
        const conn = (conns || [])[0];
        if (!conn) continue;                                    // event for a number we don't own → drop (anti-spoof backstop)
        const nameFor = (from) => { const c = (v.contacts || []).find((x) => x.wa_id === from); return (c && c.profile && c.profile.name) || from; };
        const rows = messages.map((m) => {
          const preview = m.text ? m.text.body : (m.type ? `[${m.type}]` : '[message]');
          return {
            tenant_id: conn.tenant_id, channel: 'whatsapp', direction: 'in',
            account: conn.display_phone || phoneId, name: nameFor(m.from), address: m.from,
            subject: null, snippet: String(preview).replace(/\s+/g, ' ').slice(0, 240), body: String(preview).slice(0, 20000),
            external_id: m.id, folder: 'inbox', unread: true,
            created_at: new Date((Number(m.timestamp) || Date.now() / 1000) * 1000).toISOString()
          };
        });
        if (rows.length) await L.sbInsertIgnore('messages', rows, 'tenant_id,channel,account,external_id').catch(() => {});   // dedupe re-delivered events
      }
    }
  } catch (e) { /* already ACKed; best-effort ingest */ }
}

module.exports = handler;
// Best-effort opt-out of body parsing. Honored by Next.js API routes; on the
// plain @vercel/node runtime it's a harmless no-op — getPayload() reads the
// stream before req.body is ever touched, which is what actually preserves the
// raw bytes for the HMAC there.
module.exports.config = { api: { bodyParser: false } };
