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
    if (i % 4 === 0) services.push({ name: 'Brand Identity & Logo Kit', price: 249 });  // one-time setup
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

  // appointments — scheduled client bookings (some "synced" from an
  // external calendar, some manual) so the Calendar tab has real data
  const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const appointments = [];
  const A = (off, time, client, title, source, status, phone, meeting) => appointments.push({
    id: 7000 + appointments.length, client, title, date: ymd(new Date(base.getTime() + off * DAY)),
    time, duration: 60, status, source, phone: phone || null, email: null, meeting_url: meeting || null, notes: '',
    created_at: new Date(base.getTime() - 2 * DAY).toISOString()
  });
  // all mock rows are "synced" (read-only); 'manual' is reserved for bookings added in the dashboard
  A(-3, '10:00', 'Priya Shah', 'Discovery call — Growth Package', 'google', 'completed', '+1 416-555-0113');
  A(-1, '14:00', 'Devon Clark', 'Design review', 'outlook', 'completed');
  A(0, '11:30', 'Maria Lopez', 'Onboarding call', 'google', 'scheduled', '+1 416-555-0121', 'https://meet.google.com/abc-defg-hij');
  A(0, '16:00', 'Tom Rees', 'Kickoff — E-Commerce', 'apple', 'scheduled');
  A(2, '09:30', 'Aisha Khan', 'Content handover', 'google', 'scheduled');
  A(3, '13:00', 'Ben Carter', 'Monthly check-in', 'outlook', 'scheduled', '+1 416-555-0148', 'https://zoom.us/j/9876543210');
  A(6, '15:30', 'Sofia Rossi', 'Strategy session', 'ical', 'scheduled');

  return { bookings, events, reviews: [], appointments, messages: MOCK_MSGS, emailConnections: MOCK_CONNS };
}

// mock email state (persists across requests so the connect→import→reply loop is real locally)
let MOCK_MSGS = [];
let MOCK_CONNS = [];
function sampleInbound(n, account) {
  const src = [
    ['Sarah Chen', 'sarah.chen@gmail.com', 'Website enquiry — new site', 'Hi,\n\nI saw your work and would love a quote for a 5-page site for my clinic. We need online booking, a gallery, and a contact form.\n\nCould you send pricing and a rough timeline?\n\nThanks,\nSarah', 'contact@apexwebstudio.ca', 'partner@sarahclinic.com'],
    ['Marcus Bell', 'marcus@bellandco.com', 'Re: Proposal', 'Thanks for sending this over — can we hop on a call Thursday afternoon to walk through it?\n\nMarcus', 'contact@apexwebstudio.ca', ''],
    ['Priya Nair', 'priya.n@outlook.com', 'Monthly maintenance?', 'Do you offer ongoing maintenance, and what does it include per month?', 'contact@apexwebstudio.ca', '']
  ];
  const now = Date.now();
  return src.slice(0, n).map((s, i) => ({ id: 'msg' + (now + i), channel: 'email', direction: 'in', account: account || 'you@business.com', name: s[0], address: s[1], subject: s[2], snippet: s[3].replace(/\s+/g, ' ').slice(0, 240), body: s[3], to_addrs: s[4], cc_addrs: s[5], unread: true, created_at: new Date(now - i * 3600000).toISOString() }));
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
  // --- mock email connector (IMAP/SMTP) ---
  if (url === '/api/email/connect') {
    return readBody(req, (raw) => {
      if (req.method === 'DELETE') {
        const m = (req.url.split('?')[1] || '').match(/id=([^&]+)/);
        const cid = m ? decodeURIComponent(m[1]) : '';
        MOCK_CONNS = MOCK_CONNS.filter((c) => String(c.id) !== cid);
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
      }
      let b = {}; try { b = JSON.parse(raw); } catch {}
      const conn = { id: 'ec' + Date.now(), email: b.email || 'you@business.com', provider: 'imap', status: 'active', last_synced: new Date().toISOString() };
      MOCK_CONNS.push(conn);
      const imported = sampleInbound(3, conn.email); MOCK_MSGS = imported.concat(MOCK_MSGS);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ connection: conn, imported: imported.length }));
    });
  }
  if (url === '/api/email/sync') {
    return readBody(req, () => {
      const n = MOCK_CONNS.length ? 1 : 0;
      if (n) MOCK_MSGS = [{ id: 'msg' + Date.now(), channel: 'email', direction: 'in', account: (MOCK_CONNS[0] || {}).email, name: 'New Lead', address: 'lead' + Math.floor(Math.random() * 999) + '@email.com', subject: 'New enquiry from your site', snippet: 'Just found your site — are you taking on new clients this month?', body: 'Just found your site — are you taking on new clients this month?', unread: true, created_at: new Date().toISOString() }].concat(MOCK_MSGS);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ synced: MOCK_CONNS.length, results: [{ imported: n }] }));
    });
  }
  if (url === '/api/email/send') {
    return readBody(req, (raw) => {
      let b = {}; try { b = JSON.parse(raw); } catch {}
      MOCK_MSGS = [{ id: 'out' + Date.now(), channel: 'email', direction: 'out', account: (MOCK_CONNS[0] || {}).email, name: b.to || '', address: b.to || '', to_addrs: b.to || '', cc_addrs: b.cc || '', subject: b.subject || '', snippet: (b.text || '').replace(/\s+/g, ' ').slice(0, 240), body: b.text || '', unread: false, created_at: new Date().toISOString() }].concat(MOCK_MSGS);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
    });
  }
  if (url === '/api/email/read') {
    return readBody(req, (raw) => {
      let b = {}; try { b = JSON.parse(raw); } catch {}
      const m = MOCK_MSGS.find((x) => String(x.id) === String(b.id)); if (m) m.unread = false;
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
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
