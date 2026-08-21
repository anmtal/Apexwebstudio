/* ============================================================
   APEX CRM — demo data generator
   Produces a realistic 34-day window of bookings, website traffic,
   messages and reviews so the dashboard looks alive without a
   backend. Deterministic (seeded PRNG) so numbers stay stable
   across reloads. Dates are anchored to *today* so it always reads
   as current. Replaced wholesale by Supabase in live mode.
   ============================================================ */
window.CRM = window.CRM || {};

CRM.seed = function seed() {
  // ---- deterministic PRNG (mulberry32) so the demo is stable -----
  let s = 0x9e3779b9;
  const rnd = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const chance = (p) => rnd() < p;

  const svc = CRM.config.services;
  const DAY = 86400000;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const firstNames = ['James','Marcus','Andre','Devon','Liam','Noah','Ethan','Mason','Kofi','Malik','Diego','Ryan','Tyler','Omar','Jordan','Chris','Nathan','Isaiah','Leon','Cole','Sam','Aiden','Hassan','Zane','Owen','Elias','Rio','Kai','Theo','Jayden','Marco','Vince','Dominic','Rafael','Sean'];
  const lastNames = ['Reyes','Thompson','Okafor','Bennett','Nguyen','Silva','Carter','Ali','Brooks','Ferrari','Delgado','Walsh','Osei','Romano','Khan','Mercer','Prince','Dubois','Vance','Cross','Ellis','Hayes','Nash','Cole','Beckett','Amara','Russo','Frost','Diaz','Blake'];
  const sources = [
    { key: 'website',   w: 0.56 },
    { key: 'instagram', w: 0.20 },
    { key: 'whatsapp',  w: 0.14 },
    { key: 'walkin',    w: 0.06 },
    { key: 'phone',     w: 0.04 }
  ];
  const weightedSource = () => {
    let r = rnd(), acc = 0;
    for (const s of sources) { acc += s.w; if (r <= acc) return s.key; }
    return 'website';
  };
  const times = ['Morning','Afternoon','Evening','Any time'];

  // A small pool of repeat clients so the Clients CRM has real regulars
  const pool = [];
  for (let i = 0; i < 26; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = pick(lastNames);
    pool.push({
      name: `${fn} ${ln}`,
      phone: `(${int(200,989)}) ${int(200,989)}-${String(int(0,9999)).padStart(4,'0')}`,
      email: chance(0.7) ? `${fn.toLowerCase()}.${ln.toLowerCase()}@email.com` : ''
    });
  }

  const chooseServices = () => {
    const n = chance(0.55) ? 1 : chance(0.75) ? 2 : 3;
    const chosen = [];
    const bag = svc.slice();
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rnd() * bag.length);
      chosen.push(bag.splice(idx, 1)[0]);
    }
    return chosen;
  };

  // ---- bookings ---------------------------------------------------
  const bookings = [];
  let id = 1000;
  // Volume per day rises toward "now" (a growing business)
  for (let d = 33; d >= 0; d--) {
    const created = new Date(startOfToday.getTime() - d * DAY);
    const dow = created.getDay();
    let base = 1.6 + (33 - d) * 0.045;            // gentle upward trend
    if (dow === 0) base *= 0.5;                    // Sundays quieter
    if (dow === 5 || dow === 6) base *= 1.45;      // Fri/Sat busy
    const count = Math.max(0, Math.round(base + (rnd() * 2 - 1)));

    for (let k = 0; k < count; k++) {
      const isRepeat = chance(0.42) && pool.length;
      const who = isRepeat ? pick(pool) : {
        name: `${pick(firstNames)} ${pick(lastNames)}`,
        phone: `(${int(200,989)}) ${int(200,989)}-${String(int(0,9999)).padStart(4,'0')}`,
        email: chance(0.6) ? `${pick(firstNames).toLowerCase()}${int(1,99)}@email.com` : ''
      };
      const services = chooseServices();
      const est = services.reduce((a, s) => a + s.price, 0);
      const source = weightedSource();
      const createdAt = new Date(created.getTime() + int(9,20) * 3600000 + int(0,59) * 60000);

      // status depends on how long ago + a little chance
      let status;
      if (d <= 1) status = chance(0.55) ? 'new' : 'confirmed';
      else if (d <= 4) status = pick(['confirmed','completed','completed','new']);
      else status = chance(0.12) ? (chance(0.5) ? 'cancelled' : 'noshow') : 'completed';

      // preferred date: a few days out from creation
      const pref = new Date(created.getTime() + int(0,6) * DAY);
      const subVal = (status === 'completed' && chance(0.15)) ? 'cancelled' : 'active';

      bookings.push({
        id: id++,
        name: who.name,
        phone: who.phone,
        email: who.email,
        services,
        est,
        source,
        status,
        is_client: status === 'completed',
        subscription: subVal,
        cancelled_at: subVal === 'cancelled' ? createdAt.toISOString() : null,
        preferred_date: pref.toISOString().slice(0,10),
        preferred_time: pick(times),
        notes: chance(0.4) ? pick([
          'Mid skin fade with a scissor top, plus a beard line-up.',
          'Same as last time — number 2 on the sides.',
          'First visit, wants a consultation on style.',
          'Please book with the same barber as before.',
          'Wedding on the weekend — wants it sharp.',
          'Bringing his son for a kids cut too.'
        ]) : '',
        created_at: createdAt.toISOString()
      });
    }
  }

  // ---- website traffic (events) ----------------------------------
  // Daily visitor series that loosely leads bookings (funnel feel).
  const traffic = [];
  const paths = [
    { path: '/',            w: 0.42, label: 'Home' },
    { path: '/services',    w: 0.24, label: 'Services' },
    { path: '/book',        w: 0.22, label: 'Book' },
    { path: '/index#gallery', w: 0.12, label: 'Gallery' }
  ];
  const refs = [
    { key: 'Google',    w: 0.44 },
    { key: 'Instagram', w: 0.27 },
    { key: 'Direct',    w: 0.20 },
    { key: 'Facebook',  w: 0.09 }
  ];
  const weighted = (list) => { let r = rnd(), acc = 0; for (const x of list) { acc += x.w; if (r <= acc) return x; } return list[0]; };

  const series = [];
  for (let d = 33; d >= 0; d--) {
    const day = new Date(startOfToday.getTime() - d * DAY);
    const dow = day.getDay();
    let base = 22 + (33 - d) * 1.6;
    if (dow === 0) base *= 0.6;
    if (dow === 5 || dow === 6) base *= 1.3;
    const visitors = Math.max(4, Math.round(base + (rnd() * 14 - 7)));
    series.push({ date: day.toISOString().slice(0,10), visitors });
    for (let v = 0; v < visitors; v++) {
      const session = `s${d}_${v}`;
      const ref = weighted(refs).key;
      const views = int(1, 4);
      for (let p = 0; p < views; p++) {
        traffic.push({
          type: 'pageview',
          path: weighted(paths).path,
          referrer: ref,
          session,
          duration: int(12, 240),
          created_at: new Date(day.getTime() + int(8,22) * 3600000 + int(0,59) * 60000).toISOString()
        });
      }
    }
  }
  // direct-contact clicks (counted separately from form value)
  const clicks = [];
  const clickTypes = [['wa_click', 0.5], ['ig_click', 0.32], ['call_click', 0.1], ['email_click', 0.08]];
  for (let d = 30; d >= 0; d--) {
    const day = new Date(startOfToday.getTime() - d * DAY);
    const n = int(0, 3);
    for (let i = 0; i < n; i++) {
      let r = rnd(), acc = 0, t = 'wa_click';
      for (const [k, w] of clickTypes) { acc += w; if (r <= acc) { t = k; break; } }
      clicks.push({ type: t, created_at: new Date(day.getTime() + int(9,21)*3600000).toISOString() });
    }
  }

  // ---- messages (channel log) ------------------------------------
  const messages = [];
  const msgSnippets = [
    'Hey do you have anything free Saturday afternoon?',
    'Can I get a skin fade and beard line-up?',
    'What time do you close today?',
    'Do you take walk-ins for kids cuts?',
    'Loved the last cut 🔥 booking again',
    'Is the VIP package available this week?',
    'Can my son come in too? He needs a trim.',
    'Running 10 min late, is that ok?'
  ];
  for (let i = 0; i < 14; i++) {
    const who = pick(pool);
    const ch = pick(['whatsapp','instagram','instagram','email']);
    messages.push({
      channel: ch,
      name: who.name,
      snippet: pick(msgSnippets),
      created_at: new Date(now.getTime() - int(0, 26) * 3600000 - int(0, 59) * 60000).toISOString(),
      unread: i < 3
    });
  }
  messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // ---- reviews ----------------------------------------------------
  const reviews = [
    { author: 'Andre Bennett', rating: 5, source: 'Google', text: 'Cleanest fade in town. The barber takes his time and it shows.', created_at: new Date(now - 3*DAY).toISOString() },
    { author: 'Devon Brooks',  rating: 5, source: 'Google', text: 'Booked online in a minute, in and out, sharp as ever.', created_at: new Date(now - 6*DAY).toISOString() },
    { author: 'Liam Walsh',    rating: 5, source: 'Instagram', text: 'The hot towel shave is unreal. Worth every penny.', created_at: new Date(now - 9*DAY).toISOString() },
    { author: 'Omar Khan',     rating: 4, source: 'Google', text: 'Great cut, only knocked one star for the wait — worth it though.', created_at: new Date(now - 12*DAY).toISOString() },
    { author: 'Cole Ellis',    rating: 5, source: 'Google', text: 'Brought my son for his first cut, they were amazing with him.', created_at: new Date(now - 15*DAY).toISOString() }
  ];

  // form engagement (started the enquiry form) — a fraction of daily visitors
  const formStarts = [];
  for (let d = 30; d >= 0; d--) {
    const day = new Date(startOfToday.getTime() - d * DAY);
    const dv = series.find((s) => s.date === day.toISOString().slice(0, 10));
    const n = Math.round(((dv && dv.visitors) || 0) * 0.16);
    for (let i = 0; i < n; i++) formStarts.push({ type: 'form_start', session: `fs${d}_${i}`, created_at: new Date(day.getTime() + int(9, 21) * 3600000).toISOString() });
  }

  // ---- appointments (the booking calendar) -----------------------
  // Real scheduled bookings across the current month — a mix added by
  // hand and "synced" from an external calendar, so the Calendar tab
  // reads like an appointment book, not a lead log.
  const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const slots = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00'];
  const apptTitles = svc.map((s) => s.name);
  const appointments = [];
  let aid = 5000;
  for (let d = -12; d <= 20; d++) {
    const day = new Date(startOfToday.getTime() + d * DAY);
    const dow = day.getDay();
    if (dow === 0) continue;                          // closed Sundays
    let n = chance(0.5) ? 1 : chance(0.72) ? 2 : 0;
    if (dow === 5 || dow === 6) n += 1;               // busier Fri/Sat
    const used = new Set();
    for (let k = 0; k < n; k++) {
      const who = pick(pool);
      let time = pick(slots), guard = 0;
      while (used.has(time) && guard++ < 8) time = pick(slots);
      used.add(time);
      const past = d < 0;
      appointments.push({
        id: aid++,
        client: who.name, phone: who.phone, email: who.email,
        title: pick(apptTitles),
        date: ymd(day), time,
        duration: pick([30, 45, 60, 60, 90]),
        status: past ? (chance(0.12) ? 'cancelled' : 'completed') : 'scheduled',
        source: pick(['google', 'google', 'outlook', 'apple', 'ical']),   // seeded = synced (read-only); 'manual' is reserved for bookings you add here
        notes: '',
        created_at: new Date(day.getTime() - 2 * DAY).toISOString()
      });
    }
  }

  return { bookings, traffic, series, clicks, formStarts, messages, reviews, appointments };
};
