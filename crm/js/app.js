/* ============================================================
   APEX CRM — application layer
   Renders every view from CRM.data. No framework, no build step.
   ============================================================ */
(function () {
  const cfg = CRM.config, data = CRM.data, biz = cfg.business;
  const $ = (s, r = document) => r.querySelector(s);
  const money = data.money;
  const ENT = cfg.entity || { plural: 'Bookings', singular: 'Booking' };
  const FEAT = Object.assign({ calendar: true, splash: true, preferred: true }, cfg.features || {});
  const PREF_LABEL = cfg.preferredLabel || 'Preferred date';
  const RECUR = new Map((cfg.services || []).map((s) => [s.name, s.recurring !== false]));
  const monthlyOf = (services) => (services || []).reduce((a, s) => a + (RECUR.get(s.name) === false ? 0 : (Number(s.price) || 0)), 0);
  const oneTimeOf = (services) => (services || []).reduce((a, s) => a + (RECUR.get(s.name) === false ? (Number(s.price) || 0) : 0), 0);

  // ---- helpers ---------------------------------------------------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const initials = (n) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const telDigits = (p) => (p || '').replace(/\D/g, '');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const fmtPref = (b) => { const d = b.preferred_date ? fmtDate(b.preferred_date) : ''; const t = b.preferred_time || ''; return [d, t].filter(Boolean).join(' · ') || '—'; };
  const fmtDateTime = (iso) => { const d = new Date(iso); let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h}:${String(m).padStart(2, '0')} ${ap}`; };
  const relTime = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; };
  const DEFAULT_STATUSES = [
    { key: 'new', label: 'New', kind: 'new' },
    { key: 'confirmed', label: 'Confirmed', kind: 'active' },
    { key: 'completed', label: 'Completed', kind: 'success' },
    { key: 'cancelled', label: 'Cancelled', kind: 'neutral' },
    { key: 'noshow', label: 'No-show', kind: 'danger' }
  ];
  const STATUSES = cfg.statuses || DEFAULT_STATUSES;
  const STATUS = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));
  const STATUS_KIND = Object.fromEntries(STATUSES.map((s) => [s.key, s.kind]));
  const SRC = {
    website: { i: 'fa-solid fa-globe', l: 'Website form' },
    instagram: { i: 'fa-brands fa-instagram', l: 'Instagram' },
    whatsapp: { i: 'fa-brands fa-whatsapp', l: 'WhatsApp' },
    walkin: { i: 'fa-solid fa-person-walking', l: 'Walk-in' },
    phone: { i: 'fa-solid fa-phone', l: 'Phone' },
    manual: { i: 'fa-solid fa-user-plus', l: 'Added manually' }
  };
  const CH = { whatsapp: 'fa-brands fa-whatsapp', instagram: 'fa-brands fa-instagram', email: 'fa-solid fa-envelope' };
  const pillOf = (s) => `<span class="pill pill--${STATUS_KIND[s] || 'neutral'}">${STATUS[s] || s}</span>`;
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
    const REV = cfg.subscription ? await data.revenue() : null;

    // real deltas
    const last7 = series.slice(-7).reduce((a, x) => a + x.visitors, 0);
    const prev7 = series.slice(-14, -7).reduce((a, x) => a + x.visitors, 0);
    const bk7 = bookings.filter((b) => Date.now() - new Date(b.created_at) < 7 * 864e5).length;
    const bkPrev7 = bookings.filter((b) => { const t = Date.now() - new Date(b.created_at); return t >= 7 * 864e5 && t < 14 * 864e5; }).length;
    const roi = cfg.plan ? (o.valueFromWebsite / cfg.plan.price) : 0;
    const heroDesc = cfg.hero
      ? `${money(o.valueFromWebsite)} in new monthly enquiries${o.pipelineOneTime ? ` <b style="color:var(--gold)">+ ${money(o.pipelineOneTime)} one-time setup</b>` : ''} — warm leads, not signed revenue.`
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
        ${REV ? `<div class="card kpi value-hero">
          <div class="top"><div class="lbl">Monthly recurring revenue</div>
            <div class="ic"><i class="fa-solid fa-arrows-rotate"></i></div></div>
          <div class="val">${money(REV.mrr)}</div>
          <div class="desc">${REV.activeCount} active subscription${REV.activeCount !== 1 ? 's' : ''} · <b style="color:var(--gold)">${money(REV.arr)}</b> ARR${REV.churnedCount ? ` · ${REV.churnedCount} churned` : ''}</div>
        </div>` : ''}
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
          <div class="section-head" style="margin:0 0 12px"><h2>Pipeline by service</h2><span class="hint">open leads · recurring</span></div>
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
  const cl = { tag: 'all', sort: 'recent', due: false, q: '' };
  let ALL_CONTACTS = [];

  async function renderBookings(root) {
    ALL_BOOKINGS = await data.bookings();
    if (!FEAT.calendar) bk.view = 'list';
    const counts = ALL_BOOKINGS.reduce((a, b) => (a[b.status] = (a[b.status] || 0) + 1, a), {});
    root.innerHTML = `
      <div class="grid pipeline" style="--pipe-cols:${STATUSES.length}">
        ${STATUSES.map((s) => `
          <div class="pipe pipe--${s.kind}" data-status="${s.key}"><div class="n">${counts[s.key] || 0}</div><div class="l">${esc(s.label)}</div></div>`).join('')}
      </div>
      <div class="toolbar">
        <select class="select" id="bkStatus">
          <option value="all">All statuses</option>
          ${STATUSES.map((s) => `<option value="${s.key}">${esc(s.label)}</option>`).join('')}
        </select>
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
        <button class="btn btn--sm" id="addLead"><i class="fa-solid fa-plus"></i> Add ${esc(ENT.singular)}</button>
      </div>
      <div class="card" id="bkBody"></div>`;

    $('#addLead', root).addEventListener('click', () => openLeadForm({ isClient: false }));

    $('#bkStatus', root).value = bk.status; $('#bkStatus', root).addEventListener('change', (e) => { bk.status = e.target.value; drawBk(); });
    root.querySelectorAll('.pipe[data-status]').forEach((c) => c.addEventListener('click', () => { bk.status = c.dataset.status; $('#bkStatus', root).value = bk.status; drawBk(); }));
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
      const cols = FEAT.preferred ? 7 : 6;
      body.innerHTML = `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Client</th><th>Services</th><th>Est. value</th><th>Received</th>${FEAT.preferred ? `<th>${esc(PREF_LABEL)}</th>` : ''}<th>Source</th><th>Status</th></tr></thead>
        <tbody>${list.map((b) => `<tr data-id="${b.id}">
          <td><div class="who"><div class="av">${initials(b.name)}</div><div><div class="nm">${esc(b.name)}</div><div class="sub">${esc(b.phone || b.email || '')}</div></div></div></td>
          <td>${b.services.map((s) => esc(s.name)).join(', ')}</td>
          <td><span class="est">${money(cfg.subscription ? monthlyOf(b.services) : b.est)}${cfg.subscription ? '<span style="font-size:.68rem;color:var(--text-dim);font-family:var(--font-body)">/mo</span>' : ''}</span>${cfg.subscription && oneTimeOf(b.services) ? `<div class="muted" style="font-size:.7rem;margin-top:2px">+ ${money(oneTimeOf(b.services))} setup</div>` : ''}</td>
          <td class="muted">${relTime(b.created_at)}</td>
          ${FEAT.preferred ? `<td class="muted">${fmtPref(b)}</td>` : ''}
          <td><span class="src"><i class="${(SRC[b.source] || SRC.website).i}"></i> ${(SRC[b.source] || SRC.website).l}</span></td>
          <td>${pillOf(b.status)}${b.is_client ? ' <i class="fa-solid fa-user-check" title="Confirmed client" style="color:var(--gold);margin-left:6px"></i>' : ''}</td>
        </tr>`).join('') || `<tr><td colspan="${cols}" class="muted" style="text-align:center;padding:30px">No ${ENT.plural.toLowerCase()} match.</td></tr>`}</tbody>
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
        <div class="dv-name">${cfg.subscription
          ? `${money(monthlyOf(b.services))}<span style="font-size:.9rem;color:var(--text-soft)">/mo${oneTimeOf(b.services) ? ` + ${money(oneTimeOf(b.services))} setup` : ''}</span>`
          : `${money(b.est)} <span style="font-size:.9rem;color:var(--text-soft)">estimated</span>`}</div>
        <div style="margin:10px 0 18px">${pillOf(b.status)} <span class="src" style="margin-left:8px"><i class="${SRC[b.source].i}"></i> ${SRC[b.source].l}</span></div>
        <div class="dv-row"><div class="k">Services</div><div class="v"><div class="dv-svc">${b.services.map((s) => `<span>${esc(s.name)} · ${money(s.price)}</span>`).join('')}</div></div></div>
        ${FEAT.preferred ? `<div class="dv-row"><div class="k">${esc(PREF_LABEL)}</div><div class="v">${fmtPref(b)}</div></div>` : ''}
        <div class="dv-row"><div class="k">Phone</div><div class="v">${esc(b.phone || '—')}</div></div>
        <div class="dv-row"><div class="k">Email</div><div class="v">${esc(b.email || '—')}</div></div>
        <div class="dv-row"><div class="k">Requested</div><div class="v">${fmtDateTime(b.created_at)}</div></div>
        ${b.notes ? `<div class="dv-row"><div class="k">Notes</div><div class="v">${esc(b.notes)}</div></div>` : ''}
        <div style="margin-top:20px"><div class="k" style="color:var(--text-dim);font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Update status</div>
          <div class="status-set" id="statusSet">${STATUSES.map((s) => `<button data-s="${s.key}" class="${b.status === s.key ? 'on' : ''}">${esc(s.label)}</button>`).join('')}</div></div>
        <label class="chk" style="margin-top:16px;width:100%;justify-content:flex-start"><input type="checkbox" id="clientChk" ${b.is_client ? 'checked' : ''} /> <span>Client confirmed <span style="color:var(--text-dim);font-weight:400">— shows in Clients</span></span></label>
        ${(cfg.subscription && b.is_client) ? `<div style="margin-top:18px"><div class="k" style="color:var(--text-dim);font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Subscription <span style="color:var(--gold)">· ${money(monthlyOf(b.services))}/mo${oneTimeOf(b.services) ? ` + ${money(oneTimeOf(b.services))} setup` : ''}</span></div>
          <div class="status-set" id="subSet">
            <button data-sub="active" class="${b.subscription !== 'cancelled' ? 'on' : ''}">Active</button>
            <button data-sub="cancelled" class="${b.subscription === 'cancelled' ? 'on' : ''}">Cancelled</button>
          </div></div>` : ''}
      </div>
      <div class="dv-actions">
        ${FEAT.splash ? `<button class="btn" id="startAppt"><i class="fa-solid fa-tv"></i> Start Appointment (welcome screen)</button>` : ''}
        <div class="dv-contact">
          ${b.email ? `<a class="btn btn--dark" href="mailto:${esc(b.email)}"><i class="fa-solid fa-envelope"></i> Email</a>` : ''}
          ${b.phone ? `<a class="btn btn--dark" href="tel:${esc(b.phone)}"><i class="fa-solid fa-phone"></i> Call</a>` : ''}
          ${b.phone ? `<button class="btn btn--dark" id="msgToggle"><i class="fa-solid fa-comment-dots"></i> Message <i class="fa-solid fa-chevron-down" style="font-size:.68rem;opacity:.7"></i></button>` : ''}
        </div>
        ${b.phone ? `<div class="msg-choose hidden" id="msgChoose">
          <a class="btn btn--dark" href="https://wa.me/${telDigits(b.phone)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
          <a class="btn btn--dark" href="sms:${esc(b.phone)}"><i class="fa-solid fa-message"></i> Text (SMS)</a>
        </div>` : ''}
        ${(!b.email && !b.phone) ? `<span class="muted" style="text-align:center">No contact details on this lead</span>` : ''}
      </div>`;
    drawer.classList.add('show'); $('#scrim').classList.add('show');
    $('#drawerX').addEventListener('click', closeDrawer);
    const startBtn = $('#startAppt'); if (startBtn) startBtn.addEventListener('click', () => showSplash(b));
    const msgToggle = $('#msgToggle'); if (msgToggle) msgToggle.addEventListener('click', () => $('#msgChoose').classList.toggle('hidden'));
    const clientChk = $('#clientChk'); if (clientChk) clientChk.addEventListener('change', async (e) => {
      await data.setClient(id, e.target.checked);
      const lv = $('.view[data-view="bookings"]'); if (lv && !lv.classList.contains('hidden')) renderBookings(lv);
      const cv = $('.view[data-view="clients"]'); if (cv && !cv.classList.contains('hidden')) renderClients(cv);
    });
    const subSet = $('#subSet'); if (subSet) subSet.addEventListener('click', async (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      await data.setSubscription(id, btn.dataset.sub);
      subSet.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
      const cv = $('.view[data-view="clients"]'); if (cv && !cv.classList.contains('hidden')) renderClients(cv);
      const iv = $('.view[data-view="insights"]'); if (iv && !iv.classList.contains('hidden')) renderInsights(iv);
    });
    $('#statusSet').addEventListener('click', async (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      await data.setStatus(id, btn.dataset.s);
      $('#statusSet').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
      const view = $('.view[data-view="bookings"]'); if (!view.classList.contains('hidden')) renderBookings(view);
    });
  }
  function closeDrawer() { $('#drawer').classList.remove('show'); $('#scrim').classList.remove('show'); }

  // ---- manual add form (leads & clients) -------------------------
  function openLeadForm(opts) {
    const isClient = !!(opts && opts.isClient);
    const title = isClient ? 'Add Client' : 'Add ' + ENT.singular;
    const wrap = document.createElement('div');
    wrap.className = 'modal show';
    wrap.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="x" data-close><i class="fa-solid fa-xmark"></i></button></div>
        <form class="modal-body" id="leadForm" novalidate>
          <div class="mf"><label>Name <span class="req">*</span></label><input class="field-input" name="name" required placeholder="Full name" /></div>
          <div class="mf-row">
            <div class="mf"><label>Email</label><input class="field-input" name="email" type="email" placeholder="name@email.com" /></div>
            <div class="mf"><label>Phone / WhatsApp</label><input class="field-input" name="phone" type="tel" placeholder="+1 (555) 000-0000" /></div>
          </div>
          <div class="mf"><label>Interested in <span style="color:var(--text-dim);font-weight:400;text-transform:none;letter-spacing:0">(sets the estimated value)</span></label>
            <div class="chip-select">${cfg.services.map((s) => `<label class="chip-opt"><input type="checkbox" name="svc" value="${esc(s.name)}" data-price="${s.price}" /><span>${esc(s.name)} · ${money(s.price)}</span></label>`).join('')}</div>
          </div>
          <div class="mf"><label>Notes</label><textarea class="field-input" name="notes" rows="2" placeholder="Cold call, referral, context…"></textarea></div>
          <div class="modal-foot">
            <button type="button" class="btn btn--dark" data-close>Cancel</button>
            <button type="submit" class="btn"><i class="fa-solid fa-plus"></i> ${esc(title)}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    setTimeout(() => wrap.querySelector('input[name="name"]').focus(), 30);
    wrap.querySelector('#leadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const el = e.target.elements;
      const nm = el['name'].value.trim();
      if (!nm) { el['name'].style.borderColor = 'var(--c-noshow)'; return; }
      const services = [...e.target.querySelectorAll('input[name="svc"]:checked')].map((c) => ({ name: c.value, price: Number(c.dataset.price) || 0 }));
      const payload = { name: nm, email: el['email'].value.trim(), phone: el['phone'].value.trim(), services, est_value: services.reduce((a, s) => a + s.price, 0), notes: el['notes'].value.trim(), source: 'manual', is_client: isClient };
      const sub = e.target.querySelector('button[type="submit"]'); sub.disabled = true; sub.innerHTML = 'Saving…';
      await data.createLead(payload);
      close();
      const lv = $('.view[data-view="bookings"]'); if (lv && !lv.classList.contains('hidden')) renderBookings(lv);
      const cv = $('.view[data-view="clients"]'); if (cv && !cv.classList.contains('hidden')) renderClients(cv);
      refreshBadges();
    });
  }

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
    ALL_CONTACTS = await data.contacts();
    ALL_BOOKINGS = await data.bookings();   // so client rows can open the drawer
    const due = ALL_CONTACTS.filter((c) => c.dueForRebook);
    root.innerHTML = `
      ${due.length ? `<div class="radar">
        <div class="ic"><i class="fa-solid fa-arrows-rotate"></i></div>
        <div class="tx"><b>${due.length} client${due.length > 1 ? 's' : ''} due for a rebook</b>
          <p>They completed a visit ${biz.rebookCycleDays}+ days ago and haven't been back. A quick nudge fills next week's chairs.</p></div>
        <button class="btn btn--sm"><i class="fa-solid fa-paper-plane"></i> Message all</button>
      </div>` : ''}
      <div class="toolbar">
        <label class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="clSearch" placeholder="Search clients…" value="${esc(cl.q)}" /></label>
        <select class="select" id="clTag">
          <option value="all">All clients</option>
          <option value="Regular">Regulars</option>
          <option value="Returning">Returning</option>
          <option value="New">New</option>
        </select>
        <select class="select" id="clSort">
          <option value="recent">Recent visit</option>
          <option value="ltv">Highest value</option>
          <option value="visits">Most visits</option>
          <option value="name">Name (A–Z)</option>
        </select>
        <label class="chk"><input type="checkbox" id="clDue" /> Due for rebook</label>
        <span class="muted" id="clCount" style="margin-left:auto"></span>
        <button class="btn btn--sm" id="addClient"><i class="fa-solid fa-plus"></i> Add Client</button>
      </div>
      <div class="card" id="clBody"></div>`;

    const draw = () => {
      let list = ALL_CONTACTS.slice();
      if (cl.tag !== 'all') list = list.filter((c) => c.tag === cl.tag);
      if (cl.due) list = list.filter((c) => c.dueForRebook);
      if (cl.q) { const q = cl.q.toLowerCase(); list = list.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q)); }
      if (cl.sort === 'ltv') list.sort((a, b) => cfg.subscription ? (b.monthly - a.monthly) : (b.ltv - a.ltv));
      else if (cl.sort === 'visits') list.sort((a, b) => b.visits - a.visits);
      else if (cl.sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      else list.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
      $('#clCount', root).textContent = `${list.length} client${list.length !== 1 ? 's' : ''}`;
      const table = cfg.subscription
        ? `<thead><tr><th>Client</th><th>Monthly</th><th>Plan</th><th>Client since</th><th>Subscription</th></tr></thead>
           <tbody>${list.map((c) => `<tr data-id="${c.clientId}">
             <td><div class="who"><div class="av">${initials(c.name)}</div><div><div class="nm">${esc(c.name)}</div><div class="sub">${esc(c.email || c.phone || '')}</div></div></div></td>
             <td><span class="est">${money(c.monthly)}<span style="color:var(--text-dim);font-size:.8rem">/mo</span></span></td>
             <td class="muted">${esc(c.favourite)}</td>
             <td class="muted">${fmtDate(c.first_seen)}</td>
             <td>${c.active ? '<span class="pill pill--success">Active</span>' : '<span class="pill pill--neutral">Cancelled</span>'}</td>
           </tr>`).join('') || `<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">No clients match.</td></tr>`}</tbody>`
        : `<thead><tr><th>Client</th><th>Visits</th><th>Lifetime value</th><th>Favourite</th><th>Last visit</th><th>Status</th></tr></thead>
           <tbody>${list.map((c) => `<tr data-id="${c.clientId}">
             <td><div class="who"><div class="av">${initials(c.name)}</div><div><div class="nm">${esc(c.name)}</div><div class="sub">${esc(c.phone || c.email || '')}</div></div></div></td>
             <td>${c.visits}</td>
             <td><span class="est">${money(c.ltv)}</span></td>
             <td class="muted">${esc(c.favourite)}</td>
             <td class="muted">${c.sinceLast === 0 ? 'Today' : c.sinceLast + 'd ago'}${c.dueForRebook ? ' <i class="fa-solid fa-circle" style="color:var(--gold);font-size:.5rem;vertical-align:middle"></i>' : ''}</td>
             <td><span class="tag ${c.tag === 'Regular' ? 'reg' : c.tag === 'Returning' ? 'ret' : ''}">${esc(c.tag)}</span></td>
           </tr>`).join('') || `<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">No clients match.</td></tr>`}</tbody>`;
      const cbody = $('#clBody', root);
      cbody.innerHTML = `<div class="tbl-wrap"><table class="tbl">${table}</table></div>`;
      cbody.querySelectorAll('tbody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openDrawer(+tr.dataset.id)));
    };

    $('#clSearch', root).addEventListener('input', (e) => { cl.q = e.target.value; draw(); });
    $('#clTag', root).value = cl.tag; $('#clTag', root).addEventListener('change', (e) => { cl.tag = e.target.value; draw(); });
    $('#clSort', root).value = cl.sort; $('#clSort', root).addEventListener('change', (e) => { cl.sort = e.target.value; draw(); });
    $('#clDue', root).checked = cl.due; $('#clDue', root).addEventListener('change', (e) => { cl.due = e.target.checked; draw(); });
    $('#addClient', root).addEventListener('click', () => openLeadForm({ isClient: true }));
    draw();
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
    const per = `<span style="font-size:1rem;color:var(--text-soft)">/mo</span>`;

    let top, rev = null;
    if (cfg.subscription) {
      rev = await data.revenue();
      top = `
      <div class="grid three">
        <div class="card stat" style="border-color:var(--line-gold)"><div class="l">Monthly recurring revenue</div><div class="v">${money(rev.mrr)}${per}</div><div class="s">${rev.activeCount} active · recurring only</div></div>
        <div class="card stat"><div class="l">Annual recurring revenue</div><div class="v">${money(rev.arr)}</div><div class="s">MRR × 12</div></div>
        <div class="card stat"><div class="l">Total this year · ${new Date().getFullYear()}</div><div class="v">${money(rev.ytd)}</div><div class="s">recurring + ${money(rev.oneTimeYtd)} one-time</div></div>
      </div>
      <div class="grid three" style="margin-top:16px">
        <div class="card stat"><div class="l">Active subscriptions</div><div class="v">${rev.activeCount}</div><div class="s">paying clients</div></div>
        <div class="card stat"><div class="l">Churned</div><div class="v">${rev.churnedCount}</div><div class="s">unsubscribed</div></div>
        <div class="card stat"><div class="l">One-time this year</div><div class="v">${money(rev.oneTimeYtd)}</div><div class="s">setup fees (not in MRR)</div></div>
      </div>`;
    } else {
      top = `
      <div class="grid three">
        <div class="card stat"><div class="l">Avg. booking value</div><div class="v">${money(ins.avgValue)}</div><div class="s">across completed visits</div></div>
        <div class="card stat"><div class="l">No-show / cancel rate</div><div class="v">${Math.round(ins.noShowRate * 100)}%</div><div class="s">${ins.noShow} no-shows · ${ins.cancelled} cancelled</div></div>
        <div class="card stat"><div class="l">Enquiry rate</div><div class="v">${Math.round((f.submits / (f.sessions || 1)) * 100)}%</div><div class="s">of visitors enquire</div></div>
      </div>`;
    }

    const funnel = cfg.subscription ? '' : `
      <div class="card card--pad" style="margin-top:16px">
        <div class="section-head" style="margin:0 0 16px"><h2>Enquiry funnel</h2><span class="hint">last 30 days</span></div>
        <div class="grid three">
          <div class="stat"><div class="l">Website visitors</div><div class="v">${f.sessions.toLocaleString()}</div><div class="s">100%</div></div>
          <div class="stat"><div class="l">Started the form</div><div class="v">${f.started.toLocaleString()}</div><div class="s">${Math.round((f.started / (f.sessions || 1)) * 100)}% of visitors</div></div>
          <div class="stat"><div class="l">Sent an enquiry</div><div class="v">${f.submits.toLocaleString()}</div><div class="s">${f.started ? Math.round((f.submits / f.started) * 100) + '% of those' : '—'}</div></div>
        </div>
      </div>`;

    root.innerHTML = `
      ${top}
      <div class="grid two" style="margin-top:16px">
        <div class="card card--pad"><div class="section-head" style="margin:0 0 14px"><h2>${cfg.subscription ? 'MRR by service' : 'Service leaderboard'}</h2><span class="hint">${cfg.subscription ? 'recurring, active clients only' : 'by estimated value'}</span></div>
          ${barList((cfg.subscription && rev ? rev.revenueByService : ins.leaderboard).map((s) => ({ label: s.name, v: s.value })), { fmt: money })}</div>
        <div class="card card--pad"><div class="section-head" style="margin:0 0 14px"><h2>${cfg.subscription ? 'New leads by day' : 'Busiest days'}</h2></div>
          ${barList(ins.busiest.map((d) => ({ label: d.day, v: d.v })), { alt: true })}</div>
      </div>
      ${funnel}`;
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
  // ================================================================
  //  VIEW: CALENDAR (native month schedule)
  // ================================================================
  let calMonth = null;
  async function renderCalendar(root) {
    ALL_BOOKINGS = await data.bookings();
    if (!calMonth) { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const monthName = calMonth.toLocaleString('default', { month: 'long' });
    const byDay = {};
    for (const b of ALL_BOOKINGS) {
      const ds = b.preferred_date || b.created_at;
      if (!ds) continue;
      const d = new Date(ds);
      if (d.getFullYear() === y && d.getMonth() === m) (byDay[d.getDate()] = byDay[d.getDate()] || []).push(b);
    }
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    let cells = '';
    for (let i = 0; i < first; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const evs = byDay[d] || [];
      const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
      cells += `<div class="cal-cell ${isToday ? 'today' : ''}"><div class="d">${d}</div>${evs.slice(0, 4).map((e) => `<div class="cal-ev pill--${STATUS_KIND[e.status] || 'neutral'}" data-id="${e.id}" title="${esc(e.name)} · ${esc(STATUS[e.status] || e.status)}">${esc(e.name.split(' ')[0])}</div>`).join('')}${evs.length > 4 ? `<div class="cal-more">+${evs.length - 4} more</div>` : ''}</div>`;
    }
    const monthTotal = Object.values(byDay).reduce((a, arr) => a + arr.length, 0);
    root.innerHTML = `
      <div class="toolbar" style="justify-content:space-between">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn btn--dark btn--sm" id="calPrev"><i class="fa-solid fa-chevron-left"></i></button>
          <h2 style="font-family:var(--font-display);color:var(--white);font-size:1.25rem;min-width:190px;text-align:center">${monthName} ${y}</h2>
          <button class="btn btn--dark btn--sm" id="calNext"><i class="fa-solid fa-chevron-right"></i></button>
          <span class="muted" style="font-size:.85rem">${monthTotal} this month</span>
        </div>
        <button class="btn btn--sm" id="calToday"><i class="fa-solid fa-calendar-day"></i> Today</button>
      </div>
      <div class="card card--pad"><div class="cal cal--full">
        <div class="cal-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
      </div></div>`;
    $('#calPrev', root).addEventListener('click', () => { calMonth = new Date(y, m - 1, 1); renderCalendar(root); });
    $('#calNext', root).addEventListener('click', () => { calMonth = new Date(y, m + 1, 1); renderCalendar(root); });
    $('#calToday', root).addEventListener('click', () => { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); renderCalendar(root); });
    root.querySelectorAll('.cal-ev[data-id]').forEach((el) => el.addEventListener('click', () => openDrawer(+el.dataset.id)));
  }

  const RENDER = { overview: renderOverview, bookings: renderBookings, clients: renderClients, calendar: renderCalendar, messages: renderMessages, insights: renderInsights, reviews: renderReviews, settings: renderSettings };
  const TITLES = {
    overview: ['Overview', cfg.overviewSub || 'Website & booking insights'], bookings: [ENT.plural, cfg.entitySub || 'Requests & appointment pipeline'],
    clients: ['Clients', 'Your customer CRM'], calendar: ['Calendar', 'Your schedule at a glance'], messages: ['Messages', 'Enquiries across every channel'],
    insights: ['Insights', `What drives your ${ENT.plural.toLowerCase()}`], reviews: ['Reviews', 'Reputation at a glance'], settings: ['Settings', 'Business profile & plan']
  };
  const rendered = {};
  async function go(tab) {
    document.querySelectorAll('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== tab));
    $('#tbTitle').childNodes[0].nodeValue = TITLES[tab][0]; $('#tbSub').textContent = TITLES[tab][1];
    const root = $(`.view[data-view="${tab}"]`);
    await RENDER[tab](root);   // always re-render so every tab reflects current data
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

  async function enterDashboard() {
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    try { await go('overview'); refreshBadges(); }
    catch (err) {
      $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
      if (data.mode === 'live') localStorage.removeItem('apx_token');
      const h = $('#loginHint'); if (h) h.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--c-noshow)"></i> ' + ((err && err.status === 401) ? 'Wrong access key — try again.' : 'Could not load data — check your connection.');
    }
  }
  function installSignOut() {
    if (data.mode !== 'live') return;
    const owner = document.querySelector('.side-owner');
    if (!owner || document.getElementById('signOut')) return;
    const btn = document.createElement('button');
    btn.id = 'signOut'; btn.className = 'sign-out'; btn.title = 'Sign out';
    btn.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i>';
    btn.addEventListener('click', () => { localStorage.removeItem('apx_token'); location.reload(); });
    owner.appendChild(btn);
  }

  function boot() {
    applyBranding();
    installSignOut();
    if (data.mode === 'live') {
      const h = $('#loginHint'); if (h) h.innerHTML = '<i class="fa-solid fa-lock"></i> Enter your access key to view your live data.';
      if (localStorage.getItem('apx_token')) enterDashboard();   // stay signed in across refreshes
    } else refreshBadges();

    $('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (data.mode === 'live') { localStorage.setItem('apx_token', $('#loginEmail').value.trim()); if (CRM.reload) CRM.reload(); }
      enterDashboard();
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
