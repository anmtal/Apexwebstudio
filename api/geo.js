// Vercel serverless function — returns the visitor's country code from Vercel's
// built-in geolocation header. Used by the site to show USD to US visitors and
// CAD to everyone else (display only). Falls back to empty (= CAD) off-Vercel.
module.exports = (req, res) => {
  const country = req.headers['x-vercel-ip-country'] || '';
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ country });
};
