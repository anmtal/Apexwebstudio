/* ============================================================
   APEX CRM — application layer
   Renders every view from CRM.data. No framework, no build step.
   ============================================================ */
(function () {
  const cfg = CRM.config, data = CRM.data, biz = cfg.business;
  const $ = (s, r = document) => r.querySelector(s);
  const money = data.money;
  const ENT = cfg.entity || { plural: 'Bookings', singular: 'Booking' };
  const FEAT = Object.assign({ calendar: true, splash: true }, cfg.features || {});

  // ---- helpers ---------------------------------------------------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const initials = (n) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate = (iso) => { const d = new Date(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const fmtDateTime = (iso) => { const d = new Date(iso); let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h}:${String(m).padStart(2, '0')} ${ap}`; };
  const relTime = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; };
  const STATUS = { new: 'New', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', noshow: 'No-show' };
  const SRC = {
    website: { i: 'fa-solid fa-globe', l: 'Website form' },
    instagram: { i: 'fa-brands fa-instagram', l: 'Instagram' },
    whatsapp: { i: 'fa-brands fa-whatsapp', l: 'WhatsApp' },
    walkin: { i: 'fa-solid fa-person-walking', l: 'Walk-in' },
    phone: { i: 'fa-solid fa-phone', l: 'Phone' }
  };
  const CH = { whatsapp: 'fa-brands fa-whatsapp', instagram: 'fa-brands fa-instagram', email: 'fa-solid fa-envelope' };
  const pillOf = (s) => `<span class="pill ${s}">${STATUS[s]}</span>`;
  const delta = (a, b) => { if (!b) return null; const p = Math.round(((a - b) / b) * 100); return { dir: p >= 0 ? 'up' : 'down', pct: Math.abs(p) }; };
  const deltaHTML = (d, suffix = 'vs last week') => d ? `<span class="delta ${d.dir}"><i class="fa-solid fa-arrow-${d.dir === 'up' ? 'up' : 'down'}"></i>${d.pct}%</span> ${suffix}` : '';

  // ---- charts ----------------------------------------------------
  function barChart(series, showDays = 28) {
    const s = series.slice(-showDays);
    const max = Math.max(...s.map((x) => x.visitors), 1);
    return `<div class="chart">${s.map((x, i) => {
      const d = new Date(x.date);
      const lab = (i % 4 === 0) ? `${d.getDate()}/${d.getMonth() + 1}` : '';
      return `<div class="col" title="${fmtDate(x.date)}: ${x.visitors} visitors">
        <div class="cbar" style="height:${Math.max(3, (x.visitors / max) * 100)}%"></div>
        <span class="cx">${lab}</span></div>`;
    }).join('')}</div>`;
  }
  function barList(rows, opts = {}) {
    const max = Math.max(...rows.map((r) => r.v), 1);
    return `<div class="bars">${rows.map((r) => `<div class="bar-row">
      <div class="bar-top"><b>${esc(r.label)}</b><span>${opts.fmt ? opts.fmt(r.v) : r.v}</span></div>
      <div class="bar-track"><div class="bar-fill ${opts.alt ? 'alt' : ''}" style="width:${(r.v / max) * 100}%"></div></div>
    </div>`).join('')}</div>`;
  }

  // ================================================================
  //  VIEW: OVERVIEW
  // ================================================================
  async function renderOverview(root) {
    const o = await data.overview();
    const bookings = await data.bookings();
    const series = await data.series();

    // real deltas
    const last7 = series.slice(-7).reduce((a, x) => a + x.visitors, 0);
    const prev7 = series.slice(-14, -7).reduce((a, x) => a + x.visitors, 0);
    const bk7 = bookings.filter((b) => Date.now() - new Date(b.created_at) < 7 * 864e5).length;
    const bkPrev7 = bookings.filter((b) => { const t = Date.now() - new Date(b.created_at); return t >= 7 * 864e5 && t < 14 * 864e5; }).length;
    const roi = cfg.plan ? (o.valueFromWebsite / cfg.plan.price) : 0;
    const heroDesc = cfg.hero
      ? `${money(o.valueFromWebsite)} ${esc(cfg.hero.suffix)}`
      : `${money(o.valueFromWebsite)} in warm leads — that covers your ${money(cfg.plan.price)}/mo plan <b style="color:var(--gold)">${roi.toFixed(1)}×</b> over.`;

    root.innerHTML = `
      <div class="grid kpis">
        <div class="card kpi value-hero">
          <div class="top"><div class="lbl">${esc(cfg.hero?.label || 'Value from your website · last 30 days')}</div>
            <div class="ic"><i class="fa-solid fa-sack-dollar"></i></div></div>
          <div class="val">${money(o.valueFromWebsite)}</div>
          <div class="desc">${heroDesc}
            <span class="info">i<span class="tip">${esc(cfg.valueMethodology)}</span></span></div>
        </div>
        <div class="card kpi">
          <div class="top"><div class="lbl">Total requests</div><div class="ic"><i class="fa-solid fa-inbox"></i></div></div>
          <div class="val">${o.totalRequests}</div>
          <div class="foot">${deltaHTML(delta(bk7, bkPrev7))}</div>
        </div>
        <div class="card kpi">
          <div class="top"><div class="lbl">This month</div><div class="ic"><i class="fa-solid fa-calendar-day"></i></div></div>
          <div class="val">${o.thisMonth}</div>
          <div class="foot">${o.pending} awaiting confirmation</div>
        </div>
        <div class="card kpi">
          <div class="top"><div class="lbl">Last 7 days</div><div class="ic"><i class="fa-solid fa-bolt"></i></div></div>
          <div class="val">${o.last7}</div>
          <div class="foot">${deltaHTML(delta(bk7, bkPrev7))}</div>
        </div>
        <div class="card kpi">
          <div class="top"><div class="lbl">Completed</div><div class="ic"><i class="fa-solid fa-circle-check"></i></div></div>
          <div class="val">${o.completed}</div>
          <div class="foot">served clients</div>
        </div>
      </div>

      <div class="section-head"><h2>Website traffic</h2><span class="hint">Live · last 30 days</span></div>
      <div class="grid kpis">
        <div class="card kpi"><div class="top"><div class="lbl">Visitors</div><div class="ic"><i class="fa-solid fa-user-group"></i></div></div>
          <div class="val">${o.visitors.toLocaleString()}</div><div class="foot">${deltaHTML(delta(last7, prev7))}</div></div>
        <div class="card kpi"><div class="top"><div class="lbl">Page views</div><div class="ic"><i class="fa-solid fa-eye"></i></div></div>
          <div class="val">${o.pageViews.toLocaleString()}</div><div class="foot">${(o.pageViews / (o.visitors || 1)).toFixed(1)} per visitor</div></div>
        <div class="card kpi"><div class="top"><div class="lbl">Avg. time on site</div><div class="ic"><i class="fa-solid fa-clock"></i></div></div>
          <div class="val">${Math.floor(o.avgTime / 60)}m ${Math.round(o.avgTime % 60)}s</div><div class="foot">per session</div></div>
        <div class="card kpi"><div class="top"><div class="lbl">Direct clicks</div><div class="ic"><i class="fa-brands fa-whatsapp"></i></div></div>
          <div class="val">${o.waClicks + o.igClicks}</div><div class="foot">${o.waClicks} WhatsApp · ${o.igClicks} Instagram</div></div>
      </div>

      <div class="grid two" style="margin-top:16px">
        <div class="card card--pad">
          <div class="section-head" style="margin:0 0 6px"><h2>Visitors over time</h2><span class="hint">last 28 days</span></div>
          ${barChart(series)}
        </div>
        <div class="card card--pad">
          <div class="section-head" style="margin:0 0 12px"><h2>Enquiries by service</h2></div>
          <div class="svc-rows">${o.enquiriesByService.slice(0, 7).map((s) => `
            <div class="svc-row"><span class="nm">${esc(s.name)}</span><span class="ct">× ${s.count}</span><span class="vl">${money(s.value)}</span></div>
          `).join('')}</div>
        </div>
      </div>

      <div class="grid three" style="margin-top:16px">
        <div class="card card--pad"><div class="section-head" style="margin:0 0 14px"><h2>Where visitors come from</h2></div>
          ${barList(o.sources.map((s) => ({ label: s.name, v: s.v })))}</div>
        <div class="card card--pad"><div class="section-head" style="margin:0 0 14px"><h2>Top pages</h2></div>
          ${barList(o.topPages.map((p) => ({ label: p.label, v: p.v })), { alt: true })}</div>
        <div class="card card--pad"><div class="section-head" style="margin:0 0 14px"><h2>Recent activity</h2></div>
          <div class="svc-rows">${bookings.slice(0, 6).map((b) => `
            <div class="svc-row"><span class="nm"><i class="${SRC[b.source].i}" style="color:var(--text-dim);margin-right:8px"></i>${esc(b.name)}</span>
            <span class="ct">${relTime(b.created_at)}</span><span class="vl">${money(b.est)}</span></div>`).join('')}</div>
        </div>
      </div>`;
  }

  // ================================================================
  //  VIEW: BOOKINGS
  // ================================================================
  const bk = { status: 'all', source: 'all', sort: 'created', view: 'list', q: '' };
  let ALL_BOOKINGS = [];

  async function renderBookings(root) {
    ALL_BOOKINGS = await data.bookings();
    if (!FEAT.calendar) bk.view = 'list';
    const counts = ALL_BOOKINGS.reduce((a, b) => (a[b.status] = (a[b.status] || 0) + 1, a), {});
    root.innerHTML = `
      <div class="grid pipeline">
        ${['new', 'confirmed', 'completed', 'cancelled', 'noshow'].map((s) => `
          <div class="pipe ${s}"><div class="n">${counts[s] || 0}</div><div class="l">${STATUS[s]}</div></div>`).join('')}
      </div>
      <div class="toolbar">
        <div class="chip-filter" id="bkStatus">
          ${['all', 'new', 'confirmed', 'completed'].map((s) => `<button data-s="${s}" class="${bk.status === s ? 'active' : ''}">${s === 'all' ? 'All' : STATUS[s]}</button>`).join('')}
        </div>
        <select class="select" id="bkSource">
          <option value="all">All sources</option>
          ${Object.keys(SRC).map((k) => `<option value="${k}">${SRC[k].l}</option>`).join('')}
        </select>
        <select class="select" id="bkSort">
          <option value="created">Newest first</option>
          <option value="date">By preferred date</option>
          <option value="value">Highest value</option>
        </select>
        <div class="spacer" style="margin-left:auto"></div>
        ${FEAT.calendar ? `<div class="seg" id="bkView">
          <button data-v="list" class="${bk.view === 'list' ? 'active' : ''}"><i class="fa-solid fa-list"></i> List</button>
          <button data-v="calendar" class="${bk.view === 'calendar' ? 'active' : ''}"><i class="fa-solid fa-calendar"></i> Calendar</button>
        </div>` : ''}
      </div>
      <div class="card" id="bkBody"></div>`;

    $('#bkStatus', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; bk.status = b.dataset.s; renderBookings(root); });
    $('#bkSource', root).value = bk.source; $('#bkSource', root).addEventListener('change', (e) => { bk.source = e.target.value; drawBk(); });
    $('#bkSort', root).value = bk.sort; $('#bkSort', root).addEventListener('change', (e) => { bk.sort = e.target.value; drawBk(); });
    const bkViewEl = $('#bkView', root); if (bkViewEl) bkViewEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; bk.view = b.dataset.v; renderBookings(root); });
    drawBk();

    function filtered() {
      let list = ALL_BOOKINGS.slice();
      if (bk.status !== 'all') list = list.filter((b) => b.status === bk.status);
      if (bk.source !== 'all') list = list.filter((b) => b.source === bk.source);
      if (bk.q) { const q = bk.q.toLowerCase(); list = list.filter((b) => b.name.toLowerCase().includes(q) || (b.phone || '').includes(q) || (b.email || '').toLowerCase().includes(q)); }
      if (bk.sort === 'value') list.sort((a, b) => b.est - a.est);
      else if (bk.sort === 'date') list.sort((a, b) => new Date(a.preferred_date) - new Date(b.preferred_date));
      else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return list;
    }

    function drawBk() {
      const body = $('#bkBody', root);
      if (bk.view === 'calendar') { body.classList.remove('card'); body.innerHTML = calendar(filtered()); return; }
      body.classList.add('card');
      const list = filtered();
      body.innerHTML = `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Client</th><th>Services</th><th>Est. value</th><th>Requested</th><th>Preferred</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>${list.map((b) => `<tr data-id="${b.id}">
          <td><div class="who"><div class="av">${initials(b.name)}</div><div><div class="nm">${esc(b.name)}</div><div class="sub">${esc(b.phone || b.email || '')}</div></div></div></td>
          <td>${b.services.map((s) => esc(s.name)).join(', ')}</td>
          <td><span class="est">${money(b.est)}</span></td>
          <td class="muted">${relTime(b.created_at)}</td>
          <td class="muted">${fmtDate(b.preferred_date)} · ${esc(b.preferred_time)}</td>
          <td><span class="src"><i class="${SRC[b.source].i}"></i> ${SRC[b.source].l}</span></td>
          <td>${pillOf(b.status)}</td>
        </tr>`).join('') || `<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No bookings match.</td></tr>`}</tbody>
      </table></div>`;
      body.querySelectorAll('tbody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openDrawer(+tr.dataset.id)));
    }
  }

  function calendar(list) {
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1).getDay(); const days = new Date(y, m + 1, 0).getDate();
    const byDay = {};
    list.forEach((b) => { const d = new Date(b.preferred_date); if (d.getFullYear() === y && d.getMonth() === m) (byDay[d.getDate()] = byDay[d.getDate()] || []).push(b); });
    let cells = '';
    for (let i = 0; i < first; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const evs = byDay[d] || []; const today = d === now.getDate();
      cells += `<div class="cal-cell ${today ? 'today' : ''}"><div class="d">${d}</div>
        ${evs.slice(0, 2).map((e) => `<div class="cal-ev" data-id="${e.id}">${esc(e.name.split(' ')[0])} · ${money(e.est)}</div>`).join('')}
        ${evs.length > 2 ? `<div class="cal-more">+${evs.length - 2} more</div>` : ''}</div>`;
    }
    return `<div class="cal"><div class="cal-head">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div></div>`;
  }

  // ---- booking drawer + splash -----------------------------------
  function openDrawer(id) {
    const b = ALL_BOOKINGS.find((x) => x.id === id); if (!b) return;
    const drawer = $('#drawer');
    drawer.innerHTML = `
      <div class="drawer-head"><div class="avatar">${initials(b.name)}</div>
        <div><div style="font-weight:600;color:var(--white)">${esc(b.name)}</div><div style="font-size:.8rem;color:var(--text-dim)">Booking #${b.id}</div></div>
        <button class="x" id="drawerX"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="drawer-body">
        <div class="dv-name">${money(b.est)} <span style="font-size:.9rem;color:var(--text-soft)">estimated</span></div>
        <div style="margin:10px 0 18px">${pillOf(b.status)} <span class="src" style="margin-left:8px"><i class="${SRC[b.source].i}"></i> ${SRC[b.source].l}</span></div>
        <div class="dv-row"><div class="k">Services</div><div class="v"><div class="dv-svc">${b.services.map((s) => `<span>${esc(s.name)} · ${money(s.price)}</span>`).join('')}</div></div></div>
        <div class="dv-row"><div class="k">Preferred</div><div class="v">${fmtDate(b.preferred_date)} · ${esc(b.preferred_time)}</div></div>
        <div class="dv-row"><div class="k">Phone</div><div class="v">${esc(b.phone || '—')}</div></div>
        <div class="dv-row"><div class="k">Email</div><div class="v">${esc(b.email || '—')}</div></div>
        <div class="dv-row"><div class="k">Requested</div><div class="v">${fmtDateTime(b.created_at)}</div></div>
        ${b.notes ? `<div class="dv-row"><div class="k">Notes</div><div class="v">${esc(b.notes)}</div></div>` : ''}
        <div style="margin-top:20px"><div class="k" style="color:var(--text-dim);font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Update status</div>
          <div class="status-set" id="statusSet">${Object.keys(STATUS).map((s) => `<button data-s="${s}" class="${b.status === s ? 'on' : ''}">${STATUS[s]}</button>`).join('')}</div></div>
      </div>
      <div class="dv-actions">
        ${FEAT.splash ? `<button class="btn" id="startAppt"><i class="fa-solid fa-tv"></i> Start Appointment (welcome screen)</button>` : ''}
        <div style="display:flex;gap:10px">
          <a class="btn btn--dark btn--block" href="tel:${esc(b.phone || '')}"><i class="fa-solid fa-phone"></i> Call</a>
          <a class="btn btn--dark btn--block" href="https://wa.me/"><i class="fa-brands fa-whatsapp"></i> Message</a>
        </div>
      </div>`;
    drawer.classList.add('show'); $('#scrim').classList.add('show');
    $('#drawerX').addEventListener('click', closeDrawer);
    const startBtn = $('#startAppt'); if (startBtn) startBtn.addEventListener('click', () => showSplash(b));
    $('#statusSet').addEventListener('click', async (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      await data.setStatus(id, btn.dataset.s);
      $('#statusSet').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
      const view = $('.view[data-view="bookings"]'); if (!view.classList.contains('hidden')) renderBookings(view);
    });
  }
  function closeDrawer() { $('#drawer').classList.remove('show'); $('#scrim').classList.remove('show'); }

  function showSplash(b) {
    const sp = $('#splash');
    sp.innerHTML = `<div class="inner">
      <div class="mark mark--lg">${biz.initials}</div>
      <div class="welcome">Welcome to ${esc(biz.name)}</div>
      <h1>Hello,<br/><em>${esc(b.name.split(' ')[0])}</em></h1>
      <p>Your chair is ready. Today's plan:</p>
      <div class="svcs">${b.services.map((s) => `<span>${esc(s.name)}</span>`).join('')}</div>
      <button class="btn btn--lg" id="splashClose"><i class="fa-solid fa-scissors"></i> Let's begin</button>
    </div><div class="close-hint">Tap anywhere to close · shown on the in-studio screen when a client arrives</div>`;
    sp.classList.add('show');
    sp.addEventListener('click', () => sp.classList.remove('show'), { once: true });
  }

  // ================================================================
  //  VIEW: CLIENTS
  // ================================================================
  async function renderClients(root) {
    const contacts = await data.contacts();
    const due = contacts.filter((c) => c.dueForRebook);
    root.innerHTML = `
      ${due.length ? `<div class="radar">
        <div class="ic"><i class="fa-solid fa-arrows-rotate"></i></div>
        <div class="tx"><b>${due.length} client${due.length > 1 ? 's' : ''} due for a rebook</b>
          <p>They completed a visit ${biz.rebookCycleDays}+ days ago and haven't been back. A quick nudge fills next week's chairs.</p></div>
        <button class="btn btn--sm"><i class="fa-solid fa-paper-plane"></i> Message all</button>
      </div>` : ''}
      <div class="card"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Client</th><th>Visits</th><th>Lifetime value</th><th>Favourite</th><th>Last visit</th><th>Status</th></tr></thead>
        <tbody>${contacts.map((c) => `<tr>
          <td><div class="who"><div class="av">${initials(c.name)}</div><div><div class="nm">${esc(c.name)}</div><div class="sub">${esc(c.phone || c.email || '')}</div></div></div></td>
          <td>${c.visits}</td>
          <td><span class="est">${money(c.ltv)}</span></td>
          <td class="muted">${esc(c.favourite)}</td>
          <td class="muted">${c.sinceLast === 0 ? 'Today' : c.sinceLast + 'd ago'}${c.dueForRebook ? ' <i class="fa-solid fa-circle" style="color:var(--gold);font-size:.5rem;vertical-align:middle"></i>' : ''}</td>
          <td><span class="tag ${c.tag === 'Regular' ? 'reg' : c.tag === 'Returning' ? 'ret' : ''}">${c.tag}</span></td>
        </tr>`).join('')}</tbody></table></div></div>`;
  }

  // ================================================================
  //  VIEW: MESSAGES
  // ================================================================
  async function renderMessages(root) {
    const msgs = await data.messages();
    const o = await data.overview();
    root.innerHTML = `
      <div class="grid three">
        <div class="card kpi"><div class="top"><div class="lbl">WhatsApp clicks</div><div class="ic"><i class="fa-brands fa-whatsapp"></i></div></div><div class="val">${o.waClicks}</div><div class="foot">last 30 days</div></div>
        <div class="card kpi"><div class="top"><div class="lbl">Instagram clicks</div><div class="ic"><i class="fa-brands fa-instagram"></i></div></div><div class="val">${o.igClicks}</div><div class="foot">last 30 days</div></div>
        <div class="card kpi"><div class="top"><div class="lbl">Unread</div><div class="ic"><i class="fa-solid fa-comment-dots"></i></div></div><div class="val">${msgs.filter((m) => m.unread).length}</div><div class="foot">need a reply</div></div>
      </div>
      <div class="section-head"><h2>Message log</h2><span class="hint">across WhatsApp, Instagram & email</span></div>
      <div class="card">${msgs.map((m) => `
        <div class="svc-row" style="align-items:flex-start">
          <div class="av" style="width:36px;height:36px;border-radius:50%;background:var(--surface-3);color:var(--gold);display:grid;place-items:center;font-weight:600;flex:none">${initials(m.name)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:8px;align-items:center"><b style="color:var(--text)">${esc(m.name)}</b>
              <span class="src"><i class="${CH[m.channel]}"></i></span>${m.unread ? '<span class="tag ret" style="font-size:.66rem">New</span>' : ''}
              <span class="ct" style="margin-left:auto;color:var(--text-dim);font-size:.78rem">${relTime(m.created_at)}</span></div>
            <div style="color:var(--text-soft);font-size:.88rem;margin-top:3px">${esc(m.snippet)}</div>
          </div></div>`).join('')}</div>`;
  }

  // ================================================================
  //  VIEW: INSIGHTS
  // ================================================================
  async function renderInsights(root) {
    const ins = await data.insights();
    const f = ins.funnel;
    root.innerHTML = `
      <div class="grid three">
        <div class="card stat"><div class="l">Avg. booking value</div><div class="v">${money(ins.avgValue)}</div><div class="s">across completed visits</div></div>
        <div class="card stat"><div class="l">No-show / cancel rate</div><div class="v">${Math.round(ins.noShowRate * 100)}%</div><div class="s">${ins.noShow} no-shows · ${ins.cancelled} cancelled</div></div>
        <div class="card stat"><div class="l">Booking conversion</div><div class="v">${Math.round((f.submits / (f.sessions || 1)) * 100)}%</div><div class="s">of visitors enquire</div></div>
      </div>
      <div class="grid two" style="margin-top:16px">
        <div class="card card--pad"><div class="section-head" style="margin:0 0 14px"><h2>Service leaderboard</h2><span class="hint">by estimated value</span></div>
          ${barList(ins.leaderboard.map((s) => ({ label: s.name, v: s.value })), { fmt: money })}</div>
        <div class="card card--pad"><div class="section-head" style="margin:0 0 14px"><h2>Busiest days</h2></div>
          ${barList(ins.busiest.map((d) => ({ label: d.day, v: d.v })), { alt: true })}</div>
      </div>
      <div class="card card--pad" style="margin-top:16px">
        <div class="section-head" style="margin:0 0 16px"><h2>Booking funnel</h2><span class="hint">last 30 days</span></div>
        <div class="grid three">
          <div class="stat"><div class="l">Website visitors</div><div class="v">${f.sessions.toLocaleString()}</div><div class="s">100%</div></div>
          <div class="stat"><div class="l">Viewed booking page</div><div class="v">${f.bookViews.toLocaleString()}</div><div class="s">${Math.round((f.bookViews / (f.sessions || 1)) * 100)}% of visitors</div></div>
          <div class="stat"><div class="l">Sent an enquiry</div><div class="v">${f.submits.toLocaleString()}</div><div class="s">${Math.round((f.submits / (f.bookViews || 1)) * 100)}% of book-page views</div></div>
        </div>
      </div>`;
  }

  // ================================================================
  //  VIEW: REVIEWS
  // ================================================================
  async function renderReviews(root) {
    const reviews = await data.reviews();
    const avg = (reviews.reduce((a, r) => a + r.rating, 0) / (reviews.length || 1));
    const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
    const srcIcon = (s) => s === 'Instagram' ? 'fa-brands fa-instagram' : s === 'Google' ? 'fa-brands fa-google' : 'fa-solid fa-star';
    root.innerHTML = `
      <div class="grid three">
        <div class="card stat"><div class="l">Average rating</div><div class="v">${avg.toFixed(1)} <span class="stars" style="font-size:1.1rem">${stars(avg)}</span></div><div class="s">${reviews.length} reviews</div></div>
        <div class="card stat"><div class="l">5-star reviews</div><div class="v">${reviews.filter((r) => r.rating === 5).length}</div><div class="s">${Math.round(reviews.filter((r) => r.rating === 5).length / (reviews.length || 1) * 100)}% of total</div></div>
        <div class="card" style="display:flex;flex-direction:column;justify-content:center;gap:10px">
          <div class="l" style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-soft)">Grow your reputation</div>
          <button class="btn"><i class="fa-solid fa-star"></i> Send review request</button>
          <span class="s" style="color:var(--text-dim);font-size:.8rem">Auto-texts completed clients a Google review link.</span></div>
      </div>
      <div class="section-head"><h2>Recent reviews</h2></div>
      <div class="card">${reviews.map((r) => `<div class="review">
        <div class="rh"><b>${esc(r.author)}</b><span class="stars">${stars(r.rating)}</span>
          <span class="src"><i class="${srcIcon(r.source)}"></i> ${esc(r.source)}</span>
          <span class="ct" style="color:var(--text-dim);font-size:.78rem;margin-left:8px">${relTime(r.created_at)}</span></div>
        <p>${esc(r.text)}</p></div>`).join('')}</div>`;
  }

  // ================================================================
  //  VIEW: SETTINGS
  // ================================================================
  async function renderSettings(root) {
    const o = await data.overview();
    root.innerHTML = `
      <div class="grid two">
        <div class="card card--pad"><div class="section-head" style="margin:0 0 10px"><h2>Business profile</h2></div>
          <div class="set-row"><span class="k">Business name</span><span class="v">${esc(biz.name)}</span></div>
          <div class="set-row"><span class="k">Owner</span><span class="v">${esc(biz.ownerName)}</span></div>
          <div class="set-row"><span class="k">Email</span><span class="v">${esc(biz.ownerEmail)}</span></div>
          <div class="set-row"><span class="k">Location</span><span class="v">${esc(biz.location)}</span></div>
          <div class="set-row"><span class="k">Website</span><span class="v">${esc(biz.website)}</span></div>
          <div class="set-row"><span class="k">Instagram</span><span class="v">${esc(biz.instagram)}</span></div>
        </div>
        <div class="card card--pad"><div class="section-head" style="margin:0 0 10px"><h2>Services & pricing</h2><span class="hint">drives value estimates</span></div>
          <div class="price-list">${cfg.services.map((s) => `<div class="pr"><span>${esc(s.name)}</span><b>${money(s.price)}</b></div>`).join('')}</div>
        </div>
      </div>
      <div class="grid two" style="margin-top:16px">
        <div class="card card--pad"><div class="section-head" style="margin:0 0 10px"><h2>Your plan</h2></div>
          <div class="set-row"><span class="k">Plan</span><span class="v">${esc(cfg.plan.name)}</span></div>
          <div class="set-row"><span class="k">Price</span><span class="v">${money(cfg.plan.price)}/${cfg.plan.interval}</span></div>
          <div class="set-row"><span class="k">Value generated (30d)</span><span class="v" style="color:var(--gold)">${money(o.valueFromWebsite)}</span></div>
          <div class="set-row"><span class="k">Return on plan</span><span class="v" style="color:var(--c-completed)">${(o.valueFromWebsite / cfg.plan.price).toFixed(1)}× your fee</span></div>
          <div class="set-row" style="border:none"><span class="k">Contract</span><span class="v">None · cancel anytime</span></div>
        </div>
        <div class="card card--pad"><div class="section-head" style="margin:0 0 10px"><h2>How value is estimated</h2></div>
          <p style="color:var(--text-soft);font-size:.9rem;line-height:1.7">${esc(cfg.valueMethodology)}</p>
          <div style="margin-top:14px;padding:14px;background:var(--bg-2);border:1px solid var(--line);border-radius:12px;font-size:.86rem;color:var(--text-dim)">
            <i class="fa-solid fa-shield-halved" style="color:var(--gold)"></i> First-party analytics — no cookies, no third-party trackers. Your visitor data never leaves your dashboard.</div>
        </div>
      </div>`;
  }

  // ================================================================
  //  ROUTER + BOOT
  // ================================================================
  const RENDER = { overview: renderOverview, bookings: renderBookings, clients: renderClients, messages: renderMessages, insights: renderInsights, reviews: renderReviews, settings: renderSettings };
  const TITLES = {
    overview: ['Overview', cfg.overviewSub || 'Website & booking insights'], bookings: [ENT.plural, cfg.entitySub || 'Requests & appointment pipeline'],
    clients: ['Clients', 'Your customer CRM'], messages: ['Messages', 'Enquiries across every channel'],
    insights: ['Insights', `What drives your ${ENT.plural.toLowerCase()}`], reviews: ['Reviews', 'Reputation at a glance'], settings: ['Settings', 'Business profile & plan']
  };
  const rendered = {};
  async function go(tab) {
    document.querySelectorAll('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== tab));
    $('#tbTitle').childNodes[0].nodeValue = TITLES[tab][0]; $('#tbSub').textContent = TITLES[tab][1];
    const root = $(`.view[data-view="${tab}"]`);
    if (!rendered[tab] || tab === 'bookings') { await RENDER[tab](root); rendered[tab] = true; }
    $('#sidebar').classList.remove('show'); $('#scrim').classList.remove('show');
    window.scrollTo(0, 0);
  }

  function applyBranding() {
    const dash = biz.dashLabel || 'Owner Dashboard';
    $('#loginMark').textContent = biz.initials; $('#brandMark').textContent = biz.initials;
    $('#loginName').textContent = biz.name;
    $('#brandName').innerHTML = `${esc(biz.name)}<small>${esc(dash)}</small>`;
    if (cfg.plan) { $('#planAmt').innerHTML = `${money(cfg.plan.price)}<span>/${cfg.plan.interval}</span>`; }
    else { const pc = document.getElementById('planCard'); if (pc) pc.style.display = 'none'; }
    $('#ownerAv').textContent = (biz.ownerName || 'O')[0]; $('#ownerWho').innerHTML = `${esc(biz.ownerName || 'Owner')}<small>Owner</small>`;
    document.title = `${biz.name} — ${dash}`;
  }

  function refreshBadges() {
    data.bookings().then((b) => { const n = $('#navBookings'); if (n) n.textContent = b.filter((x) => x.status === 'new').length; }).catch(() => {});
    data.messages().then((m) => { const n = $('#navMessages'); if (n) n.textContent = m.filter((x) => x.unread).length; }).catch(() => {});
  }

  function boot() {
    applyBranding();
    if (data.mode === 'live') { const h = $('#loginHint'); if (h) h.innerHTML = '<i class="fa-solid fa-lock"></i> Enter your access key to view your live data.'; }
    else refreshBadges();

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (data.mode === 'live') { sessionStorage.setItem('apx_token', $('#loginEmail').value.trim()); if (CRM.reload) CRM.reload(); }
      $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
      try { await go('overview'); refreshBadges(); }
      catch (err) {
        $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
        const h = $('#loginHint'); if (h) h.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--c-noshow)"></i> ' + ((err && err.status === 401) ? 'Wrong access key — try again.' : 'Could not load data — check your connection.');
      }
    });
    $('#sideNav').addEventListener('click', (e) => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); go(a.dataset.tab); });
    $('#menuToggle').addEventListener('click', () => { $('#sidebar').classList.toggle('show'); $('#scrim').classList.toggle('show'); });
    $('#scrim').addEventListener('click', () => { closeDrawer(); $('#sidebar').classList.remove('show'); $('#scrim').classList.remove('show'); });
    $('#globalSearch').addEventListener('input', (e) => { bk.q = e.target.value; bk.status = 'all'; go('bookings'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); $('#splash').classList.remove('show'); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
