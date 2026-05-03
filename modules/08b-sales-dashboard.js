// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/08b-sales-dashboard.js
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Dashboard (desktop & mobile entry point).
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
defineAction('dashboard-nav-leads', function(target, ev) {
  setState({page:'leads'});
});
defineAction('dashboard-open-new-deal', function(target, ev) {
  openNewDealModal();
});
defineAction('dashboard-set-branch', function(target, ev) {
  setState({branch:target.dataset.branchId});
});
defineAction('dashboard-nav-deals', function(target, ev) {
  setState({page:'deals'});
});
defineAction('dashboard-nav-email', function(target, ev) {
  setState({page:'email'});
});
defineAction('dashboard-nav-reports', function(target, ev) {
  setState({page:'reports'});
});
defineAction('dashboard-view-activity', function(target, ev) {
  var act = { _et: target.dataset.actType, _id: target.dataset.actId };
  setState({
    [act._et === 'deal' ? 'dealDetailId' : 'leadDetailId']: act._id,
    page: act._et === 'deal' ? 'deals' : 'leads'
  });
});
defineAction('dashboard-view-deal', function(target, ev) {
  setState({dealDetailId:target.dataset.dealId,page:'deals'});
});
defineAction('dashboard-email-deal', function(target, ev) {
  emailFromDeal(target.dataset.dealId);
});
defineAction('dashboard-stop-propagation', function(target, ev) {
  ev.stopPropagation();
});

function renderDashboard() {
  // Native wrapper: replace the desktop dashboard with the mobile "Today"
  // home screen — black hero, 2x2 stat grid, today's appointments, recent
  // open deals. Desktop behaviour is unchanged below this branch.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
    return renderTodayMobile();
  }
  const { deals, leads, emailSent, emailInbox, contacts } = getState();
  const now = new Date();
  const B = getState().branch || 'all'; // 'all' | 'VIC' | 'SA' | 'ACT'

  // ── Branch filter ───────────────────────────────────────────────────────────
  const bFilter = x => B === 'all' || x.branch === B;

  const bDeals = deals.filter(bFilter);
  const bLeads = leads.filter(bFilter);

  // ── Date helpers ────────────────────────────────────────────────────────────
  // This week: Mon–Sun
  const dow = now.getDay(); // 0=Sun
  const monday = new Date(now); monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
  const inWeek = ds => { if (!ds) return false; const d = new Date(ds + 'T12:00'); return d >= monday && d <= sunday; };

  const weekLabel = monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    + ' – '
    + sunday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthKey = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const inMonth = ds => { if (!ds) return false; const d = new Date(ds + 'T12:00'); return d >= monthStart && d <= monthEnd; };

  // Previous month
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const inPrevMonth = ds => { if (!ds) return false; const d = new Date(ds + 'T12:00'); return d >= prevStart && d <= prevEnd; };

  // ── This WEEK's leads ────────────────────────────────────────────────────────
  const weekLeads = bLeads.filter(l => inWeek(l.created));
  const weekLeadsNew = weekLeads.filter(l => l.status === 'New').length;
  const weekLeadsQual = weekLeads.filter(l => l.status === 'Qualified').length;
  const weekLeadsConv = weekLeads.filter(l => l.converted).length;

  // Daily breakdown Mon–Sun
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekDayLeads = DAY_NAMES.map((dn, i) => {
    const dayDate = new Date(monday); dayDate.setDate(monday.getDate() + i);
    const dayStr = dayDate.toISOString().slice(0, 10);
    const dayLeads = bLeads.filter(l => l.created && l.created.slice(0, 10) === dayStr);
    return {
      day: dn, date: dayStr, total: dayLeads.length,
      new: dayLeads.filter(l => l.status === 'New').length,
      qual: dayLeads.filter(l => l.status === 'Qualified').length,
      conv: dayLeads.filter(l => l.converted).length,
      isToday: dayStr === now.toISOString().slice(0, 10),
    };
  });
  const maxDayLeads = Math.max(...weekDayLeads.map(d => d.total), 1);

  // ── This month's won deals ───────────────────────────────────────────────────
  const monthWon = bDeals.filter(d => d.won && inMonth(d.wonDate));
  const monthWonValue = monthWon.reduce((s, d) => s + d.val, 0);
  const avgDealValue = monthWon.length > 0 ? Math.round(monthWonValue / monthWon.length) : 0;
  const prevWon = bDeals.filter(d => d.won && inPrevMonth(d.wonDate));
  const prevWonValue = prevWon.reduce((s, d) => s + d.val, 0);
  const prevAvgVal = prevWon.length > 0 ? Math.round(prevWonValue / prevWon.length) : 0;

  // ── Closing ratio (month) ────────────────────────────────────────────────────
  const allMonthActive = bDeals.filter(d => inMonth(d.created) || inMonth(d.wonDate));
  const monthCreatedWon = bDeals.filter(d => d.won && inMonth(d.wonDate));
  const closeRatio = allMonthActive.length > 0 ? Math.round(monthCreatedWon.length / allMonthActive.length * 100) : 0;

  // ── Leaderboard (won value this month by rep, filtered by branch) ────────────
  const REP_COLS = { 'James Wilson': '#c41230', 'Sarah Chen': '#1e40af', 'Emma Brown': '#059669', 'Michael Torres': '#7c3aed', 'David Kim': '#d97706' };
  const repMap = {};
  monthWon.forEach(d => {
    if (!repMap[d.rep]) repMap[d.rep] = { name: d.rep, val: 0, count: 0 };
    repMap[d.rep].val += d.val; repMap[d.rep].count++;
  });
  const leaderboard = Object.values(repMap)
    .map(r => ({ ...r, col: REP_COLS[r.name] || '#9ca3af', initials: r.name.split(' ').map(w => w[0]).join('') }))
    .sort((a, b) => b.val - a.val);
  const maxRepVal = Math.max(...leaderboard.map(r => r.val), 1);

  // ── Pipeline by stage ────────────────────────────────────────────────────────
  const pipeline = bDeals.filter(d => !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
  const stageRows = PIPELINES[0].stages.filter(s => !s.isLost).map(st => {
    const sd = bDeals.filter(d => d.sid === st.id && !d.won);
    return { ...st, count: sd.length, val: sd.reduce((s, d) => s + d.val, 0) };
  }).filter(s => s.count > 0);
  const maxStageVal = Math.max(...stageRows.map(s => s.val), 1);

  // ── Recent activity ──────────────────────────────────────────────────────────
  const allActs = [];
  bDeals.forEach(d => (d.activities || []).forEach(a => allActs.push({ ...a, _title: d.title, _id: d.id, _et: 'deal' })));
  bLeads.forEach(l => (l.activities || []).forEach(a => allActs.push({ ...a, _title: l.fn + ' ' + l.ln, _id: l.id, _et: 'lead' })));
  allActs.sort((a, b) => b.date > a.date ? 1 : -1);
  const recentActs = allActs.slice(0, 5);
  const AICON = { note: '📝', call: '📞', email: '✉️', task: '☑️', stage: '🔀', created: '⭐', meeting: '📅', file: '📎', edit: '✏️', photo: '📸' };
  const unread = (emailInbox || []).filter(m => !m.read).length;

  // ── Branch config ────────────────────────────────────────────────────────────
  const BRANCHES = [
    { id: 'all', label: 'All Branches', col: '#1a1a1a', bg: '#1a1a1a', flag: '🇦🇺' },
    { id: 'VIC', label: 'VIC', col: '#1d4ed8', bg: '#1d4ed8', flag: '📍' },
    { id: 'SA', label: 'SA', col: '#059669', bg: '#059669', flag: '📍' },
    { id: 'ACT', label: 'ACT', col: '#7c3aed', bg: '#7c3aed', flag: '📍' },
  ];
  const activeBranch = BRANCHES.find(b => b.id === B) || BRANCHES[0];

  const trendBadge = (val, prev, suffix = '') => {
    if (!prev) return '';
    const d = val - prev, pct = Math.round(Math.abs(d) / prev * 100);
    const up = d >= 0;
    return `<span style="font-size:11px;font-weight:600;color:${up ? '#15803d' : '#b91c1c'}">${up ? '▲' : '▼'} ${pct}%</span>`;
  };

  return `
  <!-- ══ HEADER ══ -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h1 style="font-size:26px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">
        ${B === 'all' ? 'All Branches' : B + ' Branch'} Dashboard
      </h1>
      <p style="color:#6b7280;font-size:13px;margin:0">${monthKey}</p>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button data-action="dashboard-nav-leads" class="btn-w" style="font-size:12px;gap:5px">${Icon({ n: 'user', size: 13 })} Add Lead</button>
      <button data-action="dashboard-open-new-deal" class="btn-r" style="font-size:13px;gap:6px">${Icon({ n: 'plus', size: 14 })} New Deal</button>
    </div>
  </div>

  <!-- ══ BRANCH SWITCHER ══ -->
  ${(typeof isNativeWrapper === 'function' && isNativeWrapper()) ? `
  <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:2px">
    ${BRANCHES.map(br => {
      const isActive = B === br.id;
      return `<button data-action="dashboard-set-branch" data-branch-id="${br.id}" style="flex-shrink:0;padding:6px 14px;border-radius:18px;border:1px solid ${isActive ? br.col : '#e5e7eb'};background:${isActive ? br.col : '#fff'};color:${isActive ? '#fff' : '#1a1a1a'};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">${br.label}</button>`;
    }).join('')}
  </div>
  ` : `
  <div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap">
    ${BRANCHES.map(br => {
    const brDeals = deals.filter(d => br.id === 'all' || d.branch === br.id);
    const brLeads = leads.filter(l => br.id === 'all' || l.branch === br.id);
    const brWon = brDeals.filter(d => d.won && inMonth(d.wonDate)).reduce((s, d) => s + d.val, 0);
    const brWeekNew = brLeads.filter(l => inWeek(l.created)).length;
    const isActive = B === br.id;
    return `<button data-action="dashboard-set-branch" data-branch-id="${br.id}"
        style="display:flex;flex-direction:column;align-items:flex-start;padding:10px 16px;border-radius:12px;border:2px solid ${isActive ? br.col : '#e5e7eb'};background:${isActive ? br.col + '12' : '#fff'};cursor:pointer;font-family:inherit;min-width:110px;transition:all .15s;flex:1;max-width:200px"
        onmouseover="this.style.borderColor='${br.col}'" onmouseout="if((getState().branch||'all')!=='${br.id}')this.style.borderColor='#e5e7eb'">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:13px;font-weight:700;color:${isActive ? br.col : '#1a1a1a'}">${br.label}</span>
          ${isActive ? `<span style="width:6px;height:6px;border-radius:50%;background:${br.col};display:inline-block"></span>` : ''}
        </div>
        <div style="font-size:11px;color:#9ca3af">${brWeekNew} leads this wk · ${fmt$(brWon)} won</div>
      </button>`;
  }).join('')}
  </div>
  `}

  <!-- ══ KPI CARDS ══ -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:14px;margin-bottom:18px">

    <!-- Leads This Week -->
    <div class="card" style="padding:18px;cursor:pointer;border-top:3px solid ${activeBranch.col}"
      data-action="dashboard-nav-leads"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Leads This Week</span>
        <div style="width:30px;height:30px;border-radius:8px;background:${activeBranch.col}18;color:${activeBranch.col};display:flex;align-items:center;justify-content:center">${Icon({ n: 'user', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${weekLeads.length}</div>
      <div style="font-size:11px;color:#9ca3af;line-height:1.5">
        <span style="color:${activeBranch.col};font-weight:600">${weekLeadsNew} new</span>
        · ${weekLeadsQual} qualified
        · ${weekLeadsConv} converted
      </div>
      <div style="font-size:10px;color:#d1d5db;margin-top:4px">${weekLabel}</div>
    </div>

    <!-- Sales This Month -->
    <div class="card" style="padding:18px;cursor:pointer;border-top:3px solid #15803d"
      data-action="dashboard-nav-deals"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Sales This Month</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#dcfce7;color:#15803d;display:flex;align-items:center;justify-content:center">${Icon({ n: 'check', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${fmt$(monthWonValue)}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:#9ca3af">${monthWon.length} deal${monthWon.length !== 1 ? 's' : ''}</span>
        ${trendBadge(monthWonValue, prevWonValue)}
      </div>
    </div>

    <!-- Average Sale Value -->
    <div class="card" style="padding:18px;border-top:3px solid #b45309">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Avg Sale Value</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#fef3c7;color:#b45309;display:flex;align-items:center;justify-content:center">${Icon({ n: 'trend', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${fmt$(avgDealValue)}</div>
      <div style="display:flex;align-items:center;gap:6px">
        ${avgDealValue > 0 && prevAvgVal > 0
      ? (avgDealValue >= prevAvgVal
        ? `<span style="font-size:11px;color:#15803d;font-weight:600">▲ +${fmt$(avgDealValue - prevAvgVal)}</span>`
        : `<span style="font-size:11px;color:#b91c1c;font-weight:600">▼ ${fmt$(avgDealValue - prevAvgVal)}</span>`)
      : `<span style="font-size:11px;color:#9ca3af">No prev data</span>`}
        ${prevAvgVal > 0 ? `<span style="font-size:11px;color:#9ca3af">prev ${fmt$(prevAvgVal)}</span>` : ''}
      </div>
    </div>

    <!-- Closing Ratio -->
    <div class="card" style="padding:18px;border-top:3px solid #1d4ed8">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Close Rate</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center">${Icon({ n: 'arr', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${closeRatio}%</div>
      <div style="font-size:11px;color:#9ca3af">${monthCreatedWon.length} won / ${allMonthActive.length} active this month</div>
    </div>

    ${unread > 0 && B === 'all' ? `<div class="card" style="padding:18px;cursor:pointer;border-top:3px solid #b91c1c"
      data-action="dashboard-nav-email"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Unread Email</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#fee2e2;color:#b91c1c;display:flex;align-items:center;justify-content:center">${Icon({ n: 'email2', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#c41230;line-height:1;margin-bottom:6px">${unread}</div>
      <div style="font-size:11px;color:#9ca3af">in your inbox</div>
    </div>`: ''}
  </div>

  <!-- ══ MAIN GRID ══ -->
  <div style="display:grid;grid-template-columns:1fr 300px;gap:18px;margin-bottom:18px">

    <!-- Leads This Week — daily bar chart -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <h3 style="font-size:14px;font-weight:700;margin:0 0 2px;font-family:Syne,sans-serif">
            Leads This Week${B !== 'all' ? ' — ' + B : ''}
          </h3>
          <p style="font-size:11px;color:#9ca3af;margin:0">${weekLabel} · ${weekLeads.length} total</p>
        </div>
        <button data-action="dashboard-nav-leads" class="btn-g" style="font-size:11px">View all →</button>
      </div>

      <!-- Day bars -->
      <div style="display:flex;gap:8px;align-items:flex-end;height:140px;padding-bottom:24px;position:relative">
        ${weekDayLeads.map(d => {
        const barH = maxDayLeads > 0 ? Math.max(Math.round(d.total / maxDayLeads * 110), d.total > 0 ? 10 : 0) : 0;
        const colBase = activeBranch.col !== '#1a1a1a' ? activeBranch.col : '#c41230';
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
            ${d.total > 0 ? `<span style="font-size:11px;font-weight:700;color:#1a1a1a">${d.total}</span>` : '<span style="font-size:11px;color:#d1d5db">0</span>'}
            <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:110px">
              ${d.total > 0 ? `<div style="width:100%;border-radius:5px 5px 0 0;overflow:hidden">
                ${d.conv > 0 ? `<div style="height:${Math.round(d.conv / d.total * barH)}px;background:#7c3aed;min-height:4px"></div>` : ''}
                ${d.qual > 0 ? `<div style="height:${Math.round(d.qual / d.total * barH)}px;background:#fde68a;min-height:4px"></div>` : ''}
                ${d.new > 0 ? `<div style="height:${Math.round(d.new / d.total * barH)}px;background:${colBase};min-height:4px"></div>` : ''}
              </div>`: `<div style="width:100%;height:3px;background:#f3f4f6;border-radius:3px"></div>`}
            </div>
            <span style="font-size:10px;font-weight:${d.isToday ? 700 : 400};color:${d.isToday ? colBase : '#9ca3af'}">${d.day}</span>
            ${d.isToday ? `<div style="width:4px;height:4px;border-radius:50%;background:${colBase}"></div>` : ``}
          </div>`;
      }).join('')}
      </div>

      <!-- Legend -->
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${[['New', activeBranch.col !== '#1a1a1a' ? activeBranch.col : '#c41230'], ['Qualified', '#fde68a'], ['Converted', '#7c3aed']].map(([l, c]) =>
        `<div style="display:flex;align-items:center;gap:5px">
            <div style="width:10px;height:10px;border-radius:2px;background:${c}"></div>
            <span style="font-size:11px;color:#6b7280">${l}</span>
          </div>`).join('')}
      </div>
    </div>

    <!-- 🏆 Leaderboard -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
          🏆 ${now.toLocaleDateString('en-AU', { month: 'short' })} Leaders${B !== 'all' ? ' (' + B + ')' : ''}
        </h3>
        <button data-action="dashboard-nav-reports" class="btn-g" style="font-size:11px">Report →</button>
      </div>

      ${leaderboard.length === 0
      ? `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">
            <div style="font-size:28px;margin-bottom:8px">🏆</div>
            No won deals this month${B !== 'all' ? ' for ' + B : ''}
          </div>`
      : leaderboard.map((rep, i) => `
        <div style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div style="font-size:14px;font-weight:800;color:${i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#d1d5db'};width:18px;text-align:center;flex-shrink:0">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
            <div style="width:28px;height:28px;border-radius:50%;background:${rep.col};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rep.initials}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${rep.name}</div>
              <div style="font-size:10px;color:#9ca3af">${rep.count} deal${rep.count !== 1 ? 's' : ''}</div>
            </div>
            <div style="font-size:13px;font-weight:800;font-family:Syne,sans-serif;color:#1a1a1a;flex-shrink:0">${fmt$(rep.val)}</div>
          </div>
          <div style="margin-left:54px;height:5px;background:#f0f0f0;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.round(rep.val / maxRepVal * 100)}%;background:${rep.col};border-radius:3px"></div>
          </div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ══ ROW 2: Sales vs Pipeline + Activity ══ -->
  <div style="display:grid;grid-template-columns:1fr 280px;gap:18px;margin-bottom:18px">

    <!-- Sales vs Pipeline by rep (branch-filtered) -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
          Sales vs Pipeline${B !== 'all' ? ' — ' + B : ''} · ${monthKey}
        </h3>
      </div>
      ${(() => {
      const repsInBranch = REP_BASES.filter(r => B === 'all' || r.branch === B);
      const maxBar = Math.max(...repsInBranch.map(r => {
        const w = bDeals.filter(d => d.rep === r.name && d.won && inMonth(d.wonDate)).reduce((s, d) => s + d.val, 0);
        const p = bDeals.filter(d => d.rep === r.name && !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
        return Math.max(w, p);
      }), 1);
      return repsInBranch.map(r => {
        const wonV = bDeals.filter(d => d.rep === r.name && d.won && inMonth(d.wonDate)).reduce((s, d) => s + d.val, 0);
        const pipeV = bDeals.filter(d => d.rep === r.name && !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
        if (wonV === 0 && pipeV === 0) return '<div style="font-size:12px;color:#d1d5db;padding:4px 0">' + r.name.split(' ')[0] + ': no activity</div>';
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:24px;height:24px;border-radius:50%;background:${r.col};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${r.avatar}</div>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
                <span style="font-weight:600">${r.name.split(' ')[0]}</span>
                <span style="color:#9ca3af">${wonV > 0 ? fmt$(wonV) + ' won' : ''}${pipeV > 0 ? ' · ' + fmt$(pipeV) + ' pipeline' : ''}</span>
              </div>
              <div style="height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;display:flex">
                ${wonV > 0 ? `<div style="width:${Math.round(wonV / maxBar * 100)}%;background:${r.col};border-radius:4px 0 0 4px"></div>` : ''}
                ${pipeV > 0 ? `<div style="width:${Math.round(pipeV / maxBar * 100)}%;background:${r.col}55;border-radius:${wonV === 0 ? '4px' : '0'} 4px 4px ${wonV === 0 ? '4px' : '0'}"></div>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
    })()}
      <div style="display:flex;gap:14px;margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0">
        <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:8px;border-radius:2px;background:#c41230"></div><span style="font-size:11px;color:#6b7280">Won this month</span></div>
        <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:8px;border-radius:2px;background:#c4123055"></div><span style="font-size:11px;color:#6b7280">Pipeline</span></div>
      </div>
    </div>

    <!-- Recent activity -->
    <div class="card" style="padding:18px">
      <h3 style="font-size:14px;font-weight:700;margin:0 0 12px;font-family:Syne,sans-serif">Recent Activity</h3>
      ${recentActs.length === 0 ? `<div style="color:#9ca3af;font-size:13px;padding:20px 0;text-align:center">No recent activity</div>` : ''}
      ${recentActs.map((act, i) => `
        <div style="display:flex;gap:8px;padding:7px 0;${i < recentActs.length - 1 ? 'border-bottom:1px solid #f9fafb' : ''};cursor:pointer"
          data-action="dashboard-view-activity" data-act-type="${act._et}" data-act-id="${act._id}"
          onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
          <div style="width:24px;height:24px;border-radius:50%;background:${act.type === 'email' ? '#ede9fe' : act.type === 'call' ? '#dbeafe' : '#f3f4f6'};display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0">${AICON[act.type] || '📌'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${act.subject || act.text?.slice(0, 40) || act.type}</div>
            <div style="font-size:10px;color:#9ca3af">${act._title} · ${act.date}</div>
          </div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ══ ROW 3: Active pipeline table ══ -->
  <div class="card" style="overflow:hidden">
    <div style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
        Active Pipeline${B !== 'all' ? ' — ' + B : ' — All Branches'}
      </h3>
      <button data-action="dashboard-nav-deals" class="btn-g" style="font-size:11px">View kanban →</button>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f9fafb">
        <th class="th">Deal</th>
        <th class="th">Contact</th>
        <th class="th">Branch</th>
        <th class="th">Stage</th>
        <th class="th" style="text-align:right">Value</th>
        <th class="th">Owner</th>
        <th class="th"></th>
      </tr></thead>
      <tbody>
        ${bDeals.filter(d => !d.won && !d.lost).slice(0, 8).map(d => {
      const c = contacts.find(x => x.id === d.cid);
      const pl = PIPELINES.find(p => p.id === d.pid);
      const st = pl ? pl.stages.find(s => s.id === d.sid) : null;
      const bc = { 'VIC': '#1d4ed8', 'SA': '#059669', 'ACT': '#7c3aed' }[d.branch] || '#9ca3af';
      return `<tr style="cursor:pointer" data-action="dashboard-view-deal" data-deal-id="${d.id}"
            onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
            <td class="td">
              <div style="font-size:13px;font-weight:600">${d.title}</div>
              <div style="font-size:11px;color:#9ca3af">${d.suburb || ''}</div>
            </td>
            <td class="td" style="font-size:12px;color:#374151">${c ? c.fn + ' ' + c.ln : '—'}</td>
            <td class="td">
              <span style="font-size:11px;font-weight:700;color:${bc};background:${bc}18;padding:2px 8px;border-radius:8px">${d.branch}</span>
            </td>
            <td class="td">${st ? `<span class="bdg" style="background:${st.col}22;color:${st.col};border:1px solid ${st.col}44;font-size:11px">${st.name}</span>` : '—'}</td>
            <td class="td" style="font-size:14px;font-weight:700;text-align:right">${fmt$(d.val)}</td>
            <td class="td" style="font-size:12px;color:#6b7280">${d.rep.split(' ')[0]}</td>
            <td class="td" data-action="dashboard-stop-propagation">
              <button data-action="dashboard-email-deal" data-deal-id="${d.id}" style="width:24px;height:24px;border-radius:6px;background:#ede9fe;border:none;cursor:pointer;font-size:11px" title="Email">✉️</button>
            </td>
          </tr>`;
    }).join('')}
        ${bDeals.filter(d => !d.won && !d.lost).length === 0 ? `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No active deals${B !== 'all' ? ' in ' + B : ''}</td></tr>` : ''}
      </tbody>
    </table>
  </div>`;
}
