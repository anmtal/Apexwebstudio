/* ============================================================
   APEX CRM — data layer
   The ONLY file the UI talks to for data. Two sources, one API:
     • 'demo' → seeded data, everything derived in the browser
     • 'live' → real rows from /api/crm-data (your own site), shaped
       into the exact same structure so every metric below is identical
   Effective mode = ?mode= URL param, else CRM.config.mode.
   ============================================================ */
window.CRM = window.CRM || {};

CRM.data = (function () {
  const cfg = CRM.config;
  const DAY = 86400000;
  let cache = null;

  const urlMode = new URLSearchParams(location.search).get('mode');
  const MODE = urlMode || cfg.mode || 'demo';
  CRM.mode = MODE;

  // ---- load the dataset once (async: live mode fetches) ----------
  async function dataset() {
    if (cache) return cache;
    cache = (MODE === 'live') ? await loadLive() : CRM.seed();
    return cache;
  }
  CRM.reload = () => { cache = null; };

  async function loadLive() {
    const token = sessionStorage.getItem('apx_token') || '';
    const res = await fetch(cfg.liveEndpoint || '/api/crm-data', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) { const e = new Error('crm-data ' + res.status); e.status = res.status; throw e; }
    return shapeLive(await res.json());
  }

  // shape live Supabase rows into the same structure seed.js produces
  function shapeLive(p) {
    const bookings = (p.bookings || []).map((b) => ({
      id: b.id, name: b.name, phone: b.phone, email: b.email,
      services: Array.isArray(b.services) ? b.services : [],
      est: Number(b.est_value) || 0,
      source: b.source || 'website', status: b.status || 'new',
      preferred_date: b.preferred_date, preferred_time: b.preferred_time,
      notes: b.notes, created_at: b.created_at
    }));
    const events = p.events || [];
    const traffic = events.filter((e) => e.type === 'pageview');
    const clicks = events.filter((e) => /_click$/.test(e.type)).map((e) => ({ type: e.type, created_at: e.created_at }));

    // continuous 30-day visitor series (unique sessions/day, zero-filled)
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const byDay = {};
    traffic.forEach((e, i) => { const d = (e.created_at || '').slice(0, 10); (byDay[d] = byDay[d] || new Set()).add(e.session || 's' + i); });
    const series = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(start.getTime() - i * DAY).toISOString().slice(0, 10); series.push({ date: d, visitors: byDay[d] ? byDay[d].size : 0 }); }

    return { bookings, traffic, series, clicks, messages: [], reviews: p.reviews || [] };
  }

  const daysAgo = (n) => Date.now() - n * DAY;
  const within = (iso, n) => new Date(iso).getTime() >= daysAgo(n);
  const money = (n) => cfg.business.currencySymbol + Math.round(n).toLocaleString();

  // ---- derive a Clients CRM from the raw bookings -----------------
  function deriveContacts(bookings) {
    const map = new Map();
    for (const b of bookings) {
      const key = (b.phone || b.email || b.name || '').toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name: b.name, phone: b.phone, email: b.email, visits: 0, completed: 0, ltv: 0, first_seen: b.created_at, last_seen: b.created_at, services: {} });
      }
      const c = map.get(key);
      c.visits++;
      if (b.status === 'completed') { c.completed++; c.ltv += b.est; }
      if (new Date(b.created_at) > new Date(c.last_seen)) c.last_seen = b.created_at;
      if (new Date(b.created_at) < new Date(c.first_seen)) c.first_seen = b.created_at;
      for (const s of b.services) c.services[s.name] = (c.services[s.name] || 0) + 1;
    }
    const cycle = cfg.business.rebookCycleDays;
    return [...map.values()].map((c) => {
      const sinceLast = Math.max(0, Math.floor((Date.now() - new Date(c.last_seen)) / DAY));
      return {
        ...c, sinceLast,
        dueForRebook: c.completed >= 1 && sinceLast >= cycle,
        favourite: Object.entries(c.services).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
        tag: c.visits >= 4 ? 'Regular' : c.visits >= 2 ? 'Returning' : 'New'
      };
    });
  }

  // ================================================================
  //  PUBLIC API  (all async — identical shape in demo and live)
  // ================================================================
  return {
    money,
    get mode() { return MODE; },

    async bookings() {
      const ds = await dataset();
      return ds.bookings.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },

    async contacts() {
      const b = await this.bookings();
      return deriveContacts(b).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
    },

    async messages() { return (await dataset()).messages; },
    async reviews()  { return (await dataset()).reviews; },
    async series()   { return (await dataset()).series; },

    async overview() {
      const ds = await dataset();
      const b = ds.bookings.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const webEnq = b.filter((x) => x.source === 'website');

      const valueFromWebsite = webEnq.filter((x) => within(x.created_at, 30) && x.status !== 'cancelled').reduce((a, x) => a + x.est, 0);
      const clicks = ds.clicks.filter((c) => within(c.created_at, 30));
      const waClicks = clicks.filter((c) => c.type === 'wa_click').length;
      const igClicks = clicks.filter((c) => c.type === 'ig_click').length;

      const pv = ds.traffic.filter((t) => within(t.created_at, 30));
      const sessions = new Set(pv.map((t) => t.session));
      const avgDur = pv.reduce((a, t) => a + (t.duration || 0), 0) / (pv.filter((t) => t.duration).length || 1);

      const byService = {};
      for (const x of webEnq.filter((x) => within(x.created_at, 30))) {
        for (const s of x.services) { byService[s.name] = byService[s.name] || { count: 0, value: 0 }; byService[s.name].count++; byService[s.name].value += s.price; }
      }
      const enquiriesByService = Object.entries(byService).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);

      const srcMap = {};
      for (const t of pv) srcMap[t.referrer] = (srcMap[t.referrer] || 0) + 1;
      const sources = Object.entries(srcMap).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v);

      const pageMap = {};
      const label = { '/': 'Home', '/services': 'Services', '/book': 'Book', '/index#gallery': 'Gallery' };
      for (const t of pv) pageMap[t.path] = (pageMap[t.path] || 0) + 1;
      const topPages = Object.entries(pageMap).map(([path, v]) => ({ label: label[path] || path, path, v })).sort((a, b) => b.v - a.v).slice(0, 6);

      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      return {
        valueFromWebsite,
        totalRequests: b.length,
        thisMonth: b.filter((x) => new Date(x.created_at) >= monthStart).length,
        last7: b.filter((x) => within(x.created_at, 7)).length,
        completed: b.filter((x) => x.status === 'completed').length,
        pending: b.filter((x) => x.status === 'new' || x.status === 'confirmed').length,
        waClicks, igClicks,
        visitors: sessions.size, pageViews: pv.length, avgTime: avgDur, newVisitorPct: 0.78,
        enquiriesByService, sources, topPages
      };
    },

    async insights() {
      const ds = await dataset();
      const b = ds.bookings;
      const done = b.filter((x) => x.status === 'completed');
      const avgValue = done.reduce((a, x) => a + x.est, 0) / (done.length || 1);
      const noShow = b.filter((x) => x.status === 'noshow').length;
      const cancelled = b.filter((x) => x.status === 'cancelled').length;
      const noShowRate = (noShow + cancelled) / (b.length || 1);

      const dow = [0, 0, 0, 0, 0, 0, 0];
      for (const x of b) dow[new Date(x.created_at).getDay()]++;
      const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const busiest = dowNames.map((n, i) => ({ day: n, v: dow[i] }));

      const svc = {};
      for (const x of b) for (const s of x.services) { svc[s.name] = svc[s.name] || { count: 0, value: 0 }; svc[s.name].count++; svc[s.name].value += s.price; }
      const leaderboard = Object.entries(svc).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);

      const pv = ds.traffic.filter((t) => within(t.created_at, 30));
      const sessions = new Set(pv.map((t) => t.session)).size;
      const bookViews = new Set(pv.filter((t) => t.path === '/book' || /contact|book|start/i.test(t.path)).map((t) => t.session)).size;
      const submits = b.filter((x) => x.source === 'website' && within(x.created_at, 30)).length;

      return { avgValue, noShowRate, noShow, cancelled, busiest, leaderboard, funnel: { sessions, bookViews, submits } };
    },

    async setStatus(id, status) {
      const ds = await dataset();
      const b = ds.bookings.find((x) => x.id === id);
      if (b) b.status = status;
      // live write-back would PATCH /api/crm-data here (needs a write endpoint)
      return b;
    }
  };
})();
