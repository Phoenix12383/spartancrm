// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 13-leads-maps.js
// Extracted from original index.html lines 9683-10707
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// FIX 2 — LEADS INBOX
// ══════════════════════════════════════════════════════════════════════════════

const LEAD_SRC_COLOR={'Web Enquiry':'blue',Phone:'purple',Referral:'green','Walk-in':'amber',Instagram:'indigo',Facebook:'indigo',Other:'gray'};
const LEAD_STATUS_COLOR={New:'blue',Contacted:'amber',Qualified:'green',Unqualified:'gray',Archived:'gray'};

// ── Add Lead drawer ───────────────────────────────────────────────────────────
function openAddLeadDrawer() {
  setState({panel:{type:'addLead'}});
}
function closeAddLeadDrawer() {
  setState({panel:null});
}

// Persistent Google Maps (mock) element kept alive across renderPage innerHTML
// rebuilds. The leads panel renders an empty slot div (#leadsMapSlot); after
// each render we re-parent the long-lived #google-map element into the slot
// and call refreshMapData() to update markers. This avoids re-initialising
// the map (and losing focus/selection state) on unrelated re-renders.
var _leadsMapEl = null;
function mountLeadsGoogleMap() {
  var slot = document.getElementById('leadsMapSlot');
  if (!slot) return;
  if (typeof window.initGoogleMaps !== 'function') return;

  if (!_leadsMapEl) {
    // Fresh mount — clear any residual content (e.g. the mock's DOM left
    // behind when real Google Maps takes over post-load) then create a new
    // #google-map element and initialise.
    slot.innerHTML = '';
    _leadsMapEl = document.createElement('div');
    _leadsMapEl.id = 'google-map';
    _leadsMapEl.style.cssText = 'height:100%;width:100%';
    slot.appendChild(_leadsMapEl);
    try { window.initGoogleMaps('google-map'); } catch(e) { console.warn('[leads-map] init failed', e); }
  } else if (_leadsMapEl.parentNode !== slot) {
    slot.appendChild(_leadsMapEl);
  }
  if (typeof window.refreshMapData === 'function') {
    try { window.refreshMapData(); } catch(e) { console.warn('[leads-map] refresh failed', e); }
  }
}

// ── MOBILE: LEADS — vertical card list ────────────────────────────────────────
// Header (title + count + Add button) → search → status filter pills →
// vertical card list. No map panel (desktop's 480px column doesn't fit on
// a phone). Cards reuse the same visual language as the deals/today screens.
function renderLeadsMobile() {
  var st = getState();
  var leads = st.leads || [];
  var emailSent = st.emailSent || [];
  var statusColors = { New:'#3b82f6', Contacted:'#f59e0b', Qualified:'#22c55e', Unqualified:'#9ca3af', Archived:'#6b7280' };
  var statuses = ['All','New','Contacted','Qualified','Unqualified','Archived'];

  var branchFilter = st.branch || 'all';
  var leadsForBranch = leads.filter(function(l){ return branchFilter === 'all' || l.branch === branchFilter; });

  var q = (leadSearch || '').toLowerCase();
  var filtered = leadsForBranch.filter(function(l){
    var matchStatus = leadFilter === 'All' ? !l.converted : l.status === leadFilter;
    if (!matchStatus) return false;
    if (!q) return true;
    return ((l.fn || '') + ' ' + (l.ln || '')).toLowerCase().indexOf(q) >= 0
        || (l.email || '').toLowerCase().indexOf(q) >= 0
        || (l.suburb || '').toLowerCase().indexOf(q) >= 0;
  });

  var statusCounts = {
    All: leadsForBranch.filter(function(l){ return !l.converted && l.status !== 'Archived'; }).length
  };
  leadsForBranch.forEach(function(l){ statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

  function _esc(s) { return String(s||'').replace(/'/g, "\\'"); }
  function _attrEsc(s) { return String(s||'').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function fmtK(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + Math.round(v/1000) + 'k';
    return '$' + v.toFixed(0);
  }
  function _initials(name) {
    return (name || '').split(' ').map(function(w){ return (w[0] || '').toUpperCase(); }).join('').slice(0,2);
  }

  function leadCard(l) {
    var col = statusColors[l.status] || '#9ca3af';
    var fullName = ((l.fn || '') + ' ' + (l.ln || '')).trim() || '—';
    var addr = (l.suburb || '') + (l.state ? ' · ' + l.state : '') + (l.postcode ? ' ' + l.postcode : '');
    var sent = emailSent.filter(function(m){ return m.leadId === l.id || (l.email && m.to === l.email); });
    return '<button onclick="setState({leadDetailId:\'' + _esc(l.id) + '\',page:\'leads\'})" style="width:100%;background:#fff;border-radius:12px;padding:12px;border:none;cursor:pointer;text-align:left;font-family:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:8px">' +
      // Top row — avatar / name+addr / value+status
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:#c41230;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0">' + _initials(fullName) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;color:#0a0a0a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + fullName + '</div>' +
          '<div style="font-size:11px;color:#6b7280;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (addr || '—') + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
          (l.val ? '<div style="font-size:13px;font-weight:800;font-family:Syne,sans-serif;color:#0a0a0a">' + fmtK(l.val) + '</div>' : '') +
          '<span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;background:' + col + '20;color:' + col + ';border:1px solid ' + col + '40;margin-top:3px">' + (l.status || '—') + '</span>' +
        '</div>' +
      '</div>' +
      // Bottom row — owner / source / email count
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:8px;margin-top:8px">' +
        '<div style="display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden">' +
          (l.owner
            ? '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">👤 ' + l.owner + '</span>'
            : '<span style="background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:8px;font-weight:700;border:1px solid #fde68a">Unassigned</span>') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
          (l.source ? '<span>' + l.source + '</span>' : '') +
          (sent.length > 0 ? '<span title="emails sent">✉ ' + sent.length + '</span>' : '') +
          (l.converted ? '<span style="color:#15803d;font-weight:700">✓ Converted</span>' : '') +
        '</div>' +
      '</div>' +
    '</button>';
  }

  return '' +
    // Header chrome — pulled to edges with negative margin so it sits flush
    // against the topbar (matches the Today screen and Deals page patterns).
    '<div style="margin:-12px -12px 12px;background:#fff;padding:12px 16px;border-bottom:1px solid #f0f0f0">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
        '<div>' +
          '<h1 style="font-size:18px;font-weight:800;margin:0;color:#0a0a0a;font-family:Syne,sans-serif">Leads</h1>' +
          '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + statusCounts.All + ' active</div>' +
        '</div>' +
        '<button onclick="openAddLeadDrawer()" style="padding:6px 12px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ Add</button>' +
      '</div>' +
      // Search
      '<input id="leadSearchInput" value="' + _attrEsc(leadSearch) + '" oninput="leadSearch=this.value;renderPage()" placeholder="Search name, email, suburb…" style="width:100%;padding:8px 12px;background:#f3f4f6;border:none;border-radius:8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:8px" />' +
      // Status filter pills — horizontal scroll so they all fit on narrow screens
      '<div style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px">' +
        statuses.map(function(s){
          var c = statusColors[s] || '#9ca3af';
          var active = leadFilter === s;
          var count = statusCounts[s] || 0;
          return '<button onclick="leadFilter=\'' + _esc(s) + '\';renderPage()" style="flex-shrink:0;padding:5px 12px;border-radius:14px;border:1px solid ' + (active ? c : '#e5e7eb') + ';background:' + (active ? c + '20' : '#fff') + ';color:' + (active ? c : '#6b7280') + ';font-size:11px;font-weight:' + (active ? 700 : 600) + ';cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;white-space:nowrap">' + s + '<span style="font-size:9px;background:' + (active ? c : '#e5e7eb') + ';color:' + (active ? '#fff' : '#6b7280') + ';border-radius:8px;padding:1px 5px;font-weight:700">' + count + '</span></button>';
        }).join('') +
      '</div>' +
    '</div>' +
    // Cards
    (filtered.length === 0
      ? '<div style="padding:30px 20px;text-align:center;background:#fff;border-radius:12px;color:#9ca3af;font-size:13px;font-style:italic">No leads found</div>'
      : filtered.map(leadCard).join('')) +
    // Add-lead drawer reuses the existing component
    (getState().panel && getState().panel.type === 'addLead' ? renderAddLeadDrawer() : '');
}

function renderLeads(){
  const {leads,leadDetailId,emailSent}=getState();
  const statusColors={New:'#3b82f6',Contacted:'#f59e0b',Qualified:'#22c55e',Unqualified:'#9ca3af',Archived:'#6b7280'};
  if(leadDetailId) {
    // Brief 5 Phase 2: convertLead modal needs to render on the lead-
    // detail page (where the Convert button lives). Look up the lead
    // by leadDetailId, not by modal.lid, so the modal still works if
    // the user navigates to a different lead while it's open (rare,
    // but: closing modal on any nav is the alternative if we ever see
    // breakage from this).
    const _detailLead = leads.find(function (l) { return l.id === leadDetailId; });
    const _modal = getState().modal;
    return renderLeadDetail()
      + (getState().editingLeadId ? renderEditLeadDrawer() : '')
      + (_modal && _modal.type === 'convertLead' && _detailLead ? renderConvertLeadModal(_detailLead) : '');
  }

  // Native wrapper: mobile-specific card list. The desktop layout uses a
  // grid-template-columns:1fr 480px with a hard-coded 480px map panel,
  // which can't fit on a phone — render a vertical card list instead.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
    return renderLeadsMobile();
  }

  const statuses=['All','Unassigned','New','Contacted','Qualified','Unqualified','Archived'];
  // Additional colour used for the Unassigned pseudo-status filter pill.
  const statusColors_SKIP={New:'#3b82f6',Contacted:'#f59e0b',Qualified:'#22c55e',Unqualified:'#9ca3af',Archived:'#6b7280',Unassigned:'#f59e0b'};

  // Header branch filter — applied to the list, the status count tabs, and
  // the unscheduled-leads panel so all three stay in sync with the map.
  const branchFilter = getState().branch || 'all';
  const matchBranch = l => branchFilter === 'all' || l.branch === branchFilter;
  const leadsForBranch = leads.filter(matchBranch);

  // Unassigned filter scope: leads with no owner that the current user can
  // claim (state-matched). Non-sales roles see ALL unassigned leads in the
  // branch so admins/managers can reassign them.
  const _cu = getCurrentUser();
  const canClaimHere = l => !!_cu && (_cu.role === 'admin' ||
    ((_cu.role === 'sales_rep' || _cu.role === 'sales_manager')
     && getUserStates(_cu).indexOf(l.state) >= 0));

  const filtered=leadsForBranch.filter(l=>{
    const matchStatus = leadFilter==='All' ? !l.converted
      : leadFilter==='Unassigned' ? (!l.owner && !l.converted && l.status!=='Archived' && canClaimHere(l))
      : l.status===leadFilter;
    const q=(leadSearch||'').toLowerCase();
    const matchQ=!q||(l.fn+' '+l.ln).toLowerCase().includes(q)||l.email.toLowerCase().includes(q)||(l.suburb||'').toLowerCase().includes(q);
    return matchStatus&&matchQ;
  });

  const statusCounts={
    All:leadsForBranch.filter(l=>!l.converted&&l.status!=='Archived').length,
    Unassigned:leadsForBranch.filter(l=>!l.owner&&!l.converted&&l.status!=='Archived'&&canClaimHere(l)).length,
  };
  leadsForBranch.forEach(l=>statusCounts[l.status]=(statusCounts[l.status]||0)+1);

  // Unscheduled leads (not yet booked as appointment) — branch-scoped.
  const scheduledLeadNames = new Set(MOCK_APPOINTMENTS.map(a=>a.client));
  const unscheduled = leadsForBranch.filter(l=>
    !l.converted && l.status!=='Archived' && l.status!=='Unqualified' &&
    !scheduledLeadNames.has(l.fn+' '+l.ln)
  );

  return `
  <div style="margin:-24px;background:#f8f9fa;min-height:calc(100vh - 56px);display:flex;flex-direction:column">

    <!-- Header -->
    <div style="background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <h1 style="font-size:20px;font-weight:800;margin:0;font-family:Syne,sans-serif">Leads Inbox</h1>
        <p style="color:#6b7280;font-size:12px;margin:0">${leadsForBranch.filter(l=>!l.converted&&l.status!=='Archived').length} active · ${leadsForBranch.filter(l=>l.status==='New').length} new · ${unscheduled.length} unscheduled${statusCounts.Unassigned?` · <span onclick="leadFilter='Unassigned';renderPage()" style="color:#92400e;font-weight:600;cursor:pointer;text-decoration:underline">${statusCounts.Unassigned} unclaimed in your state</span>`:''}</p>
      </div>

      <!-- Status filter pills -->
      <div style="display:flex;gap:4px;flex-wrap:wrap;flex:1">
        ${statuses.map(s=>{
          const col=statusColors[s]||(s==='Unassigned'?'#f59e0b':'#9ca3af');
          const act=leadFilter===s;
          return `<button onclick="leadFilter='${s}';renderPage()" style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;border:1px solid ${act?col:'#e5e7eb'};background:${act?col+'18':'#fff'};color:${act?col:'#6b7280'};font-size:11px;font-weight:${act?700:500};cursor:pointer;font-family:inherit">
            ${s} <span style="background:${act?col:'#e5e7eb'};color:${act?'#fff':'#6b7280'};border-radius:10px;font-size:9px;font-weight:700;padding:1px 6px">${statusCounts[s]||0}</span>
          </button>`;
        }).join('')}
      </div>

      <div style="display:flex;gap:8px;align-items:center">
        <div style="position:relative">
          <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none">${Icon({n:'search',size:12})}</span>
          <input id="leadSearchInput" class="inp" value="${leadSearch||''}" oninput="leadSearch=this.value;renderPage()" placeholder="Search…" style="padding-left:26px;font-size:12px;padding-top:6px;padding-bottom:6px;width:160px">
        </div>
        <button onclick="openAddLeadDrawer()" class="btn-r" style="font-size:12px;gap:5px;white-space:nowrap">${Icon({n:'plus',size:13})} Add Lead</button>
      </div>
    </div>

    <!-- Body: Leads list (left) + Scheduling map (right) -->
    <div style="display:grid;grid-template-columns:1fr 480px;flex:1;overflow:hidden;height:calc(100vh - 110px)">

      <!-- ── LEFT: Leads table ── -->
      <div style="overflow-y:auto;padding:16px">
        <div class="card" style="overflow:hidden">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f9fafb">
                <th class="th">Lead</th>
                <th class="th">Contact</th>
                <th class="th">Value</th>
                <th class="th">Status</th>
                <th class="th">Emails</th>
                <th class="th">Schedule</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length===0?`<tr><td colspan="6" style="padding:28px;text-align:center;color:#9ca3af;font-size:13px">No leads found</td></tr>`:''}
              ${filtered.map(l=>{
                const col=statusColors[l.status]||'#9ca3af';
                const sent=(emailSent||[]).filter(m=>m.leadId===l.id||m.to===l.email);
                const opened=sent.filter(m=>m.opened);
                const isScheduling=mapSchedulingLead===l.id;
                const isBooked=scheduledLeadNames.has(l.fn+' '+l.ln);
                return `<tr style="cursor:pointer;background:${isScheduling?'#fff5f6':''};transition:background .1s"
                  onclick="setState({leadDetailId:'${l.id}',page:'leads'})"
                  onmouseover="if(!${isScheduling})this.style.background='#fafafa'" onmouseout="if(!${isScheduling})this.style.background='${isScheduling?'#fff5f6':''}'">
                  <td class="td">
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:28px;height:28px;background:#c41230;border-radius:50%;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(l.fn+' '+l.ln)}</div>
                      <div>
                        <div style="font-size:13px;font-weight:600">${l.fn} ${l.ln}</div>
                        <div style="font-size:11px;color:#9ca3af">${l.suburb||''} ${l.state?'· '+l.state:''}</div>
                        ${l.owner
                          ? `<div style="font-size:10px;color:#6b7280;margin-top:2px">👤 ${l.owner}</div>`
                          : `<div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:6px;margin-top:3px">
                              <span class="bdg" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:10px">Unassigned</span>
                              ${canEditLead(l) ? `<button onclick="claimLead('${l.id}')" class="btn-r" style="font-size:10px;padding:2px 8px">Claim</button>` : ''}
                            </div>`}
                      </div>
                    </div>
                  </td>
                  <td class="td">
                    ${l.email?`<div style="font-size:11px;color:#3b82f6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${l.email}</div>`:''}
                    ${l.phone?`<div style="font-size:11px;color:#6b7280">${l.phone}</div>`:''}
                  </td>
                  <td class="td" style="font-size:13px;font-weight:700">${fmt$(l.val)}</td>
                  <td class="td">
                    <span class="bdg" style="background:${col}20;color:${col};border:1px solid ${col}40;font-size:10px">${l.status}</span>
                    ${l.converted?`<div style="font-size:10px;color:#15803d;margin-top:2px">✓ Converted</div>`:''}
                  </td>
                  <td class="td" onclick="event.stopPropagation()">
                    <div style="display:flex;align-items:center;gap:4px">
                      ${sent.length>0?`<span style="font-size:10px;${opened.length?'color:#15803d;background:#f0fdf4':'color:#9ca3af;background:#f3f4f6'};padding:1px 6px;border-radius:10px">👁${opened.length}/${sent.length}</span>`:''}
                      <button onclick="emailFromLead('${l.id}')" style="width:20px;height:20px;border-radius:50%;background:#ede9fe;border:none;cursor:pointer;font-size:10px" title="Email">✉️</button>
                    </div>
                  </td>
                  <td class="td" onclick="event.stopPropagation()">
                    ${l.converted?`<span style="font-size:10px;color:#15803d">✓ Done</span>`:
                      isBooked?`<span style="font-size:10px;color:#0369a1;background:#dbeafe;padding:2px 7px;border-radius:10px">📅 Booked</span>`:
                      `<button onclick="mapSchedulingLead='${l.id}';mapScheduleForm.rep='';renderPage()" class="btn-r" style="font-size:10px;padding:3px 10px;white-space:nowrap;${isScheduling?'background:#9e0e26':''}">
                        ${isScheduling?'Scheduling…':'📅 Schedule'}
                      </button>`}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── RIGHT: Scheduling Map Panel ── -->
      <div style="border-left:1px solid #e5e7eb;background:#fff;overflow-y:auto;display:flex;flex-direction:column">
        ${renderLeadsMapPanel(filtered, unscheduled)}
      </div>
    </div>
  </div>
  ${getState().panel&&getState().panel.type==='addLead'?renderAddLeadDrawer():''}
  ${getState().editingLeadId?renderEditLeadDrawer():''}`;
}

// ── Leads scheduling map panel ─────────────────────────────────────────────
function renderLeadsMapPanel(filtered, unscheduled) {
  const schedulingLead = mapSchedulingLead
    ? getState().leads.find(l=>l.id===mapSchedulingLead) : null;

  const dayApts = MOCK_APPOINTMENTS.filter(a=>a.date===mapSelectedDate);

  // Map centre follows the header branch filter when not scheduling a specific
  // lead. "All Branches" falls back to VIC. Used by the "Open full map" link
  // and as the fallback centre for the embedded map.
  const stBranch = (getState().branch && getState().branch !== 'all') ? getState().branch : 'VIC';
  const branch = schedulingLead ? schedulingLead.branch : stBranch;
  const branchCentre = branch==='SA'?[-34.93,138.60]:branch==='ACT'?[-35.28,149.13]:[-37.81,144.96];

  // Rep recommendations if scheduling a lead
  const repRecs = schedulingLead
    ? REP_BASES
        .map(r=>({...r, score:scoreRepForLead(r, schedulingLead), apts:dayApts.filter(a=>a.rep===r.name)}))
        .filter(r=>r.score>=0)
        .sort((a,b)=>b.score-a.score)
    : [];

  const unscheduledDisplay = unscheduled.slice(0,8);

  return `
  <!-- Panel header with date picker -->
  <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;background:#f9fafb">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif;color:#1a1a1a">
        ${schedulingLead?`📅 Scheduling: ${schedulingLead.fn} ${schedulingLead.ln}`:'📍 Scheduling Map'}
      </div>
      ${schedulingLead?`<button onclick="mapSchedulingLead=null;renderPage()" style="font-size:11px;color:#6b7280;background:none;border:none;cursor:pointer;font-family:inherit">✕ Cancel</button>`:''}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input type="date" value="${mapSelectedDate}" oninput="mapSelectedDate=this.value;renderPage()"
        class="inp" style="font-size:12px;padding:5px 8px;flex:1;min-width:120px">
      <select onchange="mapSelectedRep=this.value;renderPage()" class="sel" style="font-size:12px;padding:5px 8px;flex:1;min-width:100px">
        <option value="all">All Reps</option>
        ${REP_BASES.map(r=>`<option value="${r.name}" ${mapSelectedRep===r.name?'selected':''}>${r.name.split(' ')[0]}</option>`).join('')}
      </select>
    </div>
  </div>

  <!-- Leads Map (mounted imperatively — see mountLeadsGoogleMap) -->
  <div style="position:relative;border-bottom:1px solid #f0f0f0">
    <div id="leadsMapSlot" style="width:100%;height:350px;background:#f3f4f6"></div>

    <!-- Legend overlay -->
    <div style="position:absolute;top:8px;left:8px;background:rgba(255,255,255,.95);border-radius:8px;padding:8px 10px;box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:11px">
      ${REP_BASES.filter(r=>mapSelectedRep==='all'||r.name===mapSelectedRep).map(r=>{
        const cnt=dayApts.filter(a=>a.rep===r.name).length;
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <div style="width:10px;height:10px;border-radius:50%;background:${r.col};flex-shrink:0"></div>
          <span style="color:#374151">${r.name.split(' ')[0]}</span>
          <span style="color:#9ca3af">${cnt} appt${cnt!==1?'s':''}</span>
        </div>`;
      }).join('')}
    </div>

    <!-- Full map button -->
    <a href="https://www.google.com/maps/@${branchCentre[0]},${branchCentre[1]},11z" target="_blank" rel="noopener"
      style="position:absolute;bottom:6px;right:6px;font-size:10px;color:#0369a1;background:rgba(255,255,255,.9);padding:3px 8px;border-radius:6px;text-decoration:none;border:1px solid #bae6fd">
      Open full map ↗
    </a>
  </div>

  <!-- IF SCHEDULING A LEAD: Show recommendations -->
  ${schedulingLead?`
  <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">
      🎯 Rep Recommendations for ${schedulingLead.suburb}
    </div>
    ${repRecs.length===0?`<div style="font-size:12px;color:#9ca3af">No reps available in ${schedulingLead.branch}</div>`:''}
    ${repRecs.map((r,i)=>{
      const coords=getSuburbCoords(schedulingLead.suburb, schedulingLead.branch);
      const dist=haversine(r.lat,r.lng,coords.lat,coords.lng);
      const drive=estDriveTime(dist);
      const isSelected=mapScheduleForm.rep===r.name;
      return `<div onclick="mapScheduleForm.rep='${r.name}';renderPage()"
        style="padding:10px 12px;border-radius:10px;border:2px solid ${isSelected?r.col:'#e5e7eb'};background:${isSelected?r.col+'10':'#fff'};margin-bottom:7px;cursor:pointer;transition:all .15s"
        onmouseover="this.style.borderColor='${r.col}'" onmouseout="if(!${isSelected})this.style.borderColor='#e5e7eb'">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;background:${r.col};border-radius:50%;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${r.avatar}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;font-weight:600">${r.name}</span>
              ${i===0?`<span style="font-size:10px;background:#fef9c3;color:#92400e;padding:1px 7px;border-radius:10px;font-weight:700">Best fit</span>`:''}
            </div>
            <div style="display:flex;gap:10px;margin-top:3px;flex-wrap:wrap">
              <span style="font-size:11px;color:#6b7280">📍 ${Math.round(dist*10)/10}km away</span>
              <span style="font-size:11px;color:#6b7280">🚗 ~${drive} min drive</span>
              <span style="font-size:11px;color:#6b7280">📅 ${r.apts.length} appt${r.apts.length!==1?'s':''} today</span>
            </div>
            ${r.apts.length>0?`<div style="font-size:10px;color:#9ca3af;margin-top:2px">Next free: ${getNextFreeSlot(r.apts)}</div>`:'<div style="font-size:10px;color:#15803d;margin-top:2px">✓ Fully available today</div>'}
          </div>
          ${isSelected?`<div style="color:${r.col};font-size:18px;flex-shrink:0">✓</div>`:''}
        </div>
        ${isSelected?`
        <!-- Directions link -->
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${r.col}30;display:flex;gap:6px;flex-wrap:wrap">
          <a href="${buildDirectionsUrl(r, schedulingLead)}" target="_blank"
            style="font-size:11px;color:#0369a1;text-decoration:none;background:#dbeafe;padding:3px 10px;border-radius:8px;display:inline-flex;align-items:center;gap:4px">
            🗺 Get directions (${drive} min)
          </a>
          <a href="${buildDayRouteUrl(r.name, schedulingLead)}" target="_blank"
            style="font-size:11px;color:#15803d;text-decoration:none;background:#dcfce7;padding:3px 10px;border-radius:8px;display:inline-flex;align-items:center;gap:4px">
            📍 Plan full day route
          </a>
        </div>`:''}
      </div>`;
    }).join('')}

    <!-- Schedule form (shown when rep is selected) -->
    ${mapScheduleForm.rep?`
    <div style="background:#f9fafb;border-radius:10px;padding:14px;border:1px solid #e5e7eb;margin-top:8px">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px">Book Appointment</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:4px">Time</label>
          <select class="sel" style="font-size:12px" onchange="mapScheduleForm.time=this.value">
            ${['08:00','09:00','09:30','10:00','10:30','11:00','11:30','12:00','13:00','13:30','14:00','14:30','15:00','15:30','16:00'].map(t=>`<option value="${t}" ${mapScheduleForm.time===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:4px">Type</label>
          <select class="sel" style="font-size:12px" onchange="mapScheduleForm.type=this.value">
            ${['Measure','Quote','Consultation','Follow-up'].map(t=>`<option ${mapScheduleForm.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="bookLeadAppointment('${schedulingLead.id}')" class="btn-r" style="flex:1;font-size:12px;justify-content:center">
          ✓ Book ${mapScheduleForm.type}
        </button>
        <button onclick="mapScheduleForm.rep='';renderPage()" class="btn-w" style="font-size:12px">Back</button>
      </div>
    </div>`:''}
  </div>`:''}

  <!-- Unscheduled leads list -->
  <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">
      \u23f3 Unscheduled Leads (${unscheduled.length})
    </div>
    ${unscheduled.length===0?`<div style="font-size:12px;color:#9ca3af">All leads are scheduled \u2713</div>`:''}
    ${unscheduledDisplay.map(l=>{
      const coords=getSuburbCoords(l.suburb,l.branch);
      const isActive=mapSchedulingLead===l.id;
      const statusCol=(l.status==='Qualified'?'#22c55e':l.status==='Contacted'?'#f59e0b':'#3b82f6');
      return `<div onclick="mapSchedulingLead='${l.id}';mapScheduleForm.rep='';renderPage()"
        style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;margin-bottom:5px;cursor:pointer;border:1.5px solid ${isActive?'#c41230':'#e5e7eb'};background:${isActive?'#fff5f6':'#fff'};transition:all .15s"
        onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='${isActive?'#fff5f6':'#fff'}'">
        <div style="width:26px;height:26px;background:${statusCol};border-radius:50%;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(l.fn+' '+l.ln)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.fn} ${l.ln}</div>
          <div style="font-size:10px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\ud83d\udccd ${l.suburb} \u00b7 ${fmt$(l.val)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span style="font-size:10px;background:${statusCol}20;color:${statusCol};padding:1px 6px;border-radius:8px;font-weight:600">${l.status}</span>
        </div>
      </div>`;
    }).join('')}
    ${unscheduled.length>8?`<div style="font-size:11px;color:#9ca3af;text-align:center;margin-top:8px">+${unscheduled.length-8} more</div>`:''}
  </div>

  <!-- NEARBY LEADS (when scheduling a specific lead) -->
  ${schedulingLead?`
  <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;background:#fefce8">
    <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">
      \ud83d\udccd Also Nearby — Book Same Day
    </div>
    <div style="font-size:11px;color:#92400e;margin-bottom:8px">These leads are close to ${schedulingLead.fn} ${schedulingLead.ln} in ${schedulingLead.suburb}</div>
    ${renderNearbyLeadsList(schedulingLead, 4)}
  </div>`:''}

  <!-- SMART SCHEDULE CLUSTERS -->
  ${!schedulingLead?`
  <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">
      \ud83e\udde0 Smart Schedule Suggestions
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Leads grouped by area for less driving. Click a lead to schedule.</div>
    ${renderSmartScheduleClusters(getState().branch)}
  </div>`:''}

  <!-- Today's appointments -->
  <div style="padding:14px 16px">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">
      📋 Today's Schedule (${dayApts.filter(a=>mapSelectedRep==='all'||a.rep===mapSelectedRep).length} appointments)
    </div>
    ${dayApts.filter(a=>mapSelectedRep==='all'||a.rep===mapSelectedRep).sort((a,b)=>a.time>b.time?1:-1).map(apt=>{
      const rep=REP_BASES.find(r=>r.name===apt.rep);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f9fafb">
        <div style="font-size:12px;font-weight:700;color:#1a1a1a;min-width:40px">${apt.time}</div>
        <div style="width:8px;height:8px;border-radius:50%;background:${rep?rep.col:'#9ca3af'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${apt.client}</div>
          <div style="font-size:10px;color:#9ca3af">📍 ${apt.suburb} · ${apt.rep.split(' ')[0]} · ${apt.type}</div>
        </div>
        <a href="${buildDirectionsUrlFromApt(apt)}" target="_blank"
          style="font-size:10px;color:#3b82f6;text-decoration:none;padding:2px 7px;border:1px solid #bfdbfe;border-radius:6px;white-space:nowrap">
          Directions
        </a>
      </div>`;
    }).join('') || '<div style="font-size:12px;color:#9ca3af">No appointments today</div>'}
  </div>`;
}

// ── Helper: get next free time slot for a rep ──────────────────────────────
function getNextFreeSlot(apts) {
  const times=['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'];
  const bookedTimes=new Set(apts.map(a=>a.time));
  const free=times.find(t=>!bookedTimes.has(t));
  return free ? free : 'Fully booked';
}

// ── Helper: build Google Maps directions URL ────────────────────────────────
function buildDirectionsUrl(rep, lead) {
  const dest = encodeURIComponent(lead.suburb + ', ' + lead.state + ', Australia');
  const orig = encodeURIComponent(rep.suburb + ', Australia');
  return `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=driving`;
}
function buildDirectionsUrlFromApt(apt) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(apt.suburb+', Australia')}&travelmode=driving`;
}

// ── Helper: build full-day route URL for a rep ─────────────────────────────
function buildDayRouteUrl(repName, newLead) {
  const repApts = MOCK_APPOINTMENTS.filter(a=>a.rep===repName&&a.date===mapSelectedDate)
    .sort((a,b)=>a.time>b.time?1:-1);
  const stops = [
    ...repApts.map(a=>a.suburb+', Australia'),
    (newLead.suburb||'') + ', ' + (newLead.state||'') + ', Australia',
  ];
  if (stops.length===0) return '#';
  const dest = encodeURIComponent(stops[stops.length-1]);
  const waypoints = stops.slice(0,-1).map(s=>encodeURIComponent(s)).join('|');
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${waypoints}&travelmode=driving`;
}

// ── Book a lead appointment ────────────────────────────────────────────────
function bookLeadAppointment(leadId) {
  const lead = getState().leads.find(l=>l.id===leadId);
  if (!lead||!mapScheduleForm.rep) { addToast('Select a rep first','error'); return; }
  const rep = REP_BASES.find(r=>r.name===mapScheduleForm.rep);
  const coords = getSuburbCoords(lead.suburb, lead.branch);

  // Add to MOCK_APPOINTMENTS
  MOCK_APPOINTMENTS.push({
    id: 'ap_'+Date.now(),
    rep: mapScheduleForm.rep,
    repCol: rep ? rep.col : '#9ca3af',
    date: mapSelectedDate,
    time: mapScheduleForm.time,
    client: lead.fn+' '+lead.ln,
    suburb: lead.suburb||'',
    lat: coords.lat,
    lng: coords.lng,
    type: mapScheduleForm.type,
    status: 'Confirmed',
    leadId: leadId,
  });
  saveAppointments();

  // Log activity on the lead
  saveActivityToEntity(leadId, 'lead', {
    id: 'a'+Date.now(), type: 'meeting',
    text: mapScheduleForm.type+' booked with '+mapScheduleForm.rep+' on '+mapSelectedDate+' at '+mapScheduleForm.time,
    date: new Date().toISOString().slice(0,10),
    time: new Date().toTimeString().slice(0,5),
    by: (getCurrentUser()||{name:'Admin'}).name, done: false, dueDate: mapSelectedDate,
    scheduled: true,
  });

  // Update lead status to Contacted if New
  if (lead.status==='New') {
    setState({leads: getState().leads.map(l=>l.id===leadId?{...l,status:'Contacted'}:l)});
  }

  mapSchedulingLead = null;
  mapScheduleForm = {rep:'', time:'09:00', type:'Measure', notes:''};
  addToast(`✓ ${mapScheduleForm.type||'Appointment'} booked for ${lead.fn} ${lead.ln} on ${mapSelectedDate}`, 'success');
  renderPage();
}


// Open the Convert-to-Deal modal for a specific lead. Replaces the
// previous direct-convert flow (which silently auto-filled pipeline,
// stage, value, and skipped deal-type entirely). Brief 5 Phase 2:
// lead conversion now requires explicit dealType confirmation.
function openConvertLeadModal(lid) {
  var lead = getState().leads.find(function (l) { return l.id === lid; });
  if (!lead) return;
  if (lead.converted) { addToast('Already converted', 'warning'); return; }
  setState({ modal: { type: 'convertLead', lid: lid } });
}

// Brief 5 Phase 2: deal-type radio-card helper for the convert modal.
// Mirrors _ndDealTypeSelect from the New Deal modal — DOM-only update so
// the rest of the modal's field values aren't lost on click.
function _clDealTypeSelect(value) {
  document.querySelectorAll('.cl-dealtype-card').forEach(function (card) {
    var on = card.getAttribute('data-value') === value;
    card.style.borderColor = on ? '#c41230' : '#e5e7eb';
    card.style.background  = on ? '#fff5f6' : '#fff';
    var radio = card.querySelector('input[type="radio"]');
    if (radio) radio.checked = on;
  });
}

function renderConvertLeadModal(lead){
  if(!lead)return'';
  // Smart default: if the lead matches an existing contact and that
  // contact is commercial, pre-select Commercial. Residential contacts
  // and unmatched leads get no default — the user must click. This honours
  // "no silent default" from the brief while saving a click for the
  // common builder/body-corp follow-on case.
  var _matchedContact = _findMatchingContactForLead(lead, getState().contacts);
  var _suggested = (_matchedContact && _matchedContact.type === 'commercial') ? 'commercial' : null;
  var _resOn = _suggested === 'residential';
  var _comOn = _suggested === 'commercial';
  return `<div class="modal-bg" onclick="if(event.target===this)setState({modal:null})">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">Convert to Deal</h3>
        <button onclick="setState({modal:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({n:'x',size:16})}</button>
      </div>
      <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:14px">
        <div style="background:#f9fafb;border-radius:10px;padding:12px">
          <div style="font-size:14px;font-weight:600">${lead.fn} ${lead.ln}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px">${lead.suburb||''} · ${lead.source} · ${fmt$(lead.val)}</div>
          ${lead.notes?`<div style="font-size:12px;color:#9ca3af;margin-top:4px">${lead.notes}</div>`:''}
        </div>
        <div>
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:6px">Deal Type *</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label class="cl-dealtype-card" data-value="residential" onclick="_clDealTypeSelect('residential')" style="cursor:pointer;border:2px solid ${_resOn?'#c41230':'#e5e7eb'};border-radius:10px;padding:12px 14px;background:${_resOn?'#fff5f6':'#fff'};transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px">
              <span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1a1a1a">
                <input type="radio" name="cl_dealType" value="residential" ${_resOn?'checked':''} style="margin:0">
                Residential
              </span>
              <span style="font-size:11px;color:#6b7280;line-height:1.35">Single home, owner-occupied</span>
            </label>
            <label class="cl-dealtype-card" data-value="commercial" onclick="_clDealTypeSelect('commercial')" style="cursor:pointer;border:2px solid ${_comOn?'#c41230':'#e5e7eb'};border-radius:10px;padding:12px 14px;background:${_comOn?'#fff5f6':'#fff'};transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px">
              <span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1a1a1a">
                <input type="radio" name="cl_dealType" value="commercial" ${_comOn?'checked':''} style="margin:0">
                Commercial
              </span>
              <span style="font-size:11px;color:#6b7280;line-height:1.35">Builder, body corp, rental, retail</span>
            </label>
          </div>
          ${_suggested ? `<div style="font-size:11px;color:#6b7280;margin-top:6px">Suggested from matched contact (${_matchedContact.fn} ${_matchedContact.ln} · ${_matchedContact.type}). Confirm or change.</div>` : `<div style="font-size:11px;color:#9ca3af;margin-top:6px">Affects commission rules, reports, and routing.</div>`}
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Pipeline</label>
          <select class="sel" id="cl_pip">${PIPELINES.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Stage</label>
          <select class="sel" id="cl_stg">${PIPELINES[0].stages.filter(s=>!s.isLost&&!s.isWon).map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Deal Value ($)</label>
          <input class="inp" id="cl_val" type="number" min="0" step="any" value="${lead.val}">
          <div id="cl_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="setState({modal:null})">Cancel</button>
        <button class="btn-r" onclick="doConvertLead('${lead.id}')">Convert to Deal</button>
      </div>
    </div>
  </div>`;
}

// Match an existing contact to a lead using two rules (first hit wins):
//   1. Phone match — normalise to digits only, require ≥6 digits. Handles
//      "+61 412 345 678" == "0412 345 678" == "0412345678".
//   2. Email + last name match — email lowercase/trimmed, surname
//      lowercase/trimmed. Prevents the "shared family email" false-merge
//      (spouse submits form with partner's email → they become the same
//      contact) and the "typo in email, same person" miss.
// Returns the matching contact or null. Email-only match is intentionally
// NOT enough — too many families share one inbox.
function _findMatchingContactForLead(lead, contacts) {
  if (!lead || !Array.isArray(contacts)) return null;
  var leadPhoneDigits = (lead.phone || '').replace(/\D/g, '');
  if (leadPhoneDigits.length >= 6) {
    var byPhone = contacts.find(function(c) {
      var cd = (c.phone || '').replace(/\D/g, '');
      return cd.length >= 6 && cd === leadPhoneDigits;
    });
    if (byPhone) return byPhone;
  }
  var leadEmail = (lead.email || '').trim().toLowerCase();
  var leadLn    = (lead.ln    || '').trim().toLowerCase();
  if (leadEmail && leadLn) {
    var byEmailName = contacts.find(function(c) {
      var ce = (c.email || '').trim().toLowerCase();
      var cl = (c.ln    || '').trim().toLowerCase();
      return ce && cl && ce === leadEmail && cl === leadLn;
    });
    if (byEmailName) return byEmailName;
  }
  return null;
}

// Shared conversion logic — used by both direct button and modal.
// Brief 5 Phase 2: dealType is now a required parameter. Callers MUST
// pass 'residential' or 'commercial' — defaulting silently here would
// undermine the spec's "no silent default" requirement. Returns null
// without writing anything if dealType is missing or invalid.
function _executeLead2Deal(lid, pipId, stageId, val, dealType) {
  if (dealType !== 'residential' && dealType !== 'commercial') {
    addToast('Lead conversion is missing a deal type. Use the Convert modal.', 'error');
    return null;
  }
  const lead = getState().leads.find(l => l.id === lid);
  if (!lead) return;

  // Unassigned leads: the user doing the conversion implicitly claims the
  // lead so the resulting deal + contact have a real owner. Everything
  // downstream (rep, activities, contact.rep) uses this effective owner.
  const effectiveOwner = lead.owner || (getCurrentUser() || {name:'Admin'}).name;

  // Find or create contact — see _findMatchingContactForLead for rules.
  let cid = null;
  const existing = _findMatchingContactForLead(lead, getState().contacts);
  if (existing) {
    cid = existing.id;
  } else {
    cid = 'c' + Date.now();
    const newContact = {
      id: cid,
      fn: lead.fn, ln: lead.ln, co: '',
      email: lead.email || '', phone: lead.phone || '',
      street: lead.street || '', suburb: lead.suburb || '', state: lead.state || 'VIC',
      postcode: lead.postcode || '',
      source: lead.source, rep: effectiveOwner,
      branch: lead.branch || 'VIC', tags: ['new'],
    };
    setState({contacts: [newContact, ...getState().contacts]});
    dbInsert('contacts', contactToDb(newContact));
  }

  const dealId = 'd' + Date.now();
  const _typeLabel = dealType === 'commercial' ? 'Commercial' : 'Residential';
  const _createdAct = {
      id: 'a' + Date.now(),
      type: 'created',
      text: 'Deal created from lead (' + _typeLabel + '). Source: ' + lead.source + (lead.notes ? '. Notes: ' + lead.notes : ''),
      date: new Date().toISOString().slice(0, 10),
      by: effectiveOwner,
      done: false, dueDate: '',
  };
  const newDeal = {
    id: dealId,
    title: lead.fn + ' ' + lead.ln + (lead.suburb ? ' — ' + lead.suburb : ''),
    cid, pid: pipId, sid: stageId,
    val: val,
    rep: effectiveOwner,
    branch: lead.branch || 'VIC',
    suburb: lead.suburb || '',
    street: lead.street || '',
    postcode: lead.postcode || '',
    age: 0,
    won: false, lost: false, wonDate: null,
    created: new Date().toISOString().slice(0, 10),
    // Brief 5: deal-level type, captured at conversion time. The user picks
    // it in the Convert modal; the smart default seeded from a matched
    // contact's type doesn't bypass the explicit confirmation click.
    dealType: dealType,
    tags: [],
    activities: [_createdAct],
    cadData: lead.cadData || null, // Carry design from lead
    // Multi-quote fields (spec §3.1 final paragraph). Step 3: quotes transfer
    // verbatim from the lead — same ids, same content, same active selection.
    // Deep-clone each quote so the lead and deal arrays don't alias (future
    // edits on one must not leak into the other). wonQuoteId stays null — leads
    // never have one, and Step 4's won-flow will set it on the deal side.
    quotes: (lead.quotes || []).map(function(q){ return Object.assign({}, q); }),
    activeQuoteId: lead.activeQuoteId || null,
    wonQuoteId: null,
  };

  // Carry the lead's custom-field values across to the deal's equivalent
  // fields (matched by label + type, case-insensitive) so data captured via
  // web-enquiry doesn't get stranded on the archived lead.
  var s0 = getState();
  var leadFV = (s0.leadFieldValues || {})[lid] || {};
  var leadFields = s0.leadFields || [];
  var dealFields = s0.dealFields || [];
  var nextDealFV = Object.assign({}, s0.dealFieldValues || {});
  var targetMap = {};
  leadFields.forEach(function(lf) {
    var val = leadFV[lf.id];
    if (val === undefined || val === null || val === '') return;
    var match = dealFields.find(function(df) {
      return (df.label || '').toLowerCase() === (lf.label || '').toLowerCase() && df.type === lf.type;
    });
    if (match) targetMap[match.id] = val;
  });
  if (Object.keys(targetMap).length > 0) {
    nextDealFV[dealId] = Object.assign({}, nextDealFV[dealId] || {}, targetMap);
  }

  setState({
    deals: [newDeal, ...getState().deals],
    leads: getState().leads.map(l => l.id === lid
      ? {...l, owner: effectiveOwner, converted: true, status: 'Archived', dealRef: dealId}
      : l),
    dealFieldValues: nextDealFV,
    modal: null,
    // Navigate straight to the new deal so the user isn't left on the
    // now-archived lead view (which would filter out and bounce back to
    // the leads list).
    page: 'deals',
    dealDetailId: dealId,
    leadDetailId: null,
  });
  dbInsert('deals', dealToDb(newDeal));
  dbInsert('activities', actToDb(_createdAct, 'deal', dealId));
  dbUpdate('leads', lid, {owner: effectiveOwner, converted: true, status: 'Archived', deal_ref: dealId});
  addToast('✓ ' + lead.fn + ' ' + lead.ln + ' converted — deal created in pipeline', 'success');
  return dealId;
}

// Direct one-click convert: uses first pipeline, first stage, lead's own
// value. Brief 5 Phase 2: callers MUST now pass dealType ('residential'
// or 'commercial'). The user-facing button on lead detail no longer
// calls this directly — it opens the modal via openConvertLeadModal.
// Kept as a programmatic API for future bulk-convert / automation flows.
function directConvertLead(lid, dealType) {
  const lead = getState().leads.find(l => l.id === lid);
  if (!lead) return;
  if (lead.converted) { addToast('Already converted', 'warning'); return; }
  const pip = PIPELINES[0];
  const firstStage = pip.stages.filter(s => !s.isLost && !s.isWon).sort((a, b) => a.ord - b.ord)[0];
  return _executeLead2Deal(lid, pip.id, firstStage.id, lead.val, dealType);
}

// Modal-based convert (driven by renderConvertLeadModal). Brief 5 Phase
// 2: reads the dealType radio and hard-gates submission on it.
function doConvertLead(lid) {
  // Brief 5 Phase 2: deal type is required. Read from the checked radio
  // inside the card group; null if nothing picked.
  const dealTypeEl = document.querySelector('input[name="cl_dealType"]:checked');
  const dealType = dealTypeEl ? dealTypeEl.value : null;
  if (dealType !== 'residential' && dealType !== 'commercial') {
    addToast('Confirm whether this is a Residential or Commercial deal', 'error');
    return;
  }
  const pipId    = document.getElementById('cl_pip') ? document.getElementById('cl_pip').value : PIPELINES[0].id;
  const stageId  = document.getElementById('cl_stg') ? document.getElementById('cl_stg').value : PIPELINES[0].stages[0].id;
  const valEl    = document.getElementById('cl_val');
  const valErr   = document.getElementById('cl_val_err');
  const lead     = getState().leads.find(l => l.id === lid);
  // If the modal input is missing entirely, fall back to the lead's stored
  // value. When the input exists, validate — reject negatives rather than
  // silently falling back, so a typo gets noticed.
  let val;
  if (valEl) {
    const valV = validateDealValue(valEl.value);
    if (valErr) { valErr.style.display = valV.ok ? 'none' : 'block'; valErr.textContent = valV.error; }
    if (!valV.ok) { addToast(valV.error, 'error'); return; }
    val = valV.normalized;
  } else {
    val = lead ? lead.val : 0;
  }
  _executeLead2Deal(lid, pipId, stageId, val, dealType);
}


function renderAddLeadDrawer(){
  return `<div class="ovl" onclick="if(event.target===this)setState({panel:null})">
    <div class="panel" style="width:420px">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <h2 style="font-family:Syne,sans-serif;font-weight:700;font-size:16px;margin:0">Add Lead</h2>
        <button onclick="setState({panel:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({n:'x',size:16})}</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:13px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">First Name *</label><input class="inp" id="al_fn" placeholder="Jane"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Last Name *</label><input class="inp" id="al_ln" placeholder="Smith"></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Phone</label><input class="inp" id="al_phone" placeholder="0412 345 678"></div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Email</label><input class="inp" id="al_email" placeholder="jane@email.com"></div>
        ${mapsStatusBanner()}
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address <span style="font-size:10px;color:#9ca3af;font-weight:400">(type to search \u2014 AU addresses)</span></label><input class="inp" id="al_street" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label><input class="inp" id="al_suburb" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="al_state">${['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label><input class="inp" id="al_postcode" placeholder="3121"></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Estimated Value ($)</label><input class="inp" id="al_val" type="number" min="0" step="any" placeholder="15000">
          <div id="al_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Source</label>
            <select class="sel" id="al_source">${['Web Enquiry','Phone','Referral','Walk-in','Instagram','Facebook','Other'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Owner</label>
            <select class="sel" id="al_owner"><option value="">— Unassigned (any rep in state) —</option>${getUsers().filter(u=>u.active&&u.role!=='viewer').map(o=>`<option value="${o.name}">${o.name}</option>`).join('')}</select></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Notes</label>
          <textarea class="inp" id="al_notes" rows="3" placeholder="Notes about this lead…" style="resize:vertical;font-family:inherit"></textarea></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0">
        <button class="btn-w" onclick="setState({panel:null})">Cancel</button>
        <button class="btn-r" onclick="saveNewLead()">Save Lead</button>
      </div>
    </div>
  </div>`;
}

// ── Edit Lead drawer ──────────────────────────────────────────────────────
// Owner-or-admin only. Logs a single audit activity per save listing all
// changed fields with old → new values. Visible to everyone on the lead.

function openLeadEditDrawer(leadId) {
  var lead = getState().leads.find(function(l){ return l.id === leadId; });
  if (!lead) return;
  if (!canEditLead(lead)) { addToast('Only the owner or an admin can edit this lead', 'error'); return; }
  setState({ editingLeadId: leadId });
}

function renderEditLeadDrawer() {
  var id = getState().editingLeadId;
  var lead = getState().leads.find(function(l){ return l.id === id; });
  if (!lead) return '';
  return `<div class="ovl" onclick="if(event.target===this)setState({editingLeadId:null})">
    <div class="panel" style="width:420px">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <h2 style="font-family:Syne,sans-serif;font-weight:700;font-size:16px;margin:0">Edit Lead</h2>
        <button onclick="setState({editingLeadId:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({n:'x',size:16})}</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:13px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">First Name *</label><input class="inp" id="le_fn" value="${(lead.fn||'').replace(/"/g,'&quot;')}" placeholder="Jane"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Last Name *</label><input class="inp" id="le_ln" value="${(lead.ln||'').replace(/"/g,'&quot;')}" placeholder="Smith"></div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Phone</label>
          <input class="inp" id="le_phone" value="${(lead.phone||'').replace(/"/g,'&quot;')}" placeholder="0412 345 678">
          <div id="le_phone_err" style="font-size:11px;color:#b91c1c;margin-top:3px;display:none"></div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Email</label>
          <input class="inp" id="le_email" value="${(lead.email||'').replace(/"/g,'&quot;')}" placeholder="jane@email.com">
          <div id="le_email_err" style="font-size:11px;color:#b91c1c;margin-top:3px;display:none"></div>
        </div>
        ${mapsStatusBanner()}
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address <span style="font-size:10px;color:#9ca3af;font-weight:400">(type to search \u2014 AU addresses)</span></label><input class="inp" id="le_street" value="${(lead.street||'').replace(/"/g,'&quot;')}" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label><input class="inp" id="le_suburb" value="${(lead.suburb||'').replace(/"/g,'&quot;')}" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="le_state">${['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'].map(function(s){return '<option'+(lead.state===s?' selected':'')+'>'+s+'</option>';}).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label><input class="inp" id="le_postcode" value="${(lead.postcode||'').replace(/"/g,'&quot;')}" placeholder="3121"></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Estimated Value ($)</label><input class="inp" id="le_val" type="number" min="0" step="any" value="${lead.val||0}" placeholder="15000">
          <div id="le_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Source</label>
            <select class="sel" id="le_source">${['Web Enquiry','Phone','Referral','Walk-in','Instagram','Facebook','Other'].map(function(s){return '<option'+(lead.source===s?' selected':'')+'>'+s+'</option>';}).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Owner</label>
            <select class="sel" id="le_owner"><option value=""${!lead.owner?' selected':''}>— Unassigned (any rep in state) —</option>${getUsers().filter(function(u){return u.active&&u.role!=='viewer';}).map(function(o){return '<option value="'+o.name+'"'+(lead.owner===o.name?' selected':'')+'>'+o.name+'</option>';}).join('')}</select></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
          <select class="sel" id="le_branch">${['VIC','ACT','SA'].map(function(b){return '<option'+(lead.branch===b?' selected':'')+'>'+b+'</option>';}).join('')}</select></div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Notes</label>
          <textarea class="inp" id="le_notes" rows="3" placeholder="Notes about this lead…" style="resize:vertical;font-family:inherit">${(lead.notes||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0">
        <button class="btn-w" onclick="setState({editingLeadId:null})">Cancel</button>
        <button class="btn-r" onclick="saveLeadEdit()">Save Changes</button>
      </div>
    </div>
  </div>`;
}

function saveLeadEdit() {
  var id = getState().editingLeadId;
  var lead = getState().leads.find(function(l){ return l.id === id; });
  if (!lead) return;
  if (!canEditLead(lead)) { addToast('Only the owner or an admin can edit this lead', 'error'); return; }

  var fn = (document.getElementById('le_fn').value || '').trim();
  var ln = (document.getElementById('le_ln').value || '').trim();
  if (!fn || !ln) { addToast('First and last name are required', 'error'); return; }

  // Validate email + phone. Show inline error and abort if either fails.
  var emailEl = document.getElementById('le_email');
  var phoneEl = document.getElementById('le_phone');
  var emailErr = document.getElementById('le_email_err');
  var phoneErr = document.getElementById('le_phone_err');
  var emailV = validateEmail(emailEl.value);
  var phoneV = validateAuPhone(phoneEl.value);
  emailErr.style.display = emailV.ok ? 'none' : 'block';
  emailErr.textContent = emailV.error;
  phoneErr.style.display = phoneV.ok ? 'none' : 'block';
  phoneErr.textContent = phoneV.error;
  if (!emailV.ok || !phoneV.ok) { addToast('Please fix the highlighted fields', 'error'); return; }

  var valEl = document.getElementById('le_val');
  var valErr = document.getElementById('le_val_err');
  var valV = validateDealValue(valEl.value);
  if (valErr) { valErr.style.display = valV.ok ? 'none' : 'block'; valErr.textContent = valV.error; }
  if (!valV.ok) { addToast(valV.error, 'error'); return; }

  var state = document.getElementById('le_state').value;
  var streetVal = (document.getElementById('le_street').value || '').trim();
  var suburbVal = (document.getElementById('le_suburb').value || '').trim();
  // Same address requirement as saveNewLead — prevents stripping the address
  // off an existing lead by saving an edit with blank fields.
  if (!streetVal || !suburbVal) {
    addToast('Street and suburb are required so the lead can be scheduled on the map', 'error');
    return;
  }
  var next = {
    fn: fn,
    ln: ln,
    phone: phoneV.normalized,
    email: emailV.normalized,
    street: streetVal,
    suburb: suburbVal,
    state: state,
    postcode: (document.getElementById('le_postcode').value || '').trim(),
    val: valV.normalized,
    source: document.getElementById('le_source').value,
    owner: document.getElementById('le_owner').value,
    branch: document.getElementById('le_branch').value,
    notes: document.getElementById('le_notes').value || '',
  };

  // Diff against the original. Only fields that actually changed go into the
  // audit trail, so touching-and-not-changing a field doesn't create noise.
  var FIELD_LABELS = { fn:'First name', ln:'Last name', phone:'Phone', email:'Email',
    street:'Street', suburb:'Suburb', state:'State', postcode:'Postcode',
    val:'Value', source:'Source', owner:'Owner', branch:'Branch', notes:'Notes' };
  var changes = [];
  Object.keys(next).forEach(function(k) {
    var oldV = lead[k];
    var newV = next[k];
    // Normalise for comparison — treat undefined/null/'' as equivalent, and
    // numbers as strings so 15000 === '15000'.
    var oldStr = (oldV == null ? '' : String(oldV));
    var newStr = (newV == null ? '' : String(newV));
    if (oldStr !== newStr) {
      // Owner going to/from empty reads as "Unassigned" in the audit trail.
      var fromLabel = (k === 'owner' && !oldStr) ? 'Unassigned' : oldStr;
      var toLabel   = (k === 'owner' && !newStr) ? 'Unassigned' : newStr;
      changes.push({ field: k, label: FIELD_LABELS[k] || k, from: fromLabel, to: toLabel });
    }
  });

  if (changes.length === 0) {
    addToast('No changes to save', 'info');
    setState({ editingLeadId: null });
    return;
  }

  // Build the single audit activity.
  var user = getCurrentUser() || { name: 'Unknown' };
  var now = new Date();
  var dateStr = now.toISOString().slice(0,10);
  var timeStr = now.toTimeString().slice(0,5);
  var subject = user.name + ' edited ' + changes.length + ' field' + (changes.length !== 1 ? 's' : '');
  var text = changes.map(function(c) {
    return c.label + ': "' + c.from + '" → "' + c.to + '"';
  }).join('\n');
  var actObj = {
    id: 'a' + Date.now(),
    type: 'edit',
    subject: subject,
    text: text,
    by: user.name,
    date: dateStr,
    time: timeStr,
    done: false,
    // Store the diff structured so renderers can optionally format it richly.
    changes: changes,
  };

  // Patch the lead + prepend activity in one setState so we only re-render once.
  var updated = Object.assign({}, lead, next);
  updated.activities = [actObj].concat(lead.activities || []);
  setState({
    leads: getState().leads.map(function(l) { return l.id === id ? updated : l; }),
    editingLeadId: null,
  });
  // Persist the activity row alongside the lead (leads slice gets upserted via setState sync).
  try { dbInsert('activities', actToDb(actObj, 'lead', id)); } catch(e) {}

  // Audit (Brief 2 Phase 2). Group all field changes into a single entry.
  if (typeof appendAuditEntry === 'function') {
    var beforeObj = {}; var afterObj = {};
    changes.forEach(function (ch) { beforeObj[ch.field] = ch.from; afterObj[ch.field] = ch.to; });
    appendAuditEntry({
      entityType: 'lead', entityId: id, action: 'lead.field_edited',
      summary: 'Edited ' + (lead.fn||'') + ' ' + (lead.ln||'') + ' — ' + changes.length + ' field' + (changes.length !== 1 ? 's' : ''),
      before: beforeObj, after: afterObj,
      branch: updated.branch || null,
    });
  }

  addToast('Saved — ' + changes.length + ' field' + (changes.length !== 1 ? 's' : '') + ' updated', 'success');
}

function saveNewLead(){
  const fn=document.getElementById('al_fn')?.value.trim();
  const ln=document.getElementById('al_ln')?.value.trim();
  const street=document.getElementById('al_street')?.value.trim()||'';
  const suburb=document.getElementById('al_suburb')?.value.trim()||'';
  if(!fn||!ln){addToast('First and last name required','error');return;}
  // Require at least street + suburb so the lead geocodes to street level
  // (not the state centroid). Prevents unbookable "aaaa / aaaaa" leads.
  if(!street||!suburb){addToast('Street and suburb are required so the lead can be scheduled on the map','error');return;}
  const valEl=document.getElementById('al_val');
  const valErr=document.getElementById('al_val_err');
  const valV=validateDealValue(valEl?valEl.value:'');
  if(valErr){valErr.style.display=valV.ok?'none':'block';valErr.textContent=valV.error;}
  if(!valV.ok){addToast(valV.error,'error');return;}
  const st=document.getElementById('al_state')?.value||'VIC';
  const branch=st==='ACT'?'ACT':st==='SA'?'SA':'VIC';
  const nl={
    id:'l'+Date.now(),fn,ln,
    phone:document.getElementById('al_phone')?.value||'',
    email:document.getElementById('al_email')?.value||'',
    street:document.getElementById('al_street')?.value||'',
    suburb:document.getElementById('al_suburb')?.value||'',
    state:st,postcode:document.getElementById('al_postcode')?.value||'',
    val:valV.normalized,
    source:document.getElementById('al_source')?.value||'Web Enquiry',
    // Empty string = Unassigned (claimable by any rep in state). Picker
    // defaults to Unassigned so a webform/intake flow leaves it open.
    owner:(document.getElementById('al_owner')?.value)||'',
    branch,status:'New',
    notes:document.getElementById('al_notes')?.value||'',
    created:new Date().toISOString().slice(0,10),
    converted:false,dealRef:'',
    // Multi-quote fields (spec §3.1)
    quotes:[],activeQuoteId:null,wonQuoteId:null,
  };
  setState({leads:[nl,...getState().leads],modal:null,panel:null});
  dbInsert('leads', leadToDb(nl));
  addToast(fn+' '+ln+' added as new lead','success');
}


// ── MAIN RENDER ───────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// MAP VIEW — Salesperson appointment map
// ══════════════════════════════════════════════════════════════════════════════
let mapSelectedRep = 'all';
let mapSelectedDate = new Date().toISOString().slice(0,10);

// ── Lead filter state ─────────────────────────────────────────────────────────
// dashBranch removed — Dashboard, Reports, and the Leads map now all read
// from getState().branch (the header dropdown is the single source of truth).
let leadFilter = 'All';
let leadSearch  = '';
let selectedLeads = [];

// ── Map scheduling state ──────────────────────────────────────────────────────
const statusColors_SKIP={New:'#3b82f6',Contacted:'#f59e0b',Qualified:'#22c55e',Unqualified:'#9ca3af',Archived:'#6b7280'};
// Status colour map — used by leads, map page, and dashboard
let mapSchedulingLead = null;
let mapScheduleForm   = {rep:'', time:'09:00', type:'Measure', notes:''};
let mapView           = 'schedule';
let mapRouteRep       = null;


// Mock appointment data with real Melbourne/VIC suburbs and lat/lng
const MOCK_APPOINTMENTS = (function(){ try { return JSON.parse(localStorage.getItem('spartan_appointments')||'[]'); } catch(e){ return []; } })();
function saveAppointments() { localStorage.setItem('spartan_appointments', JSON.stringify(MOCK_APPOINTMENTS)); }


// ── Suburb → lat/lng lookup (AU suburbs used in leads/appointments) ────────────
const SUBURB_COORDS = {
  // VIC
  'Brighton':     {lat:-37.9063,lng:145.0023}, 'Camberwell':  {lat:-37.8466,lng:145.0597},
  'Toorak':       {lat:-37.8407,lng:145.0218}, 'Richmond':    {lat:-37.8236,lng:144.9994},
  'Hawthorn':     {lat:-37.8226,lng:145.0340}, 'South Yarra': {lat:-37.8393,lng:144.9920},
  'Box Hill':     {lat:-37.8199,lng:145.1224}, 'Docklands':   {lat:-37.8144,lng:144.9479},
  'Fitzroy':      {lat:-37.7995,lng:144.9784}, 'St Kilda':    {lat:-37.8676,lng:144.9808},
  'Prahran':      {lat:-37.8496,lng:144.9919}, 'Malvern':     {lat:-37.8594,lng:145.0313},
  'Kew':          {lat:-37.8091,lng:145.0334}, 'Essendon':    {lat:-37.7471,lng:144.9213},
  'Northcote':    {lat:-37.7745,lng:144.9981}, 'Brunswick':   {lat:-37.7676,lng:144.9619},
  'Footscray':    {lat:-37.8002,lng:144.8998}, 'Geelong':     {lat:-38.1499,lng:144.3617},
  'Balwyn':       {lat:-37.8139,lng:145.0876}, 'Glen Iris':   {lat:-37.8633,lng:145.0536},
  'Oakleigh':     {lat:-37.8989,lng:145.0954}, 'Coburg':      {lat:-37.7434,lng:144.9647},
  // SA
  'Glenelg':      {lat:-34.9802,lng:138.5147}, 'Burnside':    {lat:-34.9426,lng:138.6506},
  'Prospect':     {lat:-34.8866,lng:138.5925}, 'Norwood':     {lat:-34.9226,lng:138.6327},
  'Unley':        {lat:-34.9507,lng:138.5971}, 'Mitcham':     {lat:-35.0005,lng:138.6145},
  'Henley Beach': {lat:-34.9195,lng:138.4951}, 'Walkerville': {lat:-34.8871,lng:138.6336},
  'Blackwood':    {lat:-35.0209,lng:138.6002}, 'Stirling':    {lat:-35.0243,lng:138.7126},
  // ACT
  'Braddon':      {lat:-35.2777,lng:149.1407}, 'Kingston':    {lat:-35.3200,lng:149.1530},
  'Tuggeranong':  {lat:-35.4244,lng:149.0662}, 'Canberra':    {lat:-35.2809,lng:149.1300},
  'Belconnen':    {lat:-35.2389,lng:149.0612}, 'Woden':       {lat:-35.3484,lng:149.0891},
  'Gungahlin':    {lat:-35.1832,lng:149.1326}, 'Dickson':     {lat:-35.2503,lng:149.1434},
};

// Salesperson base locations (home suburb) and branch
const REP_BASES = [
  {name:'James Wilson',  col:'#c41230', branch:'VIC', suburb:'Fitzroy',     lat:-37.7995, lng:144.9784, avatar:'JW'},
  {name:'Sarah Chen',    col:'#1e40af', branch:'VIC', suburb:'Prahran',     lat:-37.8496, lng:144.9919, avatar:'SC'},
  {name:'Emma Brown',    col:'#059669', branch:'SA',  suburb:'Norwood',     lat:-34.9226, lng:138.6327, avatar:'EB'},
  {name:'Michael Torres',col:'#7c3aed', branch:'ACT', suburb:'Braddon',     lat:-35.2777, lng:149.1407, avatar:'MT'},
  {name:'David Kim',     col:'#d97706', branch:'VIC', suburb:'Box Hill',    lat:-37.8199, lng:145.1224, avatar:'DK'},
];

// Haversine distance in km between two lat/lng points
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Estimate drive time in minutes (assuming ~40 km/h average in metro)
function estDriveTime(km) {
  if (km < 2)  return 5;
  if (km < 5)  return Math.round(km * 3);
  if (km < 15) return Math.round(km * 2.5);
  return Math.round(km * 2);
}

// Get lat/lng for a suburb (fallback to branch centre)
function getSuburbCoords(suburb, branch) {
  if (SUBURB_COORDS[suburb]) return SUBURB_COORDS[suburb];
  // Fallback by branch
  if (branch === 'SA')  return {lat:-34.9287, lng:138.5999};
  if (branch === 'ACT') return {lat:-35.2809, lng:149.1300};
  return {lat:-37.8136, lng:144.9631}; // Melbourne CBD default
}

// ══════════════════════════════════════════════════════════════════════════════
// SMART SCHEDULING — Proximity clustering for efficient appointment booking
// ══════════════════════════════════════════════════════════════════════════════

function findNearbyLeads(targetLead, maxKm, excludeIds) {
  var leads = getState().leads.filter(function(l){ return !l.converted && l.status !== 'Archived'; });
  var targetCoords = getSuburbCoords(targetLead.suburb, targetLead.branch);
  if (!excludeIds) excludeIds = [];
  return leads
    .filter(function(l){ return l.id !== targetLead.id && excludeIds.indexOf(l.id) < 0 && l.branch === targetLead.branch; })
    .map(function(l){
      var coords = getSuburbCoords(l.suburb, l.branch);
      var dist = haversine(targetCoords.lat, targetCoords.lng, coords.lat, coords.lng);
      return { lead: l, distance: dist, driveTime: estDriveTime(dist) };
    })
    .filter(function(r){ return r.distance <= (maxKm || 15); })
    .sort(function(a,b){ return a.distance - b.distance; });
}

function clusterLeadsForScheduling(branchFilter) {
  var leads = getState().leads.filter(function(l){
    return !l.converted && l.status !== 'Archived' && (branchFilter === 'all' || l.branch === branchFilter);
  });
  var scheduledNames = new Set(MOCK_APPOINTMENTS.map(function(a){ return a.client; }));
  var unscheduled = leads.filter(function(l){ return !scheduledNames.has(l.fn + ' ' + l.ln); });
  if (unscheduled.length === 0) return [];
  var used = {};
  var clusters = [];
  var sorted = unscheduled.slice().sort(function(a,b){ return (b.val||0) - (a.val||0); });
  sorted.forEach(function(seed) {
    if (used[seed.id]) return;
    var cluster = [{ lead: seed, distance: 0, driveTime: 0 }];
    used[seed.id] = true;
    var nearby = findNearbyLeads(seed, 12, Object.keys(used));
    nearby.forEach(function(n) {
      if (cluster.length >= 5 || used[n.lead.id]) return;
      cluster.push(n);
      used[n.lead.id] = true;
    });
    var totalVal = cluster.reduce(function(s,c){ return s + (c.lead.val||0); }, 0);
    var totalDrive = cluster.reduce(function(s,c){ return s + c.driveTime; }, 0);
    var seedCoords = getSuburbCoords(seed.suburb, seed.branch);
    var bestRep = REP_BASES.filter(function(r){ return r.branch === seed.branch; })
      .map(function(r){ return { rep: r, dist: haversine(r.lat, r.lng, seedCoords.lat, seedCoords.lng) }; })
      .sort(function(a,b){ return a.dist - b.dist; })[0];
    clusters.push({ leads: cluster, centerSuburb: seed.suburb, branch: seed.branch, totalValue: totalVal, totalDriveTime: totalDrive, suggestedRep: bestRep ? bestRep.rep : null, repDistance: bestRep ? bestRep.dist : 0 });
  });
  return clusters.sort(function(a,b){ return b.totalValue - a.totalValue; });
}

function renderNearbyLeadsList(lead, maxResults) {
  var nearby = findNearbyLeads(lead, 15);
  if (nearby.length === 0) return '<div style="font-size:12px;color:#9ca3af;padding:8px 0">No nearby leads in ' + (lead.branch||'VIC') + '</div>';
  return nearby.slice(0, maxResults || 5).map(function(n) {
    var statusCol = n.lead.status==='Qualified'?'#22c55e':n.lead.status==='Contacted'?'#f59e0b':'#3b82f6';
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f9fafb;cursor:pointer" onclick="setState({leadDetailId:\''+n.lead.id+'\'})">'
      +'<div style="width:22px;height:22px;background:'+statusCol+';border-radius:50%;color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+avatar(n.lead.fn+' '+n.lead.ln)+'</div>'
      +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+n.lead.fn+' '+n.lead.ln+'</div>'
      +'<div style="font-size:10px;color:#9ca3af">\ud83d\udccd '+n.lead.suburb+' \u00b7 '+fmt$(n.lead.val)+'</div></div>'
      +'<div style="text-align:right;flex-shrink:0"><div style="font-size:11px;font-weight:700;color:#c41230">'+n.distance.toFixed(1)+'km</div>'
      +'<div style="font-size:10px;color:#9ca3af">~'+n.driveTime+'min</div></div></div>';
  }).join('');
}

function renderSmartScheduleClusters(branch) {
  var clusters = clusterLeadsForScheduling(branch || 'all');
  if (clusters.length === 0) return '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:16px">No unscheduled leads to cluster</div>';
  return clusters.slice(0, 6).map(function(cl, idx) {
    var rep = cl.suggestedRep;
    return '<div style="padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:8px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      +'<div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;font-weight:800;color:#fff;background:#c41230;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center">'+(idx+1)+'</span>'
      +'<span style="font-size:13px;font-weight:700">\ud83d\udccd '+cl.centerSuburb+' area</span></div>'
      +'<span style="font-size:11px;font-weight:700;color:#15803d">'+fmt$(cl.totalValue)+'</span></div>'
      +'<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">'
      +'<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#dbeafe;color:#1d4ed8;font-weight:600">'+cl.leads.length+' lead'+(cl.leads.length!==1?'s':'')+'</span>'
      +'<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#f3f4f6;color:#6b7280">\ud83d\ude97 ~'+cl.totalDriveTime+'min drive</span>'
      +(rep?'<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:'+rep.col+'15;color:'+rep.col+';font-weight:600">\u2605 '+rep.name.split(' ')[0]+' ('+cl.repDistance.toFixed(1)+'km)</span>':'')
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:3px">'
      +cl.leads.map(function(entry) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#f9fafb;border-radius:6px;font-size:11px;cursor:pointer" onclick="mapSchedulingLead=\''+entry.lead.id+'\';mapScheduleForm.rep=\'\';renderPage()">'
          +'<span style="font-weight:600">'+entry.lead.fn+' '+entry.lead.ln+'</span>'
          +'<span style="color:#9ca3af">\ud83d\udccd '+entry.lead.suburb+(entry.distance>0?' \u00b7 '+entry.distance.toFixed(1)+'km':'')+'</span></div>';
      }).join('')+'</div></div>';
  }).join('');
}

// Score a rep for a given lead (0-100, higher = better fit)
function scoreRepForLead(rep, lead) {
  // Branch match is mandatory
  if (rep.branch !== lead.branch) return -1;

  const coords = getSuburbCoords(lead.suburb, lead.branch);
  const distFromBase = haversine(rep.lat, rep.lng, coords.lat, coords.lng);

  // Check existing appointments on that day
  const dayApts = MOCK_APPOINTMENTS.filter(a =>
    a.rep === rep.name && a.date === mapSelectedDate
  );

  // Score based on distance from their last appointment (or base)
  let lastLat = rep.lat, lastLng = rep.lng;
  if (dayApts.length > 0) {
    const last = dayApts[dayApts.length - 1];
    const lc = getSuburbCoords(last.suburb, lead.branch);
    lastLat = lc.lat; lastLng = lc.lng;
  }

  const distFromLast = haversine(lastLat, lastLng, coords.lat, coords.lng);
  const workload = dayApts.length; // fewer = better

  // Score: closer = higher, fewer appointments = higher
  const distScore = Math.max(0, 50 - distFromLast * 2);
  const loadScore = Math.max(0, 30 - workload * 8);
  const branchScore = 20; // always gets this for same branch

  return Math.round(distScore + loadScore + branchScore);
}

// Scheduling state

function renderMap(){ return renderMapPage(); }

function renderMapPage(){
  const dayApts = MOCK_APPOINTMENTS.filter(a =>
    mapSelectedRep==='all' ? true : a.rep===mapSelectedRep
  ).filter(a => a.date===mapSelectedDate);

  const byRep = {};
  dayApts.forEach(a=>{ if(!byRep[a.rep]) byRep[a.rep]=[]; byRep[a.rep].push(a); });
  const allReps = [...new Set(MOCK_APPOINTMENTS.map(a=>a.rep))];

  // Map is mounted imperatively by mountScheduleGoogleMap() from 99-init's
  // post-render hook. Centring + marker filtering read mapSelectedRep/Date
  // directly, so no URL or iframe bbox needs to be computed here.

  // Unscheduled active leads
  const scheduledNames = new Set(MOCK_APPOINTMENTS.map(a=>a.client));
  const unscheduled = getState().leads.filter(l=>
    !l.converted && l.status!=='Archived' && l.status!=='Unqualified' &&
    !scheduledNames.has(l.fn+' '+l.ln)
  );

  return `
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px">
    <div>
      <h1 style="font-size:24px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">Schedule Map</h1>
      <p style="color:#6b7280;font-size:13px;margin:0">Optimise appointments by location \u00b7 ${dayApts.length} booked \u00b7 ${unscheduled.length} unscheduled leads</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input type="date" value="${mapSelectedDate}" oninput="mapSelectedDate=this.value;renderPage()"
        class="inp" style="font-size:13px;padding:7px 10px">
      <select onchange="mapSelectedRep=this.value;renderPage()" class="sel" style="font-size:13px;padding:7px 10px">
        <option value="all">All Reps</option>
        ${REP_BASES.map(r=>`<option value="${r.name}" ${mapSelectedRep===r.name?'selected':''}>${r.name.split(' ')[0]} (${r.branch})</option>`).join('')}
      </select>
      <button onclick="setState({page:'leads'})" class="btn-w" style="font-size:13px;gap:6px">${Icon({n:'user',size:14})} Leads</button>
    </div>
  </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 360px;gap:18px;align-items:start">

    <!-- LEFT: Big map + daily schedule -->
    <div style="display:flex;flex-direction:column;gap:16px">

      <!-- Map (mounted imperatively — see mountScheduleGoogleMap) -->
      <div class="card" style="overflow:hidden;position:relative">
        <div id="scheduleMapSlot" style="width:100%;height:440px;background:#f3f4f6"></div>

        <!-- Rep legend -->
        <div style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.96);border-radius:10px;padding:10px 14px;box-shadow:0 2px 12px rgba(0,0,0,.15)">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.06em;margin-bottom:8px">Reps today</div>
          ${REP_BASES.filter(r=>mapSelectedRep==='all'||r.name===mapSelectedRep).map(r=>{
            const cnt=MOCK_APPOINTMENTS.filter(a=>a.rep===r.name&&a.date===mapSelectedDate).length;
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
              <div style="width:11px;height:11px;border-radius:50%;background:${r.col}"></div>
              <span style="font-size:12px;font-weight:500">${r.name.split(' ')[0]}</span>
              <span style="font-size:11px;color:#9ca3af">${cnt} appt${cnt!==1?'s':''} · ${r.branch}</span>
            </div>`;
          }).join('')}
        </div>

        <!-- Date badge -->
        <div style="position:absolute;bottom:10px;left:10px;background:rgba(255,255,255,.95);border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;color:#374151;box-shadow:0 1px 6px rgba(0,0,0,.1)">
          ${new Date(mapSelectedDate+'T12:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}
        </div>
      </div>

      <!-- Full-day schedule table -->
      <div class="card" style="overflow:hidden">
        <div style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif">
            Daily Schedule — ${new Date(mapSelectedDate+'T12:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}
          </div>
          ${mapSelectedRep!=='all'?`<a href="https://www.google.com/maps/dir/${MOCK_APPOINTMENTS.filter(a=>a.rep===mapSelectedRep&&a.date===mapSelectedDate).sort((a,b)=>a.time>b.time?1:-1).map(a=>encodeURIComponent(a.suburb+' Australia')).join('/')}" target="_blank" class="btn-r" style="font-size:12px;text-decoration:none;gap:5px">${Icon({n:'map',size:13})} Full day route</a>`:''}
        </div>
        ${dayApts.length===0?`<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No appointments for this date. Schedule leads using the panel →</div>`:''}
        ${dayApts.sort((a,b)=>a.time>b.time?1:-1).map((apt,i)=>{
          const rep=REP_BASES.find(r=>r.name===apt.rep);
          const nextApt=dayApts.filter(a=>a.rep===apt.rep&&a.time>apt.time)[0];
          const coords=getSuburbCoords(apt.suburb,rep?rep.branch:'VIC');
          const nextCoords=nextApt?getSuburbCoords(nextApt.suburb,rep?rep.branch:'VIC'):null;
          const distToNext=nextCoords?haversine(coords.lat,coords.lng,nextCoords.lat,nextCoords.lng):0;
          const driveToNext=distToNext?estDriveTime(distToNext):0;
          return `<div style="display:flex;align-items:flex-start;gap:14px;padding:13px 18px;${i<dayApts.length-1?'border-bottom:1px solid #f9fafb':''}">
            <!-- Time + line -->
            <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:46px">
              <div style="font-size:13px;font-weight:700;color:#1a1a1a">${apt.time}</div>
              ${i<dayApts.length-1?`<div style="width:2px;background:#f0f0f0;flex:1;margin:4px 0;min-height:16px"></div>`:''}
            </div>
            <!-- Rep dot -->
            <div style="width:10px;height:10px;border-radius:50%;background:${rep?rep.col:'#9ca3af'};margin-top:4px;flex-shrink:0"></div>
            <!-- Content -->
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
                <div>
                  <div style="font-size:13px;font-weight:600">${apt.client}</div>
                  <div style="font-size:12px;color:#6b7280">📍 ${apt.suburb} · ${apt.type} · <span style="color:${rep?rep.col:'#9ca3af'}">${apt.rep.split(' ')[0]}</span></div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                  <span class="bdg" style="${apt.status==='Confirmed'?'background:#f0fdf4;color:#15803d':'background:#fef9c3;color:#92400e'}">${apt.status}</span>
                  <a href="${buildDirectionsUrlFromApt(apt)}" target="_blank" class="btn-g" style="font-size:11px;padding:3px 10px;text-decoration:none">Directions</a>
                </div>
              </div>
              ${nextApt&&nextApt.rep===apt.rep&&distToNext>0?`
              <div style="margin-top:5px;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:6px">
                <span>↓</span>
                <span>Drive to ${nextApt.suburb}: ~${driveToNext} min (${Math.round(distToNext*10)/10} km)</span>
              </div>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- RIGHT: Unscheduled leads + per-rep cards -->
    <div style="display:flex;flex-direction:column;gap:14px">

      <!-- Unscheduled leads -->
      <div class="card" style="overflow:hidden">
        <div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">⏳ Unscheduled (${unscheduled.length})</div>
          <button onclick="setState({page:'leads'})" class="btn-g" style="font-size:11px">Go to Leads</button>
        </div>
        ${unscheduled.length===0?`<div style="padding:16px;font-size:12px;color:#9ca3af;text-align:center">All leads scheduled ✓</div>`:''}
        <div style="max-height:280px;overflow-y:auto">
          ${unscheduled.slice(0,10).map(l=>{
            const sc={New:'#3b82f6',Contacted:'#f59e0b',Qualified:'#22c55e',Unqualified:'#9ca3af',Archived:'#6b7280'}[l.status]||'#9ca3af';
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #f9fafb;cursor:pointer"
              onclick="setState({page:'leads',leadDetailId:'${l.id}'})"
              onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
              <div style="width:26px;height:26px;background:${sc};border-radius:50%;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(l.fn+' '+l.ln)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.fn} ${l.ln}</div>
                <div style="font-size:11px;color:#9ca3af">📍 ${l.suburb} · ${fmt$(l.val)}</div>
              </div>
              <div style="flex-shrink:0">
                <button onclick="event.stopPropagation();setState({page:'leads',mapSchedulingLead:'${l.id}'})" class="btn-r" style="font-size:10px;padding:3px 9px;white-space:nowrap">📅 Schedule</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Per-rep breakdown -->
      ${REP_BASES.filter(r=>mapSelectedRep==='all'||r.name===mapSelectedRep).map(r=>{
        const rApts=MOCK_APPOINTMENTS.filter(a=>a.rep===r.name&&a.date===mapSelectedDate).sort((a,b)=>a.time>b.time?1:-1);
        return `<div class="card" style="overflow:hidden">
          <div style="padding:11px 14px;background:${r.col}12;border-bottom:1px solid ${r.col}30;display:flex;align-items:center;gap:8px">
            <div style="width:28px;height:28px;border-radius:50%;background:${r.col};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${r.avatar}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:700">${r.name}</div>
              <div style="font-size:11px;color:#6b7280">${rApts.length} appts · ${r.suburb} base · ${r.branch}</div>
            </div>
            ${rApts.length>0?`<a href="https://www.google.com/maps/dir/${rApts.map(a=>encodeURIComponent(a.suburb+' Australia')).join('/')}" target="_blank" style="font-size:11px;color:${r.col};text-decoration:none;border:1px solid ${r.col}50;padding:3px 8px;border-radius:8px;white-space:nowrap">Route</a>`:''}
          </div>
          ${rApts.length===0?`<div style="padding:10px 14px;font-size:12px;color:#9ca3af">Free all day</div>`:''}
          ${rApts.map(apt=>`
            <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #f9fafb">
              <div style="font-size:12px;font-weight:700;min-width:38px;color:#1a1a1a">${apt.time}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${apt.client}</div>
                <div style="font-size:11px;color:#9ca3af">📍 ${apt.suburb} · ${apt.type}</div>
              </div>
              <a href="${buildDirectionsUrlFromApt(apt)}" target="_blank" style="font-size:10px;color:#3b82f6;text-decoration:none;white-space:nowrap">Directions</a>
            </div>`).join('')}
          ${rApts.length>0?`<div style="padding:9px 14px">
            <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">Next free slot: ${getNextFreeSlot(rApts)}</div>
            <a href="https://www.google.com/maps/dir/${rApts.map(a=>encodeURIComponent(a.suburb+' Australia')).join('/')}" target="_blank" style="font-size:12px;color:${r.col};text-decoration:none;font-weight:500">🗺 Plan full route for ${r.name.split(' ')[0]}</a>
          </div>`:''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// renderPhonePage moved to modules/28-twilio.js as part of stage 5.
// The route in 99-init.js's pageRenderers map still points at `renderPhonePage`,
// which is now defined globally by 28-twilio.js (loaded later in the order).

