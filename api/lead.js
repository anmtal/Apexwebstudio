// Vercel serverless function — receives lead-form submissions and forwards them
// to the CRM webhook. Keeps the webhook URL server-side (never exposed to the
// browser) and silently drops obvious spam via a honeypot field.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Configure LEAD_WEBHOOK_URL in the Vercel dashboard (Project → Settings →
  // Environment Variables). The literal below is a fallback so the form keeps
  // working before that variable is set.
  const webhookURL = process.env.LEAD_WEBHOOK_URL
    || 'https://hook.us2.make.com/v6go83c3ratvdbb1tgskxe39nprwpunu';

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: real users never fill this hidden field. Pretend success so bots
  // don't learn they were blocked, but never forward the submission.
  if (body.companyWebsite) {
    return res.status(200).json({ ok: true });
  }

  if (!body.clientName || !body.clientEmail) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { companyWebsite, ...lead } = body;

  try {
    const upstream = await fetch(webhookURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, submittedAt: new Date().toISOString() })
    });
    if (!upstream.ok) throw new Error('Webhook responded ' + upstream.status);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to deliver lead' });
  }
};
