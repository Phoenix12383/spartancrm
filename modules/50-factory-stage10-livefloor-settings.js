// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 50-factory-stage10-livefloor-settings.js
// Live Floor View + Factory Settings.
//
//   renderLiveFloor()       → /livefloor
//   renderFactorySettings() → /factorysettings
//
// Live Floor View
//   Wall-display friendly. Auto-refreshes every 30 seconds while the page is
//   active. Top: floor metrics (frames in production, completed today,
//   issues, bottleneck). Per-station tile grid with current operator name
//   when present + frame in progress + load %. Right rail: alerts panel.
//
//   The setInterval that drives the refresh self-cleans: each tick checks
//   getState().page; if the user has navigated away from /livefloor, the
//   interval clears itself. This avoids leaked timers across navigation.
//
//   "Operator" + "today done/issues" metrics depend on Stage 7 operator log
//   (now removed). Both gracefully degrade to 0 / blank when the log is
//   empty — Live Floor still renders, just without operator-attributed data.
//
// Factory Settings
//   Single canonical store (spartan_factory_settings):
//     • Capacity & shifts: workHours/day, workDays/week
//     • Per-station daily capacity (mins) — overrides FACTORY_STATIONS_TIMES
//       baseline values (kept as runtime cache, not persisted to that const)
//
//   The Smart Planner weights and Operator hourly-rates sections were removed
//   2026-05-04 along with the Smart Planner (Stage 6) and Operator Tablet
//   (Stage 7) modules. Settings shape is preserved on read for forward-
//   compatibility with any retained `weights:{...}` localStorage rows.
//
// Page registration via SPARTAN_EXTRA_PAGES; sidebar entries: 📺 Live Floor,
// ⚙️ Factory Settings.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────
  defineAction('livefloor-refresh',          function() { renderPage(); });
  defineAction('livefloor-save-settings',    function() { saveAllFactorySettings(); });
  defineAction('livefloor-nav-sidebar',      function(target) {
    var patch = { page: target.dataset.page, dealDetailId: null, leadDetailId: null,
                  contactDetailId: null, jobDetailId: null };
    if (target.dataset.closeSidebar === '1') patch.sidebarOpen = false;
    setState(patch);
  });

  // ── Persistence ────────────────────────────────────────────────────────────
  function getFactorySettings() {
    try {
      var s = JSON.parse(localStorage.getItem('spartan_factory_settings') || 'null');
      return Object.assign({
        workHours:8, workDays:5,
        stationCaps:{},          // sid → mins/day override
      }, s || {});
    } catch(e) { return { workHours:8, workDays:5, stationCaps:{} }; }
  }
  function saveFactorySettings(s) {
    localStorage.setItem('spartan_factory_settings', JSON.stringify(s));
  }
  window.getFactorySettings  = getFactorySettings;
  window.saveFactorySettings = saveFactorySettings;

  // Operators (read-only) and operator log are kept for the Live Floor view's
  // graceful-degrade path — they return [] when Stage 7 data isn't present,
  // which is the post-2026-05-04 default state.
  function _getOperators()    { try { return JSON.parse(localStorage.getItem('spartan_operators') || '[]'); } catch(e) { return []; } }
  function _getOperatorLog()  { try { return JSON.parse(localStorage.getItem('spartan_operator_log') || '[]'); } catch(e) { return []; } }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE FLOOR VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  function renderLiveFloor() {
    // Set up auto-refresh. Tick fires every 30s; if the user has navigated
    // away from /livefloor, the tick clears the interval.
    if (window._liveFloorInterval) clearInterval(window._liveFloorInterval);
    window._liveFloorInterval = setInterval(function() {
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.page === 'livefloor') {
        if (typeof renderPage === 'function') renderPage();
      } else {
        clearInterval(window._liveFloorInterval);
        window._liveFloorInterval = null;
      }
    }, 30000);

    var items   = (typeof getFactoryItems  === 'function') ? getFactoryItems()  : [];
    var orders  = (typeof getFactoryOrders === 'function') ? getFactoryOrders() : [];
    var ops     = _getOperators();
    var log     = _getOperatorLog();
    var settings = getFactorySettings();

    var stations = (typeof FACTORY_STATIONS_TIMES !== 'undefined') ? FACTORY_STATIONS_TIMES : [];

    // Frames currently on the floor
    var onFloor = items.filter(function(it){return it.station !== 'complete' && !(it.qcPassedAt && it.station === 'dispatch');});

    // Today metrics
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var todayDone   = log.filter(function(e){return e.type === 'done'  && new Date(e.at) >= todayStart;}).length;
    var todayIssues = log.filter(function(e){return e.type === 'issue' && new Date(e.at) >= todayStart;}).length;

    // Bottleneck = the station with highest load %
    var stationLoads = stations.map(function(s) {
      var bucket = onFloor.filter(function(it) {
        if (typeof window.frameCurrentStation11 === 'function') return window.frameCurrentStation11(it, log) === s.id;
        return Object.keys(it.stationTimes || {}).indexOf(s.id) >= 0;
      });
      var loadMin = bucket.reduce(function(t, it){return t + (Number((it.stationTimes||{})[s.id]) || 0);}, 0);
      var cap = settings.stationCaps[s.id] || s.cap || 480;
      return { station:s, bucket:bucket, loadMin:loadMin, loadPct:Math.round(loadMin / Math.max(cap, 1) * 100) };
    });
    var bottleneck = stationLoads.slice().sort(function(a, b){return b.loadPct - a.loadPct;})[0];

    // Active operators (logged into tablet OR with an open 'start' event)
    var activeOps = {};
    for (var i = log.length - 1; i >= 0; i--) {
      var e = log[i];
      if (e.type === 'start' && !activeOps[e.operatorId + ':' + e.stationId]) {
        // Look forward for a closing event
        var closed = log.slice(i + 1).find(function(x){return x.frameId === e.frameId && x.stationId === e.stationId && (x.type === 'done' || x.type === 'pause');});
        if (!closed) activeOps[e.operatorId + ':' + e.stationId] = e;
      }
    }

    // Build header strip
    var nowTs = new Date().toLocaleTimeString('en-AU', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    var h = '<div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'
      + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:28px;margin:0">📺 Live Floor</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Auto-refreshing every 30 seconds · last update <strong>' + nowTs + '</strong></p></div>'
      + '<button data-action="livefloor-refresh" class="btn-w" style="font-size:11px">↻ Refresh now</button>'
      + '</div>';

    // KPI strip — bigger fonts for wall display
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Frames on Floor',  v:onFloor.length,                                         c:'#3b82f6' },
      { l:'Completed Today',  v:todayDone,                                               c:todayDone > 0 ? '#22c55e' : '#9ca3af' },
      { l:'Issues Today',     v:todayIssues,                                             c:todayIssues > 0 ? '#ef4444' : '#22c55e' },
      { l:'Bottleneck',       v:bottleneck ? bottleneck.station.name + ' ' + bottleneck.loadPct + '%' : '—',
        c:bottleneck && bottleneck.loadPct > 90 ? '#ef4444' : bottleneck && bottleneck.loadPct > 70 ? '#f59e0b' : '#22c55e' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:18px 22px;border-left:5px solid ' + k.c + '">'
        + '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:32px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px;line-height:1.1">' + k.v + '</div></div>';
    });
    h += '</div>';

    // Two-column layout: stations grid (left), alerts (right)
    h += '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;align-items:flex-start">';

    // ── Left: stations grid ──
    h += '<div>';
    if (!stations.length) {
      h += '<div class="card" style="padding:30px;text-align:center;color:#ef4444">FACTORY_STATIONS_TIMES not loaded.</div>';
    } else {
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">';
      stationLoads.forEach(function(sl) {
        var s = sl.station;
        // Find any operator working at this station right now
        var hereKey = Object.keys(activeOps).find(function(k){return k.split(':')[1] === s.id;});
        var here = hereKey ? activeOps[hereKey] : null;
        var op = here ? ops.find(function(o){return o.id === here.operatorId;}) : null;
        var frame = here ? items.find(function(i){return i.id === here.frameId;}) : null;
        var elapsed = here ? Math.round((Date.now() - new Date(here.at).getTime()) / 60000) : 0;

        var col = sl.loadPct > 90 ? '#ef4444' : sl.loadPct > 70 ? '#f59e0b' : '#22c55e';
        h += '<div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ' + s.col + ';border-radius:10px;padding:12px;min-height:130px">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">'
          + '<div style="font-weight:700;color:' + s.col + ';font-size:14px">' + s.name + '</div>'
          + '<span style="font-size:10px;background:' + col + '20;color:' + col + ';padding:2px 7px;border-radius:8px;font-weight:700">' + sl.loadPct + '%</span></div>'
          + '<div style="font-size:11px;color:#9ca3af;margin-top:2px">' + sl.bucket.length + ' frame' + (sl.bucket.length === 1 ? '' : 's') + ' queued · ' + sl.loadMin + 'min booked</div>'
          + (op ? '<div style="margin-top:10px;padding:8px 10px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0">'
              + '<div style="font-size:11px;font-weight:700;color:#166534">👷 ' + op.name + '</div>'
              + (frame ? '<div style="font-size:11px;color:#374151;margin-top:2px">Working ' + (frame.name || frame.id) + ' · ' + elapsed + 'min</div>' : '')
              + '</div>'
            : sl.bucket.length > 0
              ? '<div style="margin-top:10px;padding:8px 10px;background:#fef3c7;border-radius:6px;font-size:11px;color:#92400e">⏳ Queue waiting — no operator</div>'
              : '<div style="margin-top:10px;padding:8px 10px;background:#f9fafb;border-radius:6px;font-size:11px;color:#9ca3af">Idle</div>')
          + '</div>';
      });
      h += '</div>';
    }
    h += '</div>';

    // ── Right: alerts panel ──
    h += '<div>';
    var alerts = [];
    var todayIssuesArr = log.filter(function(e){return e.type === 'issue' && new Date(e.at) >= todayStart;}).slice(-5).reverse();
    todayIssuesArr.forEach(function(e) {
      var op = ops.find(function(o){return o.id === e.operatorId;});
      alerts.push({ kind:'issue', when:e.at, text:'Issue at ' + (function(){if (typeof FACTORY_STATIONS_TIMES === 'undefined') return e.stationId; var s = FACTORY_STATIONS_TIMES.find(function(x){return x.id === e.stationId;}); return s ? s.name : e.stationId;})() + ' (' + (op ? op.name : 'unknown') + ')' + (e.notes ? ': ' + e.notes : '') });
    });
    // Stock alerts — defer to Stage 2 if loaded
    if (typeof window.stockStatusOf === 'function' && typeof window.getStockItems === 'function') {
      var lowStock = getStockItems().filter(function(s){return window.stockStatusOf(s) === 'low' || window.stockStatusOf(s) === 'critical';}).slice(0, 5);
      lowStock.forEach(function(s) {
        alerts.push({ kind:'stock', when:null, text:'Low stock: ' + s.name + ' (' + s.onHand + ' ' + s.unit + ' on hand, reorder ' + s.reorderPoint + ')' });
      });
    }
    // Overdue POs — defer to Stage 3 / Stage 4 if loaded
    if (typeof window.getMaterialOrders === 'function') {
      var now = new Date();
      var overdue = window.getMaterialOrders().filter(function(o) {
        return ['sent','confirmed','dispatched'].indexOf(o.status) >= 0 && o.expectedAt && new Date(o.expectedAt) < now;
      }).slice(0, 5);
      overdue.forEach(function(o) {
        alerts.push({ kind:'po', when:o.expectedAt, text:'Overdue PO: ' + o.poNumber + ' (' + o.supplierName + ', expected ' + new Date(o.expectedAt).toLocaleDateString('en-AU') + ')' });
      });
    }

    h += '<div class="card" style="padding:0;overflow:hidden">'
      + '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;background:' + (alerts.length ? '#fef2f2' : '#f0fdf4') + '">'
      + '<h4 style="font-size:13px;font-weight:700;margin:0;color:' + (alerts.length ? '#b91c1c' : '#166534') + '">'
      + (alerts.length ? '⚠️ Alerts (' + alerts.length + ')' : '✅ No alerts') + '</h4></div>';

    if (!alerts.length) {
      h += '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">All quiet on the floor — no issues, stock OK, no overdue deliveries.</div>';
    } else {
      h += '<div style="max-height:540px;overflow-y:auto">';
      alerts.forEach(function(a, i) {
        var icon = a.kind === 'issue' ? '⚠️' : a.kind === 'stock' ? '📦' : '📥';
        var col  = a.kind === 'issue' ? '#ef4444' : a.kind === 'stock' ? '#f59e0b' : '#3b82f6';
        h += '<div style="padding:10px 14px;border-bottom:1px solid #f9fafb;font-size:12px;' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<div style="display:flex;gap:8px;align-items:flex-start">'
          + '<span style="font-size:14px">' + icon + '</span>'
          + '<div style="flex:1"><div style="color:' + col + ';font-weight:600">' + a.text + '</div>'
          + (a.when ? '<div style="font-size:10px;color:#9ca3af;margin-top:2px">' + new Date(a.when).toLocaleString('en-AU', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) + '</div>' : '')
          + '</div></div></div>';
      });
      h += '</div>';
    }
    h += '</div>';

    // Active orders summary
    var inProd = orders.filter(function(o){return o.status === 'in_production';}).length;
    var awaiting = orders.filter(function(o){return o.status === 'materials_ordered';}).length;
    h += '<div class="card" style="padding:14px 18px;margin-top:10px">'
      + '<h4 style="font-size:12px;font-weight:700;margin:0 0 8px;color:#374151">📋 Order Pipeline</h4>'
      + '<div style="font-size:11px;color:#6b7280;line-height:1.7">'
      + '<div>In Production: <strong style="color:#22c55e">' + inProd + '</strong></div>'
      + '<div>Awaiting Material: <strong style="color:#f59e0b">' + awaiting + '</strong></div>'
      + '<div>Total Active: <strong>' + orders.filter(function(o){return ['in_production','materials_ordered','received','bom_generated'].indexOf(o.status) >= 0;}).length + '</strong></div>'
      + '</div></div>';

    h += '</div>';   // close right col
    h += '</div>';   // close 2-col grid

    return '<div>' + h + '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTORY SETTINGS PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderFactorySettings() {
    var s = getFactorySettings();
    var stations = (typeof FACTORY_STATIONS_TIMES !== 'undefined') ? FACTORY_STATIONS_TIMES : [];

    var h = '<div style="margin-bottom:18px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">⚙️ Factory Settings</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Capacity, shift length, and per-station daily limits — read by the Capacity Planner and Live Floor.</p></div>';

    // ── Section 1: Capacity & Shifts ────────────────────────────────────────
    h += '<div class="card" style="padding:14px 18px;margin-bottom:12px">'
      + '<h4 style="font-size:13px;font-weight:700;margin:0 0 12px;font-family:Syne,sans-serif">⏰ Capacity & Shifts</h4>'
      + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;max-width:520px">'
      + '<div><label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Work hours per day</label>'
      + '<input id="fs_workHours" type="number" min="1" max="24" step="0.5" value="' + s.workHours + '" style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Work days per week</label>'
      + '<input id="fs_workDays" type="number" min="1" max="7" value="' + s.workDays + '" style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box"></div>'
      + '</div>'
      + '<div style="margin-top:10px;font-size:11px;color:#6b7280">Used by Smart Planner (capacity factor) and capacity bars throughout the floor views.</div>'
      + '</div>';

    // ── Section 2: Per-Station Capacity ────────────────────────────────────
    if (stations.length) {
      h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">'
        + '<div style="padding:12px 18px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:13px;font-weight:700;margin:0;font-family:Syne,sans-serif">🏭 Per-Station Capacity (mins/day)</h4>'
        + '<div style="font-size:11px;color:#6b7280;margin-top:2px">Override the default capacity for any station. Empty value uses the FACTORY_STATIONS_TIMES default.</div></div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Station</th><th class="th">Default Cap</th><th class="th">Staff</th><th class="th" style="width:140px">Override (mins/day)</th></tr></thead><tbody>';
      stations.forEach(function(stn, i) {
        var current = (s.stationCaps && s.stationCaps[stn.id]) ? s.stationCaps[stn.id] : '';
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td"><span style="color:' + stn.col + ';font-weight:600">' + stn.name + '</span> <span style="font-family:monospace;font-size:11px;color:#9ca3af">' + stn.id + '</span></td>'
          + '<td class="td">' + (stn.cap || 480) + ' min (' + (typeof formatMinutesAsHours === 'function' ? formatMinutesAsHours(stn.cap || 480, 'integer') : Math.round((stn.cap || 480) / 60) + 'h') + ')</td>'
          + '<td class="td">' + (stn.staff || 1) + '</td>'
          + '<td class="td"><input id="fs_cap_' + stn.id + '" type="number" min="0" placeholder="default" value="' + current + '" style="width:100%;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box"></td>'
          + '</tr>';
      });
      h += '</tbody></table></div>';
    }

    // ── Save button ─────────────────────────────────────────────────────────
    h += '<div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 0;position:sticky;bottom:0;background:#fff;border-top:1px solid #f0f0f0">'
      + '<button data-action="livefloor-refresh" class="btn-w" style="font-size:13px;padding:10px 20px">Cancel</button>'
      + '<button data-action="livefloor-save-settings" class="btn-r" style="font-size:13px;padding:10px 24px;font-weight:700">💾 Save All Settings</button>'
      + '</div>';

    return '<div>' + h + '</div>';
  }

  function saveAllFactorySettings() {
    var stations = (typeof FACTORY_STATIONS_TIMES !== 'undefined') ? FACTORY_STATIONS_TIMES : [];

    // 1. Capacity & shifts
    var workHours = parseFloat((document.getElementById('fs_workHours') || {}).value || 8);
    var workDays  = parseInt((document.getElementById('fs_workDays')  || {}).value || 5, 10);
    if (workHours <= 0 || workHours > 24) { addToast('Invalid work hours','error'); return; }
    if (workDays  <= 0 || workDays  > 7)  { addToast('Invalid work days','error'); return; }

    // 2. Station caps (override map)
    var stationCaps = {};
    stations.forEach(function(s) {
      var el = document.getElementById('fs_cap_' + s.id);
      if (el && el.value !== '' && Number(el.value) > 0) stationCaps[s.id] = Number(el.value);
    });

    saveFactorySettings({ workHours:workHours, workDays:workDays, stationCaps:stationCaps });
    addToast('Settings saved', 'success');
    renderPage();
  }
  window.saveAllFactorySettings = saveAllFactorySettings;

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION + SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.livefloor       = function() { return renderLiveFloor(); };
  window.SPARTAN_EXTRA_PAGES.factorysettings = function() { return renderFactorySettings(); };

  if (!window._SPARTAN_DASH_WRAPPED && typeof renderDashboard === 'function') {
    window._SPARTAN_DASH_WRAPPED = true;
    var _origDash = window.renderDashboard;
    window.renderDashboard = function() {
      var st = (typeof getState === 'function') ? getState() : {};
      var pageFn = window.SPARTAN_EXTRA_PAGES && window.SPARTAN_EXTRA_PAGES[st.page];
      if (typeof pageFn === 'function') return pageFn();
      return _origDash.apply(this, arguments);
    };
  }

  if (typeof window.renderSidebar === 'function' && !window._STAGE10_SIDEBAR_WRAPPED) {
    window._STAGE10_SIDEBAR_WRAPPED = true;
    var _origRenderSidebar = window.renderSidebar;
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      if (html.indexOf("setState({page:'livefloor'") >= 0) return html;
      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      function _entry(id, label, icon) {
        if (typeof canAccessPage === 'function' && !canAccessPage(id)) return '';
        var on = st.page === id;
        return '<div class="nav-item' + (on ? ' on' : '') + '" '
          + 'data-action="livefloor-nav-sidebar" data-page="' + id + '" data-close-sidebar="' + (native ? '1' : '0') + '" '
          + 'title="' + (!sidebarOpen ? label : '') + '">'
          + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">' + icon + '</span>'
          + (sidebarOpen ? '<span style="flex:1">' + label + '</span>' : '')
          + '</div>';
      }
      var injection = _entry('livefloor', 'Live Floor', '📺')
                    + _entry('factorysettings', 'Factory Settings', '⚙️');
      if (!injection) return html;

      // Insert after the last factory-nav entry. The renderSidebar in
      // 07-shared-ui.js uses data-page="<id>" attributes, so we anchor on
      // data-page="audit" (the final factoryNav item) and insert after its
      // closing </div>. The crmMode === 'factory' guard above ensures this
      // anchor is unambiguous for factory-mode renders.
      var anchor = 'data-page="audit"';
      var idx = html.indexOf(anchor);
      if (idx < 0) {
        // Fallback: prepend before the first nav-item if no audit anchor.
        var firstNav = html.indexOf('class="nav-item');
        if (firstNav < 0) return html;
        var divStart = html.lastIndexOf('<div', firstNav);
        return divStart < 0 ? html : html.slice(0, divStart) + injection + html.slice(divStart);
      }
      var insertAt = html.indexOf('</div>', idx) + '</div>'.length;
      return html.slice(0, insertAt) + injection + html.slice(insertAt);
    };
  }

  // ── Window exports ─────────────────────────────────────────────────────────
  window.renderLiveFloor       = renderLiveFloor;
  window.renderFactorySettings = renderFactorySettings;

  console.log('[50-factory-stage10-livefloor-settings] /livefloor and /factorysettings registered.');
})();
