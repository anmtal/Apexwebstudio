// POST /api/reviews/enroll — start a review-request drip for recipients.
// Body: { recipients:[{name,email}], review_link, from_account, business_name }
// Sends email 1 now, schedules 2 & 3 for the cron (~3 days apart). Owner-only.
const { L, THREE_DAYS, sendStep, loadSender } = require('./_shared');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!L.ownerOK(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!L.sbConfigured() || !process.env.CRM_SECRET_KEY) return res.status(503).json({ error: 'Email connector not configured' });

  const b = L.readBody(req);
  const link = String(b.review_link || '').trim();
  if (!/^https?:\/\//i.test(link)) return res.status(400).json({ error: 'A valid review link (https://…) is required' });
  const recipients = (Array.isArray(b.recipients) ? b.recipients : [])
    .map((r) => ({ name: String(r.name || '').trim(), email: String(r.email || '').trim() }))
    .filter((r) => /.+@.+\..+/.test(r.email));
  if (!recipients.length) return res.status(400).json({ error: 'At least one recipient with a valid email is required' });

  const conn = await loadSender(b.from_account);
  if (!conn) return res.status(400).json({ error: 'No connected mailbox to send from — connect one in Messages first' });

  const now = Date.now();
  let enrolled = 0, sent = 0;
  for (const r of recipients) {
    // Record step 0 as already sent (sent_count=1, next in 3d) BEFORE emailing,
    // so a failed post-send write can never make the cron re-send the first
    // email. A send failure is recorded in last_error (at-most-once outreach).
    const row = {
      tenant_id: L.TENANT(), client_name: r.name || null, client_email: r.email,
      review_link: link, from_account: conn.email, business_name: String(b.business_name || '').trim() || null,
      status: 'active', sent_count: 1, last_sent_at: new Date(now).toISOString(), next_send_at: new Date(now + THREE_DAYS).toISOString()
    };
    let saved;
    try { saved = (await L.sbInsert('review_requests', [row]))[0]; } catch (e) { continue; }
    enrolled++;
    try { await sendStep(conn, saved, 0); sent++; }
    catch (err) { await L.sbUpdate('review_requests', `id=eq.${saved.id}&tenant_id=eq.${L.TENANT()}`, { last_error: String(err.message || err).slice(0, 200) }).catch(() => {}); }
  }
  if (!enrolled) return res.status(502).json({ error: 'Could not save the campaign — check the database/schema.' });
  return res.status(200).json({ enrolled, sent });
};
