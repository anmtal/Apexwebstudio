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
  let _toastTimer = null;
  function toast(html) {
    let t = document.getElementById('crmToast');
    if (!t) { t = document.createElement('div'); t.id = 'crmToast'; t.className = 'crm-toast'; document.body.appendChild(t); }
    t.innerHTML = html; t.classList.add('show');
    clearTimeout(_toastTimer); _toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
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
        <button class="btn btn--sm" id="addLead"><i class="fa-solid fa-plus"></i> Add ${esc(ENT.singular)}</button>
      </div>
      <div class="card" id="bkBody"></div>`;

    $('#addLead', root).addEventListener('click', () => openLeadForm({ isClient: false }));

    $('#bkStatus', root).value = bk.status; $('#bkStatus', root).addEventListener('change', (e) => { bk.status = e.target.value; drawBk(); });
    root.querySelectorAll('.pipe[data-status]').forEach((c) => c.addEventListener('click', () => { bk.status = c.dataset.status; $('#bkStatus', root).value = bk.status; drawBk(); }));
    $('#bkSource', root).value = bk.source; $('#bkSource', root).addEventListener('change', (e) => { bk.source = e.target.value; drawBk(); });
    $('#bkSort', root).value = bk.sort; $('#bkSort', root).addEventListener('change', (e) => { bk.sort = e.target.value; drawBk(); });
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
  let ALL_MSGS = [];
  let OWN_EMAILS_SET = new Set();
  const reSubj = (s) => (/^re:/i.test(s || '') ? s : 'Re: ' + (s || ''));
  const fwdSubj = (s) => (/^fwd?:/i.test(s || '') ? s : 'Fwd: ' + (s || ''));
  const splitAddrs = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const quoteOf = (m) => `\n\n\n----- Original message -----\nFrom: ${m.name}${m.address ? ' <' + m.address + '>' : ''}\nDate: ${fmtDateTime(m.created_at)}\nSubject: ${m.subject || ''}\n\n${m.body || m.snippet || ''}`;

  async function renderMessages(root) {
    const msgs = await data.messages();
    ALL_MSGS = msgs;
    const o = await data.overview();
    const conns = (data.emailConnections ? await data.emailConnections() : []).filter((c) => c.status !== 'disabled');
    OWN_EMAILS_SET = new Set(conns.map((c) => (c.email || '').toLowerCase()));
    const connStrip = conns.length
      ? conns.map((c) => `<span class="conn-chip ${c.status === 'error' ? 'err' : ''}"><i class="fa-solid fa-envelope"></i> ${esc(c.email)}<span class="cc-s">${c.status === 'error' ? 'needs attention' : 'connected'}</span><button class="cc-x" data-disc="${esc(String(c.id))}" title="Disconnect"><i class="fa-solid fa-xmark"></i></button></span>`).join('')
      : `<span class="muted" style="font-size:.85rem">No mailbox connected yet — pull your enquiries into one place.</span>`;
    root.innerHTML = `
      <div class="toolbar" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${connStrip}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn--dark btn--sm" id="msgRefresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
          <button class="btn btn--sm" id="msgConnect"><i class="fa-solid fa-envelope"></i> Connect email</button>
        </div>
      </div>
      <div class="grid three">
        <div class="card kpi"><div class="top"><div class="lbl">WhatsApp clicks</div><div class="ic"><i class="fa-brands fa-whatsapp"></i></div></div><div class="val">${o.waClicks}</div><div class="foot">last 30 days</div></div>
        <div class="card kpi"><div class="top"><div class="lbl">Instagram clicks</div><div class="ic"><i class="fa-brands fa-instagram"></i></div></div><div class="val">${o.igClicks}</div><div class="foot">last 30 days</div></div>
        <div class="card kpi"><div class="top"><div class="lbl">Unread</div><div class="ic"><i class="fa-solid fa-comment-dots"></i></div></div><div class="val">${msgs.filter((m) => m.unread).length}</div><div class="foot">need a reply</div></div>
      </div>
      <div class="section-head"><h2>Message log</h2><span class="hint">across email, WhatsApp & Instagram</span></div>
      <div class="card">${msgs.length ? msgs.map((m) => `
        <div class="msg-row ${m.unread ? 'unread' : ''}" data-open="${esc(String(m.id))}">
          <div class="av" style="width:36px;height:36px;border-radius:50%;background:var(--surface-3);color:var(--gold);display:grid;place-items:center;font-weight:600;flex:none">${initials(m.name)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:8px;align-items:center"><b style="color:var(--text)">${esc(m.direction === 'out' ? 'To: ' + (m.name || m.address) : m.name)}</b>
              <span class="src"><i class="${CH[m.channel] || CH.email}"></i></span>${m.direction === 'out' ? '<span class="tag" style="font-size:.66rem">Sent</span>' : ''}${m.unread ? '<span class="tag ret" style="font-size:.66rem">New</span>' : ''}
              <span class="ct" style="margin-left:auto;color:var(--text-dim);font-size:.78rem">${relTime(m.created_at)}</span>
              <i class="fa-solid fa-chevron-right" style="color:var(--text-dim);font-size:.7rem;opacity:.6"></i></div>
            ${m.subject ? `<div class="msg-subj">${esc(m.subject)}</div>` : ''}
            <div class="msg-snip">${esc(m.snippet)}</div>
          </div></div>`).join('') : `<div class="muted" style="padding:26px;text-align:center">No messages yet. Hit <b>Connect email</b> to bring your enquiries in.</div>`}</div>`;
    $('#msgConnect', root).addEventListener('click', () => openEmailConnect(root));
    $('#msgRefresh', root).addEventListener('click', async (e) => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> Refreshing…'; try { await data.syncEmail(); } catch (_) {} renderMessages(root); });
    root.querySelectorAll('[data-disc]').forEach((el) => el.addEventListener('click', (ev) => { ev.stopPropagation(); data.disconnectEmail(el.dataset.disc).then(() => renderMessages(root)); }));
    root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => openMessage(el.dataset.open, root)));
  }

  // ---- full-email reader (click a message) ----------------------
  function openMessage(id, root) {
    const m = ALL_MSGS.find((x) => String(x.id) === String(id)); if (!m) return;
    if (m.unread && data.markRead) data.markRead(m.id);   // mark read (optimistic + persisted)
    const wrap = document.createElement('div'); wrap.className = 'modal show';
    const bodyText = (m.body || m.snippet || '').trim();
    const canReply = m.channel === 'email' && m.address;
    wrap.innerHTML = `
      <div class="modal-card modal-card--wide">
        <div class="modal-head"><h3 style="font-size:1.05rem">${esc(m.subject || '(no subject)')}</h3><button class="x" data-close><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="mr-from">
            <div class="av" style="width:40px;height:40px;border-radius:50%;background:var(--surface-3);color:var(--gold);display:grid;place-items:center;font-weight:600;flex:none">${initials(m.name)}</div>
            <div style="min-width:0"><b style="color:var(--white)">${esc(m.name)}</b>${m.address ? ` <span class="muted" style="font-size:.82rem">&lt;${esc(m.address)}&gt;</span>` : ''}
              <div class="muted" style="font-size:.78rem">${fmtDateTime(m.created_at)}${m.direction === 'out' ? ' · Sent' : ''}</div></div>
          </div>
          ${m.toAddrs ? `<div class="mr-meta"><span>To</span> ${esc(m.toAddrs)}</div>` : ''}
          ${m.ccAddrs ? `<div class="mr-meta"><span>Cc</span> ${esc(m.ccAddrs)}</div>` : ''}
          <div class="mr-body">${esc(bodyText).replace(/\n/g, '<br>') || '<span class="muted">(no message body)</span>'}</div>
        </div>
        <div class="modal-foot" style="justify-content:flex-start;flex-wrap:wrap;gap:8px">
          ${canReply ? `<button class="btn" id="mrReply"><i class="fa-solid fa-reply"></i> Reply</button>
          <button class="btn btn--dark" id="mrReplyAll"><i class="fa-solid fa-reply-all"></i> Reply all</button>
          <button class="btn btn--dark" id="mrForward"><i class="fa-solid fa-share"></i> Forward</button>` : ''}
          <button class="btn btn--dark" data-close style="margin-left:auto">Close</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); renderMessages(root); };   // re-render clears the unread badge
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    const q = quoteOf(m);
    const rep = $('#mrReply', wrap); if (rep) rep.addEventListener('click', () => { wrap.remove(); openCompose({ to: m.address, subject: reSubj(m.subject), text: q, inReplyTo: m.externalId, name: m.name }, root); });
    const all = $('#mrReplyAll', wrap); if (all) all.addEventListener('click', () => {
      const cc = [...splitAddrs(m.toAddrs), ...splitAddrs(m.ccAddrs)]
        .filter((a) => !OWN_EMAILS_SET.has(a.toLowerCase()) && a.toLowerCase() !== (m.address || '').toLowerCase());
      wrap.remove(); openCompose({ to: m.address, cc: [...new Set(cc)].join(', '), subject: reSubj(m.subject), text: q, inReplyTo: m.externalId, name: m.name }, root);
    });
    const fwd = $('#mrForward', wrap); if (fwd) fwd.addEventListener('click', () => { wrap.remove(); openCompose({ to: '', subject: fwdSubj(m.subject), text: q, mode: 'forward' }, root); });
  }

  // ---- Connect a mailbox (IMAP/SMTP) ----------------------------
  function openEmailConnect(root) {
    const wrap = document.createElement('div'); wrap.className = 'modal show';
    wrap.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><h3>Connect email</h3><button class="x" data-close><i class="fa-solid fa-xmark"></i></button></div>
        <form class="modal-body" id="emailForm" novalidate>
          <p class="muted" style="font-size:.85rem;margin-top:-4px">Works with Gmail, iCloud, Zoho, Fastmail and any custom-domain mailbox. Use an <b>app password</b> (not your login password) — create one in your provider's security settings with 2-step verification on.</p>
          <div class="mf"><label>Email address <span class="req">*</span></label><input class="field-input" name="email" type="email" required placeholder="you@yourbusiness.com" /></div>
          <div class="mf"><label>App password <span class="req">*</span></label><input class="field-input" name="password" type="password" required placeholder="16-character app password" autocomplete="off" /></div>
          <details style="margin-top:2px"><summary class="muted" style="font-size:.82rem;cursor:pointer">Advanced — IMAP/SMTP server (auto-detected for common providers)</summary>
            <div class="mf-row" style="margin-top:10px">
              <div class="mf"><label>IMAP host</label><input class="field-input" name="imap_host" placeholder="imap.gmail.com" /></div>
              <div class="mf"><label>IMAP port</label><input class="field-input" name="imap_port" type="number" placeholder="993" /></div>
            </div>
            <div class="mf-row">
              <div class="mf"><label>SMTP host</label><input class="field-input" name="smtp_host" placeholder="smtp.gmail.com" /></div>
              <div class="mf"><label>SMTP port</label><input class="field-input" name="smtp_port" type="number" placeholder="465" /></div>
            </div>
          </details>
          <div class="muted" id="emailErr" style="font-size:.82rem;display:none"></div>
          <div class="modal-foot">
            <button type="button" class="btn btn--dark" data-close>Cancel</button>
            <button type="submit" class="btn"><i class="fa-solid fa-link"></i> Connect &amp; import</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    setTimeout(() => wrap.querySelector('input[name="email"]').focus(), 30);
    wrap.querySelector('#emailForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const el = e.target.elements;
      const email = el['email'].value.trim(), password = el['password'].value;
      if (!email || !password) { (email ? el['password'] : el['email']).style.borderColor = 'var(--c-noshow)'; return; }
      const payload = { email, password, imap_host: el['imap_host'].value.trim(), imap_port: el['imap_port'].value.trim(), smtp_host: el['smtp_host'].value.trim(), smtp_port: el['smtp_port'].value.trim() };
      const sub = e.target.querySelector('button[type="submit"]'); sub.disabled = true; sub.innerHTML = 'Connecting…';
      const err = wrap.querySelector('#emailErr'); err.style.display = 'none';
      try {
        const out = await data.connectEmail(payload);
        close();
        renderMessages(root);
        toast(`Connected ${esc(email)} — imported ${out.imported || 0} message${out.imported === 1 ? '' : 's'}.`);
      } catch (ex) {
        sub.disabled = false; sub.innerHTML = '<i class="fa-solid fa-link"></i> Connect &amp; import';
        err.style.display = 'block'; err.style.color = 'var(--c-noshow)';
        err.textContent = (ex.message || 'Could not connect.') + (ex.detail ? ' (' + ex.detail + ')' : '');
      }
    });
  }

  // ---- Compose / reply over the connected mailbox ---------------
  function openCompose(opts, root) {
    opts = opts || {};
    const title = opts.mode === 'forward' ? 'Forward message' : (opts.name ? 'Reply to ' + esc(opts.name) : 'New email');
    const wrap = document.createElement('div'); wrap.className = 'modal show';
    wrap.innerHTML = `
      <div class="modal-card modal-card--wide">
        <div class="modal-head"><h3>${title}</h3><button class="x" data-close><i class="fa-solid fa-xmark"></i></button></div>
        <form class="modal-body" id="composeForm" novalidate>
          <div class="mf"><label>To <span class="req">*</span></label><input class="field-input" name="to" type="email" required value="${esc(opts.to || '')}" placeholder="name@email.com" /></div>
          <div class="mf-row">
            <div class="mf"><label>Cc</label><input class="field-input" name="cc" value="${esc(opts.cc || '')}" placeholder="comma-separated" /></div>
            <div class="mf"><label>Bcc</label><input class="field-input" name="bcc" value="${esc(opts.bcc || '')}" placeholder="comma-separated" /></div>
          </div>
          <div class="mf"><label>Subject</label><input class="field-input" name="subject" value="${esc(opts.subject || '')}" placeholder="Subject" /></div>
          <div class="mf"><label>Message <span class="req">*</span></label><textarea class="field-input" name="text" rows="9" required placeholder="Write your message…">${esc(opts.text || '')}</textarea></div>
          <div class="muted" id="composeErr" style="font-size:.82rem;display:none"></div>
          <div class="modal-foot">
            <button type="button" class="btn btn--dark" data-close>Cancel</button>
            <button type="submit" class="btn"><i class="fa-solid fa-paper-plane"></i> Send</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    setTimeout(() => { const ta = wrap.querySelector('textarea[name="text"]'); ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0; }, 30);
    wrap.querySelector('#composeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const el = e.target.elements;
      const to = el['to'].value.trim(), text = el['text'].value.trim();
      if (!to || !text) { (to ? el['text'] : el['to']).style.borderColor = 'var(--c-noshow)'; return; }
      const sub = e.target.querySelector('button[type="submit"]'); sub.disabled = true; sub.innerHTML = 'Sending…';
      const err = wrap.querySelector('#composeErr'); err.style.display = 'none';
      try {
        await data.sendEmail({ to, cc: el['cc'].value.trim(), bcc: el['bcc'].value.trim(), subject: el['subject'].value.trim(), text, inReplyTo: opts.inReplyTo || '' });
        close(); renderMessages(root); toast('Message sent.');
      } catch (ex) {
        sub.disabled = false; sub.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send';
        err.style.display = 'block'; err.style.color = 'var(--c-noshow)';
        err.textContent = (ex.message || 'Send failed.') + (ex.detail ? ' (' + ex.detail + ')' : '');
      }
    });
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
  //  VIEW: CALENDAR (the booking calendar / appointment book)
  // ================================================================
  //  Shows scheduled client bookings — added by hand right here, or
  //  synced in from an external calendar (read-only). NOT enquiries.
  const APPT_KIND = { scheduled: 'active', completed: 'success', cancelled: 'neutral' };
  const APPT_LABEL = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' };
  const APPT_SRC = {
    manual:  { i: 'fa-solid fa-user-pen',      l: 'Added manually' },
    google:  { i: 'fa-brands fa-google',       l: 'Google Calendar' },
    outlook: { i: 'fa-solid fa-envelope',      l: 'Outlook Calendar' },
    apple:   { i: 'fa-brands fa-apple',        l: 'Apple Calendar' },
    ical:    { i: 'fa-solid fa-calendar-days', l: 'Synced calendar' }
  };
  const pad2c = (n) => String(n).padStart(2, '0');
  const ymdOf = (y, m, d) => `${y}-${pad2c(m + 1)}-${d < 10 ? '0' + d : d}`;
  const ymdToday = () => { const n = new Date(); return ymdOf(n.getFullYear(), n.getMonth(), n.getDate()); };
  const fmtTime = (t) => { if (!t) return ''; const [h, mn] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${((h + 11) % 12) + 1}:${pad2c(mn || 0)} ${ap}`; };
  const fmtApptDate = (ds) => { if (!ds) return ''; const [Y, M, D] = ds.split('-').map(Number); return new Date(Y, M - 1, D).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' }); };
  const apptPill = (s) => `<span class="pill pill--${APPT_KIND[s] || 'active'}">${APPT_LABEL[s] || s}</span>`;
  const fmtHour = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
  const safeHref = (u) => { const s = String(u || '').trim(); return /^https?:\/\//i.test(s) ? s : ''; };   // block javascript:/data: hrefs
  const meetInfo = (url) => {
    const u = (url || '').toLowerCase();
    if (/zoom\.us/.test(u)) return { i: 'fa-solid fa-video', l: 'Zoom' };
    if (/meet\.google/.test(u)) return { i: 'fa-solid fa-video', l: 'Google Meet' };
    if (/teams\.(microsoft|live|office)/.test(u)) return { i: 'fa-solid fa-video', l: 'Microsoft Teams' };
    if (/(whereby|webex|around|jit\.si|meet\.jit)/.test(u)) return { i: 'fa-solid fa-video', l: 'Video call' };
    return { i: 'fa-solid fa-video', l: 'Online meeting' };
  };
  const CAL_PROV = {
    google:   { i: 'fa-brands fa-google',        l: 'Google Calendar' },
    outlook:  { i: 'fa-solid fa-envelope',       l: 'Outlook / Microsoft' },
    apple:    { i: 'fa-brands fa-apple',         l: 'Apple Calendar' },
    calendly: { i: 'fa-solid fa-calendar-check', l: 'Calendly' },
    ical:     { i: 'fa-solid fa-link',           l: 'Other (iCal link)' }
  };
  const apptBlock = (a) => {
    const meet = safeHref(a.meetingUrl) ? ` <i class="${meetInfo(a.meetingUrl).i}" title="${esc(meetInfo(a.meetingUrl).l)}" style="opacity:.85;font-size:.72rem"></i>` : '';
    return `<div class="day-appt pill--${APPT_KIND[a.status] || 'active'} ${a.status === 'cancelled' ? 'is-cancelled' : ''}" data-appt="${esc(String(a.id))}">
      <div class="da-t">${a.time ? esc(fmtTime(a.time)) : 'Any time'} · ${a.duration || 60}m</div>
      <div class="da-c">${esc(a.client)}${meet}</div>
      <div class="da-s">${esc(a.title)}</div>
    </div>`;
  };

  let calMonth = null;
  let calView = 'month';   // 'month' | 'day'
  let calDay = null;       // 'YYYY-MM-DD' when in day view
  let ALL_APPTS = [];
  async function renderCalendar(root) {
    ALL_APPTS = await data.appointments();
    if (calView === 'day') return renderDayView(root);
    if (!calMonth) { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const monthName = calMonth.toLocaleString('default', { month: 'long' });
    const byDay = {};
    for (const a of ALL_APPTS) {
      if (!a.date) continue;
      const [Y, M] = a.date.split('-').map(Number);
      if (Y === y && (M - 1) === m) { const D = Number(a.date.slice(8, 10)); (byDay[D] = byDay[D] || []).push(a); }
    }
    for (const k in byDay) byDay[k].sort((p, q) => (p.time || '99:99').localeCompare(q.time || '99:99'));
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    let cells = '';
    for (let i = 0; i < first; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const evs = byDay[d] || [];
      const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
      const chips = evs.slice(0, 4).map((a) => `<div class="cal-ev pill--${APPT_KIND[a.status] || 'active'} ${a.status === 'cancelled' ? 'is-cancelled' : ''}" data-appt="${esc(String(a.id))}" title="${a.time ? esc(fmtTime(a.time)) + ' · ' : ''}${esc(a.client)} — ${esc(a.title)}">${a.time ? `<b>${esc(fmtTime(a.time))}</b> ` : ''}${esc(a.client)}${safeHref(a.meetingUrl) ? ' <i class="fa-solid fa-video" style="font-size:.6rem;opacity:.85"></i>' : ''}</div>`).join('');
      cells += `<div class="cal-cell ${isToday ? 'today' : ''}"><div class="d"><button class="cal-daynum" data-day="${ymdOf(y, m, d)}" title="Open this day">${d}</button><button class="cal-add" data-add="${ymdOf(y, m, d)}" title="Add booking"><i class="fa-solid fa-plus"></i></button></div>${chips}${evs.length > 4 ? `<button class="cal-more" data-day="${ymdOf(y, m, d)}">+${evs.length - 4} more</button>` : ''}</div>`;
    }
    const monthTotal = Object.values(byDay).reduce((a, arr) => a + arr.length, 0);
    root.innerHTML = `
      <div class="toolbar" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn btn--dark btn--sm" id="calPrev"><i class="fa-solid fa-chevron-left"></i></button>
          <h2 style="font-family:var(--font-display);color:var(--white);font-size:1.25rem;min-width:170px;text-align:center">${monthName} ${y}</h2>
          <button class="btn btn--dark btn--sm" id="calNext"><i class="fa-solid fa-chevron-right"></i></button>
          <button class="btn btn--dark btn--sm" id="calToday">Today</button>
          <span class="muted" style="font-size:.85rem">${monthTotal} booking${monthTotal === 1 ? '' : 's'} this month</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn--dark btn--sm" id="calConnect"><i class="fa-solid fa-link"></i> Connect calendar</button>
          <button class="btn btn--sm" id="calAdd"><i class="fa-solid fa-plus"></i> Add booking</button>
        </div>
      </div>
      ${monthTotal === 0 ? `<div class="card card--pad" style="text-align:center;color:var(--text-dim);font-size:.9rem;margin-bottom:14px"><i class="fa-solid fa-calendar-plus" style="font-size:1.4rem;color:var(--gold);opacity:.8"></i><div style="margin-top:8px">No bookings scheduled this month yet. Hover a day and hit <b>+</b>, or use <b>Add booking</b>.</div></div>` : ''}
      <div class="card card--pad"><div class="cal cal--full">
        <div class="cal-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
      </div></div>`;
    $('#calPrev', root).addEventListener('click', () => { calMonth = new Date(y, m - 1, 1); renderCalendar(root); });
    $('#calNext', root).addEventListener('click', () => { calMonth = new Date(y, m + 1, 1); renderCalendar(root); });
    $('#calToday', root).addEventListener('click', () => { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); renderCalendar(root); });
    $('#calAdd', root).addEventListener('click', () => openApptForm({ date: ymdToday() }, root));
    $('#calConnect', root).addEventListener('click', () => openConnectModal(root));
    const openDay = (ds) => { calDay = ds; calView = 'day'; renderCalendar(root); };
    root.querySelectorAll('.cal-daynum[data-day], .cal-more[data-day]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); openDay(el.dataset.day); }));
    root.querySelectorAll('.cal-add[data-add]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); openApptForm({ date: el.dataset.add }, root); }));
    root.querySelectorAll('.cal-ev[data-appt]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); openApptDetail(el.dataset.appt, root); }));
  }

  // ---- DAY VIEW: 24-hour agenda for one date ---------------------
  function renderDayView(root) {
    const ds = calDay || ymdToday();
    const list = ALL_APPTS.filter((a) => a.date === ds).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    const byHour = {}; const allDay = [];
    for (const a of list) { if (!a.time) { allDay.push(a); continue; } const h = Number(a.time.slice(0, 2)); (byHour[h] = byHour[h] || []).push(a); }
    const isToday = ds === ymdToday();
    const now = new Date();
    let rows = '';
    for (let h = 0; h < 24; h++) {
      const evs = byHour[h] || [];
      const nowMark = (isToday && now.getHours() === h) ? `<div class="day-now" style="top:${((now.getMinutes() / 60) * 100).toFixed(1)}%"></div>` : '';
      rows += `<div class="day-row ${evs.length ? 'has' : ''} ${(h >= 8 && h <= 19) ? 'biz' : ''}">
        <div class="day-hr">${fmtHour(h)}</div>
        <div class="day-slot">${nowMark}${evs.map(apptBlock).join('')}<button class="day-add" data-addhour="${pad2c(h)}:00" title="Add booking at ${fmtHour(h)}"><i class="fa-solid fa-plus"></i></button></div>
      </div>`;
    }
    const total = list.length;
    root.innerHTML = `
      <div class="toolbar" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn btn--dark btn--sm" id="dayBack"><i class="fa-solid fa-chevron-left"></i> Month</button>
          <button class="btn btn--dark btn--sm" id="dayPrev"><i class="fa-solid fa-angle-left"></i></button>
          <h2 style="font-family:var(--font-display);color:var(--white);font-size:1.12rem;min-width:230px;text-align:center">${esc(fmtApptDate(ds))}${isToday ? ' · Today' : ''}</h2>
          <button class="btn btn--dark btn--sm" id="dayNext"><i class="fa-solid fa-angle-right"></i></button>
          <span class="muted" style="font-size:.85rem">${total} booking${total === 1 ? '' : 's'}</span>
        </div>
        <button class="btn btn--sm" id="dayAdd"><i class="fa-solid fa-plus"></i> Add booking</button>
      </div>
      ${allDay.length ? `<div class="card card--pad" style="margin-bottom:12px"><div class="k" style="color:var(--text-dim);font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">All day / no set time</div><div style="display:flex;flex-wrap:wrap;gap:8px">${allDay.map(apptBlock).join('')}</div></div>` : ''}
      <div class="card card--pad"><div class="day-grid" id="dayGrid">${rows}</div></div>`;
    $('#dayBack', root).addEventListener('click', () => { calView = 'month'; renderCalendar(root); });
    const stepDay = (delta) => { const [Y, M, D] = ds.split('-').map(Number); const nd = new Date(Y, M - 1, D + delta); calDay = ymdOf(nd.getFullYear(), nd.getMonth(), nd.getDate()); renderCalendar(root); };
    $('#dayPrev', root).addEventListener('click', () => stepDay(-1));
    $('#dayNext', root).addEventListener('click', () => stepDay(1));
    $('#dayAdd', root).addEventListener('click', () => openApptForm({ date: ds, time: '10:00' }, root));
    root.querySelectorAll('.day-add[data-addhour]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); openApptForm({ date: ds, time: el.dataset.addhour }, root); }));
    root.querySelectorAll('.day-appt[data-appt]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); openApptDetail(el.dataset.appt, root); }));
    const grid = $('#dayGrid', root); if (grid) { const target = isToday ? Math.max(0, now.getHours() - 1) : 8; const row = grid.children[target]; if (row) grid.scrollTop = row.offsetTop; }
  }

  // ---- CONNECT A CALENDAR (Google / Outlook / Apple / Calendly / iCal)
  async function openConnectModal(root) {
    const conns = await data.calendarConnections();
    const wrap = document.createElement('div'); wrap.className = 'modal show';
    const tiles = Object.entries(CAL_PROV).map(([k, v]) => `<button type="button" class="prov-tile" data-prov="${k}"><i class="${v.i}"></i><span>${esc(v.l)}</span></button>`).join('');
    const connList = conns.length
      ? conns.map((c) => `<div class="conn-row"><i class="${(CAL_PROV[c.provider] || CAL_PROV.ical).i}"></i><div class="cr-main"><div class="cr-l">${esc((CAL_PROV[c.provider] || CAL_PROV.ical).l)}</div><div class="cr-s">${c.status === 'active' ? 'Connected · syncing' : 'Saved — sync activates once your Apex backend is connected'}</div>${c.icalUrl ? `<div class="cr-u">${esc(c.icalUrl)}</div>` : ''}</div><button class="cr-x" data-remove="${esc(c.id)}" title="Remove"><i class="fa-solid fa-xmark"></i></button></div>`).join('')
      : '<div class="muted" style="font-size:.85rem">No calendars connected yet.</div>';
    wrap.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><h3>Connect a calendar</h3><button class="x" data-close><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <p class="muted" style="font-size:.85rem;margin-top:-4px">Pull bookings from a calendar you already use. Pick a provider, then paste its secret <b>iCal link</b> — Google, Outlook, Apple and Calendly all provide one, so this works with any calendar.</p>
          <div class="prov-grid">${tiles}</div>
          <form id="connForm" style="display:none;margin-top:4px">
            <div class="mf"><label id="connLabel">iCal link</label>
              <input class="field-input" name="icalUrl" type="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
              <div class="muted" id="connHint" style="font-size:.78rem;margin-top:6px"></div>
            </div>
            <div class="modal-foot" style="margin-top:12px">
              <button type="button" class="btn btn--dark" id="connBack">Back</button>
              <button type="submit" class="btn"><i class="fa-solid fa-link"></i> Connect</button>
            </div>
          </form>
          <div style="margin-top:18px"><div class="k" style="color:var(--text-dim);font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Connected calendars</div><div id="connList">${connList}</div></div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    const form = wrap.querySelector('#connForm');
    const hint = wrap.querySelector('#connHint');
    const labelEl = wrap.querySelector('#connLabel');
    const urlInput = form.querySelector('input[name="icalUrl"]');
    let chosen = null;
    const HINTS = {
      google: 'Google Calendar → Settings → your calendar → "Secret address in iCal format". Paste that link.',
      outlook: 'Outlook.com → Calendar → Share → Publish a calendar → copy the ICS link.',
      apple: 'iCloud Calendar → share as a Public Calendar → copy the webcal/ICS link.',
      calendly: 'Paste your Calendly booking-page link — events are pulled server-side.',
      ical: 'Paste any calendar’s .ics or webcal feed URL.'
    };
    wrap.querySelectorAll('.prov-tile').forEach((t) => t.addEventListener('click', () => {
      chosen = t.dataset.prov;
      wrap.querySelectorAll('.prov-tile').forEach((x) => x.classList.toggle('sel', x === t));
      form.style.display = 'block';
      labelEl.textContent = (CAL_PROV[chosen] || CAL_PROV.ical).l + ' — link';
      hint.textContent = HINTS[chosen] || HINTS.ical;
      setTimeout(() => urlInput.focus(), 20);
    }));
    wrap.querySelector('#connBack').addEventListener('click', () => { form.style.display = 'none'; wrap.querySelectorAll('.prov-tile').forEach((x) => x.classList.remove('sel')); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (!url) { urlInput.style.borderColor = 'var(--c-noshow)'; hint.textContent = 'Paste the calendar link to connect.'; return; }
      try { await data.addCalendarConnection({ provider: chosen || 'ical', icalUrl: url, status: 'pending' }); }
      catch (err) { hint.textContent = (err && err.message) || 'Could not save the connection.'; return; }
      close(); openConnectModal(root);
    });
    wrap.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => { await data.removeCalendarConnection(b.dataset.remove); close(); openConnectModal(root); }));
  }

  // appointment detail drawer — edit/complete/cancel/delete (manual);
  // read-only for anything synced from an external calendar
  function openApptDetail(id, root) {
    const a = ALL_APPTS.find((x) => String(x.id) === String(id)); if (!a) return;
    const editable = data.apptEditable(a);
    const src = APPT_SRC[a.source] || APPT_SRC.ical;
    const drawer = $('#drawer');
    const lblCss = 'color:var(--text-dim);font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px';
    drawer.innerHTML = `
      <div class="drawer-head"><div class="avatar">${initials(a.client)}</div>
        <div><div style="font-weight:600;color:var(--white)">${esc(a.client)}</div><div style="font-size:.8rem;color:var(--text-dim)">${esc(a.title)}</div></div>
        <button class="x" id="drawerX"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="drawer-body">
        <div class="dv-name" style="font-size:1.15rem">${esc(fmtApptDate(a.date))}${a.time ? ` <span style="font-size:.9rem;color:var(--text-soft)">at ${esc(fmtTime(a.time))}</span>` : ''}</div>
        <div style="margin:10px 0 18px">${apptPill(a.status)} <span class="src" style="margin-left:8px"><i class="${src.i}"></i> ${src.l}</span></div>
        <div class="dv-row"><div class="k">Duration</div><div class="v">${a.duration || 60} min</div></div>
        ${a.phone ? `<div class="dv-row"><div class="k">Phone</div><div class="v">${esc(a.phone)}</div></div>` : ''}
        ${a.email ? `<div class="dv-row"><div class="k">Email</div><div class="v">${esc(a.email)}</div></div>` : ''}
        ${a.meetingUrl ? `<div class="dv-row"><div class="k">Meeting</div><div class="v">${safeHref(a.meetingUrl)
          ? `<a href="${esc(safeHref(a.meetingUrl))}" target="_blank" rel="noopener" style="color:var(--gold);word-break:break-all"><i class="${meetInfo(a.meetingUrl).i}"></i> ${esc(meetInfo(a.meetingUrl).l)}</a>`
          : `<span style="word-break:break-all">${esc(a.meetingUrl)}</span>`}</div></div>` : ''}
        ${a.notes ? `<div class="dv-row"><div class="k">Notes</div><div class="v">${esc(a.notes)}</div></div>` : ''}
        ${editable
          ? `<div style="margin-top:20px"><div class="k" style="${lblCss}">Status</div>
              <div class="status-set" id="apptStatus">
                <button data-s="scheduled" class="${a.status === 'scheduled' ? 'on' : ''}">Scheduled</button>
                <button data-s="completed" class="${a.status === 'completed' ? 'on' : ''}">Completed</button>
                <button data-s="cancelled" class="${a.status === 'cancelled' ? 'on' : ''}">Cancelled</button>
              </div></div>`
          : `<div class="muted" style="margin-top:18px;display:flex;gap:8px;align-items:center"><i class="fa-solid fa-lock" style="opacity:.6"></i> Synced from ${src.l} — edit it there and it updates here.</div>`}
      </div>
      <div class="dv-actions">
        ${safeHref(a.meetingUrl) ? `<a class="btn" href="${esc(safeHref(a.meetingUrl))}" target="_blank" rel="noopener"><i class="fa-solid fa-video"></i> Join ${esc(meetInfo(a.meetingUrl).l)}</a>` : ''}
        ${editable ? `<div class="dv-contact">
          <button class="btn btn--dark" id="apptEdit"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn btn--dark" id="apptDelete"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>` : ''}
        ${a.phone ? `<div class="dv-contact">
          <a class="btn btn--dark" href="tel:${esc(a.phone)}"><i class="fa-solid fa-phone"></i> Call</a>
          <a class="btn btn--dark" href="https://wa.me/${telDigits(a.phone)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
        </div>` : ''}
      </div>`;
    drawer.classList.add('show'); $('#scrim').classList.add('show');
    $('#drawerX').addEventListener('click', closeDrawer);
    const st = $('#apptStatus'); if (st) st.addEventListener('click', async (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      try { await data.updateAppointment(a.id, { status: btn.dataset.s }); } catch (err) { return; }
      a.status = btn.dataset.s;
      st.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
      renderCalendar(root);
    });
    const ed = $('#apptEdit'); if (ed) ed.addEventListener('click', () => { closeDrawer(); openApptForm(a, root); });
    const del = $('#apptDelete'); if (del) del.addEventListener('click', async () => { await data.deleteAppointment(a.id); closeDrawer(); renderCalendar(root); });
  }

  // add / edit a booking (manual bookings — stored on this device)
  function openApptForm(opts, root) {
    opts = opts || {};
    const editing = !!opts.id;
    const title = editing ? 'Edit Booking' : 'Add Booking';
    const wrap = document.createElement('div');
    wrap.className = 'modal show';
    const dur = Number(opts.duration) || 60;
    wrap.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="x" data-close><i class="fa-solid fa-xmark"></i></button></div>
        <form class="modal-body" id="apptForm" novalidate>
          <div class="mf"><label>Client name <span class="req">*</span></label><input class="field-input" name="client" required value="${esc(opts.client || '')}" placeholder="Who is the booking with?" /></div>
          <div class="mf"><label>Service / purpose</label><input class="field-input" name="title" value="${esc(opts.title || '')}" placeholder="e.g. Consultation, Haircut, Kickoff call" /></div>
          <div class="mf-row">
            <div class="mf"><label>Date <span class="req">*</span></label><input class="field-input" name="date" type="date" required value="${esc(opts.date || ymdToday())}" /></div>
            <div class="mf"><label>Time</label><input class="field-input" name="time" type="time" value="${esc(opts.time || '10:00')}" /></div>
            <div class="mf"><label>Duration</label><select class="field-input" name="duration">${[15, 30, 45, 60, 90, 120].map((d) => `<option value="${d}" ${dur === d ? 'selected' : ''}>${d} min</option>`).join('')}</select></div>
          </div>
          <div class="mf-row">
            <div class="mf"><label>Phone / WhatsApp</label><input class="field-input" name="phone" type="tel" value="${esc(opts.phone || '')}" placeholder="+1 (555) 000-0000" /></div>
            <div class="mf"><label>Email</label><input class="field-input" name="email" type="email" value="${esc(opts.email || '')}" placeholder="name@email.com" /></div>
          </div>
          <div class="mf"><label>Online meeting link <span style="color:var(--text-dim);font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label><input class="field-input" name="meetingUrl" type="url" value="${esc(opts.meetingUrl || '')}" placeholder="Zoom / Google Meet / Teams link" /></div>
          <div class="mf"><label>Notes</label><textarea class="field-input" name="notes" rows="2" placeholder="Anything to remember…">${esc(opts.notes || '')}</textarea></div>
          <div class="modal-foot">
            <button type="button" class="btn btn--dark" data-close>Cancel</button>
            <button type="submit" class="btn"><i class="fa-solid fa-${editing ? 'check' : 'plus'}"></i> ${editing ? 'Save booking' : 'Add booking'}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    setTimeout(() => wrap.querySelector('input[name="client"]').focus(), 30);
    wrap.querySelector('#apptForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const el = e.target.elements;
      const client = el['client'].value.trim();
      const date = el['date'].value;
      if (!client) { el['client'].style.borderColor = 'var(--c-noshow)'; el['client'].focus(); return; }
      if (!date) { el['date'].style.borderColor = 'var(--c-noshow)'; return; }
      let meetingUrl = el['meetingUrl'].value.trim();
      if (meetingUrl && !/^[a-z][a-z0-9+.-]*:/i.test(meetingUrl)) meetingUrl = 'https://' + meetingUrl;   // add scheme to bare links (zoom.us/… → https://zoom.us/…)
      const payload = { client, title: el['title'].value.trim(), date, time: el['time'].value, duration: Number(el['duration'].value) || 60, phone: el['phone'].value.trim(), email: el['email'].value.trim(), meetingUrl, notes: el['notes'].value.trim() };
      const sub = e.target.querySelector('button[type="submit"]'); sub.disabled = true; sub.innerHTML = 'Saving…';
      calMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1);   // follow the booking to its month
      calDay = date;                                                                     // …and its day, so day view lands on it too
      try {
        if (editing) await data.updateAppointment(opts.id, payload);
        else await data.createAppointment(payload);
      } catch (err) {
        sub.disabled = false; sub.innerHTML = `<i class="fa-solid fa-${editing ? 'check' : 'plus'}"></i> ${editing ? 'Save booking' : 'Add booking'}`;
        let er = wrap.querySelector('#apptErr'); if (!er) { er = document.createElement('div'); er.id = 'apptErr'; er.className = 'modal-err'; e.target.querySelector('.modal-foot').before(er); }
        er.textContent = (err && err.message) || 'Could not save the booking.';
        return;
      }
      close();
      const cv = $('.view[data-view="calendar"]'); if (cv) renderCalendar(cv);
    });
  }

  const RENDER = { overview: renderOverview, bookings: renderBookings, clients: renderClients, calendar: renderCalendar, messages: renderMessages, insights: renderInsights, reviews: renderReviews, settings: renderSettings };
  const TITLES = {
    overview: ['Overview', cfg.overviewSub || 'Website & booking insights'], bookings: [ENT.plural, cfg.entitySub || 'Requests & appointment pipeline'],
    clients: ['Clients', 'Your customer CRM'], calendar: ['Calendar', 'Scheduled client bookings'], messages: ['Messages', 'Enquiries across every channel'],
    insights: ['Insights', `What drives your ${ENT.plural.toLowerCase()}`], reviews: ['Reviews', 'Reputation at a glance'], settings: ['Settings', 'Business profile & plan']
  };
  const rendered = {};
  async function go(tab) {
    document.querySelectorAll('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== tab));
    $('#tbTitle').childNodes[0].nodeValue = TITLES[tab][0]; $('#tbSub').textContent = TITLES[tab][1];
    if (tab === 'calendar') calView = 'month';   // entering the tab from the nav always shows the month
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
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = document.querySelector('.modal.show'); if (m) { m.remove(); return; } closeDrawer(); $('#splash').classList.remove('show'); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
