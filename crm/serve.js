// Tiny zero-dependency static server for previewing the CRM.
// Also MOCKS /api/track and /api/crm-data so 'live' mode can be tested
// locally (access key: "demo-key") before Supabase is wired up.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 4173;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

// ---- mock live dataset (mirrors what Supabase would return) --------
function mockData() {
  const DAY = 86400000, now = Date.now();
  const pkgs = [['Growth Package', 199], ['Landing Page', 149], ['Enterprise Package', 349], ['E-Commerce Package', 559]];
  const addon = ['Local SEO & Map Pack', 499];
  const names = ['Priya Shah', 'Devon Clark', 'Maria Lopez', 'Tom Rees', 'Aisha Khan', 'Ben Carter', 'Sofia Rossi', 'Liam Doyle', 'Nadia Ali', 'Owen Pratt', 'Chloe Ng', 'Raj Mehta'];
  const bookings = names.map((n, i) => {
    const [pkg, price] = pkgs[i % pkgs.length];
    const services = [{ name: pkg, price }];
    if (i % 3 === 0) services.push({ name: addon[0], price: addon[1] });
    return {
      id: 2000 + i, name: n, email: n.toLowerCase().replace(' ', '.') + '@email.com',
      phone: i % 2 === 0 ? '+1 416-555-0' + String(100 + i).slice(-3) : null,
      services, est_value: services.reduce((a, s) => a + s.price, 0),
      preferred_date: null, preferred_time: null,
      notes: ['Main Agency Homepage', 'Toronto Landing Page', 'Mississauga Landing Page'][i % 3] + ' — Interested, please call.',
      source: 'website', status: ['new', 'new', 'confirmed', 'completed', 'completed', 'completed'][i % 6],
      is_client: (['new', 'new', 'confirmed', 'completed', 'completed', 'completed'][i % 6]) === 'completed',
      subscription: (i === 9) ? 'cancelled' : 'active',
      cancelled_at: (i === 9) ? new Date(now - 6 * DAY).toISOString() : null,
      created_at: new Date(now - (i * 1.7 + 0.3) * DAY).toISOString()
    };
  });
  const events = [];
  const refs = ['Google', 'Google', 'Google', 'Direct', 'Instagram', 'LinkedIn'];
  const paths = ['/', '/', '/pricing', '/toronto-web-design', '/mississauga-web-design', '/about'];
  for (let d = 20; d >= 0; d--) {
    const visitors = 30 + Math.round(40 * (20 - d) / 20) + (d % 3) * 6;
    for (let v = 0; v < visitors; v++) {
      const session = `s${d}_${v}`;
      const views = 1 + (v % 3);
      for (let p = 0; p < views; p++) {
        events.push({ type: 'pageview', path: paths[(v + p) % paths.length], referrer: refs[v % refs.length], session, duration: 20 + (v % 5) * 30, created_at: new Date(now - d * DAY - v * 6e4).toISOString() });
      }
    }
  }
  for (let d = 20; d >= 0; d--) {
    const n = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) events.push({ type: 'form_start', session: 'fs' + d + '_' + i, created_at: new Date(now - d * DAY).toISOString() });
  }
  return { bookings, events, reviews: [] };
}

function readBody(req, cb) { let b = ''; req.on('data', (c) => b += c); req.on('end', () => cb(b)); }

http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // --- mock API ---
  if (url === '/api/track' || url === '/api/booking-status') {
    return readBody(req, () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); });
  }
  if (url === '/api/lead-create') {
    return readBody(req, (raw) => {
      let b = {}; try { b = JSON.parse(raw); } catch {}
      const created = Object.assign({ id: 9000 + Math.floor(Math.random() * 1000) }, b);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(created));
    });
  }
  if (url === '/api/crm-data') {
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (auth !== 'demo-key') { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"Unauthorized"}'); }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(mockData()));
  }

  // --- static files ---
  let urlPath = decodeURIComponent(url);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`APEX CRM → http://localhost:${PORT}`));
