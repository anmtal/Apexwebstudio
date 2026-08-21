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

  // ---- appointments (the booking calendar) ------------------------
  // Manual bookings live in the browser (localStorage) so "add to the
  // calendar" works instantly with zero backend. Synced/external ones
  // (Google/Outlook/Apple or a Supabase table) arrive via the dataset
  // and are merged in read-only. Both share one shape.
  const LS_APPTS = 'apx_appointments';
  const loadLocalAppts = () => { try { return JSON.parse(localStorage.getItem(LS_APPTS) || '[]'); } catch { return []; } };
  const saveLocalAppts = (arr) => { try { localStorage.setItem(LS_APPTS, JSON.stringify(arr)); return true; } catch { return false; } };
  const pad2 = (n) => String(n).padStart(2, '0');
  function normAppt(a) {
    a = a || {};
    const starts = a.starts_at || a.start || '';
    let date = a.date || '', time = a.time || '';
    if ((!date || !time) && starts) {
      // synced rows carry a UTC timestamptz — convert to the viewer's LOCAL
      // wall clock so evening bookings don't roll onto the next calendar day
      const dt = new Date(starts);
      if (!isNaN(dt.getTime())) {
        if (!date) date = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
        if (!time) time = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
      }
    }
    return {
      id: a.id != null ? a.id : ('loc_' + Date.now()),
      client: (a.client || a.name || '').trim() || 'Client',
      title: (a.title || a.service || '').trim() || 'Appointment',
      date, time,
      duration: Number(a.duration) || 60,
      status: a.status || 'scheduled',                 // scheduled | completed | cancelled
      source: a.source || 'manual',                    // manual | google | outlook | apple | ical
      phone: a.phone || '', email: a.email || '',
      meetingUrl: (a.meetingUrl || a.meeting_url || '').trim(),   // optional online-meeting link
      notes: a.notes || '',
      created_at: a.created_at || new Date().toISOString()
    };
  }

  // ---- calendar connections (Connect Google/Outlook/Calendly/iCal) --
  // Saved links to external calendars. Two-way sync runs server-side
  // (a scheduled fetch of each iCal feed / an OAuth app) — until that's
  // wired these are stored here and drive the "Connected" UI.
  const LS_CALCONN = 'apx_calendar_connections';
  const loadConns = () => { try { return JSON.parse(localStorage.getItem(LS_CALCONN) || '[]'); } catch { return []; } };
  const saveConns = (arr) => { try { localStorage.setItem(LS_CALCONN, JSON.stringify(arr)); return true; } catch { return false; } };
  // ONLY browser-added bookings (loc_ ids in localStorage) can be edited/
  // deleted here — that's the only place the writes can land. Synced rows
  // are read-only, managed in their source calendar.
  const isEditableAppt = (a) => String(a.id).startsWith('loc_');

  // classify a services array into recurring (MRR) vs one-time (setup) $$
  const RECURRING = new Map((cfg.services || []).map((s) => [s.name, s.recurring !== false]));
  const splitValue = (services) => {
    let monthly = 0, oneTime = 0;
    for (const s of (services || [])) {
      if (RECURRING.get(s.name) === false) oneTime += Number(s.price) || 0;
      else monthly += Number(s.price) || 0;
    }
    return { monthly, oneTime };
  };

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
    const token = localStorage.getItem('apx_token') || '';
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
      is_client: !!b.is_client,
      subscription: b.subscription || 'active',
      cancelled_at: b.cancelled_at || null,
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

    return { bookings, traffic, series, clicks, formStarts: events.filter((e) => e.type === 'form_start'), messages: [], reviews: p.reviews || [], appointments: (p.appointments || []).map(normAppt) };
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
        const sv0 = splitValue(b.services);
        map.set(key, { name: b.name, phone: b.phone, email: b.email, visits: 0, completed: 0, ltv: 0, first_seen: b.created_at, last_seen: b.created_at, services: {}, clientId: b.id, monthly: sv0.monthly, oneTime: sv0.oneTime, recurringServices: (b.services || []).filter((s) => RECURRING.get(s.name) !== false), subscription: b.subscription || 'active', cancelledAt: b.cancelled_at || null });
      }
      const c = map.get(key);
      c.visits++;
      if (b.status === 'completed') { c.completed++; c.ltv += b.est; }
      if (new Date(b.created_at) >= new Date(c.last_seen)) {
        const sv = splitValue(b.services);
        c.last_seen = b.created_at;
        c.clientId = b.id; c.monthly = sv.monthly; c.oneTime = sv.oneTime; c.recurringServices = (b.services || []).filter((s) => RECURRING.get(s.name) !== false); c.subscription = b.subscription || 'active'; c.cancelledAt = b.cancelled_at || null;
      }
      if (new Date(b.created_at) < new Date(c.first_seen)) c.first_seen = b.created_at;
      for (const s of b.services) c.services[s.name] = (c.services[s.name] || 0) + 1;
    }
    const cycle = cfg.business.rebookCycleDays;
    return [...map.values()].map((c) => {
      const sinceLast = Math.max(0, Math.floor((Date.now() - new Date(c.last_seen)) / DAY));
      return {
        ...c, sinceLast,
        active: c.subscription !== 'cancelled',
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
      const b = (await this.bookings()).filter((x) => x.is_client);   // only confirmed clients
      return deriveContacts(b).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
    },

    async messages() { return (await dataset()).messages; },
    async reviews()  { return (await dataset()).reviews; },
    async series()   { return (await dataset()).series; },

    async overview() {
      const ds = await dataset();
      const b = ds.bookings.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const webEnq = b;   // all leads (any source — website form or manually added)

      const openLeads = webEnq.filter((x) => within(x.created_at, 30) && x.status !== 'cancelled' && !x.is_client);
      const valueFromWebsite = openLeads.reduce((a, x) => a + splitValue(x.services).monthly, 0);
      const pipelineOneTime = openLeads.reduce((a, x) => a + splitValue(x.services).oneTime, 0);
      const clicks = ds.clicks.filter((c) => within(c.created_at, 30));
      const waClicks = clicks.filter((c) => c.type === 'wa_click').length;
      const igClicks = clicks.filter((c) => c.type === 'ig_click').length;

      const pv = ds.traffic.filter((t) => within(t.created_at, 30));
      const sessions = new Set(pv.map((t) => t.session));
      const avgDur = pv.reduce((a, t) => a + (t.duration || 0), 0) / (pv.filter((t) => t.duration).length || 1);

      const byService = {};   // open pipeline by service (recurring, excludes signed clients) → reconciles to pipeline
      for (const x of webEnq.filter((x) => within(x.created_at, 30) && x.status !== 'cancelled' && !x.is_client)) {
        for (const s of x.services) {
          if (RECURRING.get(s.name) === false) continue;
          byService[s.name] = byService[s.name] || { count: 0, value: 0 }; byService[s.name].count++; byService[s.name].value += s.price;
        }
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
        valueFromWebsite, pipelineOneTime,
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
      const started = new Set((ds.formStarts || []).filter((e) => within(e.created_at, 30)).map((e) => e.session)).size;
      const submits = b.filter((x) => x.source === 'website' && within(x.created_at, 30)).length;

      return { avgValue, noShowRate, noShow, cancelled, busiest, leaderboard, funnel: { sessions, started, submits } };
    },

    async setStatus(id, status) {
      const ds = await dataset();
      const b = ds.bookings.find((x) => x.id === id);
      if (b) b.status = status;              // optimistic UI
      if (MODE === 'live') {
        try {
          await fetch('/api/booking-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('apx_token') || '') },
            body: JSON.stringify({ id, status })
          });
        } catch (e) { /* keep optimistic UI; will reconcile on next load */ }
      }
      return b;
    },

    // toggle the "client confirmed" flag (promotes a lead into Clients)
    async setClient(id, isClient) {
      const ds = await dataset();
      const b = ds.bookings.find((x) => x.id === id);
      if (b) b.is_client = isClient;
      if (MODE === 'live') {
        try {
          await fetch('/api/booking-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('apx_token') || '') },
            body: JSON.stringify({ id, is_client: isClient })
          });
        } catch (e) { /* keep optimistic UI */ }
      }
      return b;
    },

    // manually add a lead or client (cold call / off-portal)
    async createLead(payload) {
      const ds = await dataset();
      const row = {
        id: payload.id || 'm' + Date.now(),
        name: payload.name, email: payload.email || '', phone: payload.phone || '',
        services: payload.services || [], est: Number(payload.est_value) || 0,
        source: payload.source || 'manual', status: 'new', is_client: !!payload.is_client,
        preferred_date: null, preferred_time: null, notes: payload.notes || '',
        created_at: new Date().toISOString()
      };
      ds.bookings.unshift(row);
      if (MODE === 'live') {
        try {
          const r = await fetch('/api/lead-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('apx_token') || '') },
            body: JSON.stringify(payload)
          });
          const created = await r.json();
          if (created && created.id) { row.id = created.id; if (Number(created.est_value)) row.est = Number(created.est_value); }
        } catch (e) { /* stays in local cache */ }
      }
      return row;
    },

    // subscription revenue: MRR, ARR, this-year total, active/churned
    async revenue() {
      const cs = await this.contacts();
      const active = cs.filter((c) => c.active);
      const mrr = active.reduce((a, c) => a + (Number(c.monthly) || 0), 0);
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
      let recurringYtd = 0, oneTimeYtd = 0;
      for (const c of cs) {
        const start = new Date(Math.max(new Date(c.first_seen).getTime(), yearStart));
        const end = (!c.active && c.cancelledAt) ? new Date(c.cancelledAt) : now;
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
        recurringYtd += (Number(c.monthly) || 0) * Math.max(0, months);
        if (new Date(c.first_seen).getTime() >= yearStart) oneTimeYtd += Number(c.oneTime) || 0;   // one-time recognized when signed
      }
      // recurring revenue by service across ACTIVE clients (reconciles to MRR)
      const svcRev = {};
      for (const c of active) for (const s of (c.recurringServices || [])) svcRev[s.name] = (svcRev[s.name] || 0) + (Number(s.price) || 0);
      const revenueByService = Object.entries(svcRev).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

      return { mrr, arr: mrr * 12, ytd: recurringYtd + oneTimeYtd, recurringYtd, oneTimeYtd, revenueByService, activeCount: active.length, churnedCount: cs.length - active.length, avg: active.length ? mrr / active.length : 0 };
    },

    // active | cancelled — unsubscribe / reactivate a client (feeds MRR/ARR)
    async setSubscription(id, status) {
      const ds = await dataset();
      const b = ds.bookings.find((x) => x.id === id);
      if (b) { b.subscription = status; b.cancelled_at = status === 'cancelled' ? new Date().toISOString() : null; }
      if (MODE === 'live') {
        try {
          await fetch('/api/booking-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('apx_token') || '') },
            body: JSON.stringify({ id, subscription: status })
          });
        } catch (e) { /* optimistic */ }
      }
      return b;
    },

    // ---- APPOINTMENTS (the booking calendar) --------------------
    // merged view: synced/server appointments (read-only) + manual
    // bookings added right here (editable, stored in the browser)
    async appointments() {
      const ds = await dataset();
      const server = (ds.appointments || []).map(normAppt);
      const seen = new Set(server.map((a) => String(a.id)));
      const local = loadLocalAppts().map(normAppt).filter((a) => !seen.has(String(a.id)));
      const all = server.concat(local);
      return all.sort((a, b) => (a.date + 'T' + (a.time || '99:99')).localeCompare(b.date + 'T' + (b.time || '99:99')));
    },
    apptEditable: isEditableAppt,

    // add a booking straight onto the calendar (manual → localStorage)
    async createAppointment(input) {
      const row = normAppt(Object.assign({ id: 'loc_' + Date.now(), source: 'manual', status: 'scheduled' }, input));
      const local = loadLocalAppts(); local.push(row);
      if (!saveLocalAppts(local)) { const e = new Error("This browser is blocking local storage, so the booking couldn't be saved."); e.code = 'storage'; throw e; }
      return row;
    },

    // edit / reschedule / mark done — manual bookings only
    async updateAppointment(id, patch) {
      const local = loadLocalAppts();
      const i = local.findIndex((a) => String(a.id) === String(id));
      if (i < 0) return null;              // synced appt → managed in its source calendar
      local[i] = normAppt(Object.assign({}, local[i], patch));
      if (!saveLocalAppts(local)) { const e = new Error("This browser is blocking local storage, so the change couldn't be saved."); e.code = 'storage'; throw e; }
      return local[i];
    },

    async deleteAppointment(id) {
      const local = loadLocalAppts();
      const next = local.filter((a) => String(a.id) !== String(id));
      saveLocalAppts(next);
      return next.length !== local.length;
    },

    // ---- CALENDAR CONNECTIONS -----------------------------------
    async calendarConnections() { return loadConns(); },
    async addCalendarConnection(input) {
      const row = {
        id: 'cc_' + Date.now(),
        provider: input.provider || 'ical',            // google|outlook|apple|calendly|ical
        label: (input.label || '').trim(),
        icalUrl: (input.icalUrl || '').trim(),
        status: input.status || 'pending',             // pending (awaiting backend sync) | active
        created_at: new Date().toISOString()
      };
      const arr = loadConns(); arr.push(row);
      if (!saveConns(arr)) { const e = new Error("This browser is blocking local storage, so the connection couldn't be saved."); e.code = 'storage'; throw e; }
      return row;
    },
    async removeCalendarConnection(id) {
      const arr = loadConns();
      const next = arr.filter((c) => String(c.id) !== String(id));
      saveConns(next);
      return next.length !== arr.length;
    }
  };
})();
