// Shared bits for the review-request drip. Reuses the email connector's
// SMTP send + Supabase helpers. Underscore-prefixed → not a Vercel route.
const L = require('../email/_lib');

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

// the 3-email sequence (step 0/1/2), personalized with first name + link
function template(step, name, link, business) {
  const b = (business || '').trim() || 'us';
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const T = [
    {
      subject: `A quick favour, ${first}?`,
      body: `Hi ${first},\n\nThank you so much for choosing ${b} — it was a real pleasure working with you.\n\nIf you have 30 seconds, would you mind leaving a quick review? It genuinely helps us reach more people like you:\n\n${link}\n\nThank you!\n${b}`
    },
    {
      subject: `Following up — a quick review?`,
      body: `Hi ${first},\n\nJust a gentle nudge in case my last note slipped by. If you had a good experience with ${b}, a short review would mean a lot:\n\n${link}\n\nNo worries at all if you're busy — thank you either way!\n${b}`
    },
    {
      subject: `Last note — we'd love your feedback`,
      body: `Hi ${first},\n\nI promise this is the last reminder! If you can spare a moment, we'd be truly grateful for a quick review:\n\n${link}\n\nThanks for being a wonderful client.\n${b}`
    }
  ];
  return T[Math.max(0, Math.min(2, step))];
}

// send the next email for one request using its from-mailbox connection
async function sendStep(conn, req, step) {
  const t = template(step, req.client_name, req.review_link, req.business_name);
  await L.sendMail(conn, L.decrypt(conn.secret_enc), { to: req.client_email, subject: t.subject, text: t.body });
}

// load the connected mailbox to send from (by email/account), tenant-scoped
async function loadSender(fromAccount) {
  const q = fromAccount
    ? `tenant_id=eq.${L.TENANT()}&email=eq.${encodeURIComponent(fromAccount)}&status=eq.active&select=*`
    : `tenant_id=eq.${L.TENANT()}&status=eq.active&order=created_at.asc&limit=1&select=*`;
  const rows = await L.sbSelect('email_connections', q);
  return (rows || [])[0];
}

module.exports = { L, THREE_DAYS, template, sendStep, loadSender };
