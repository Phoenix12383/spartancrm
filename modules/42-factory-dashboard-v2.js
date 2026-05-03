// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 42-factory-dashboard-v2.js
// Stage 1 finishing touches: replaces the legacy 5-tile factory dashboard
// with the spec'd 6-KPI version (Jobs to Review, Today's Target, Today's Actual,
// Current Bottleneck, Stock Alerts, Material on Order). Each tile is clickable
// and routes to the relevant page.
//
// Drop-in module: load AFTER 16d-factory-pages.js so we replace its
// renderFactoryDash. All other factory pages (renderProdQueue, renderProdBoard,
// etc.) are left untouched.
//
// Defensively reads Stage 2 helpers (getStockItems, getMaterialOrders,
// stockStatusOf) — if they're not loaded, the relevant tiles show "—" rather
// than throwing.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  if (typeof renderFactoryDash !== 'function') {
    console.warn('[42-factory-dashboard-v2] Legacy renderFactoryDash not found — module loaded out of order. Expected to load after 16d-factory-pages.js.');
    return;
  }

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
  defineAction('factory-dash-nav-jobsreview', function(target, ev) {
    navigateTo('jobsreview');
  });
  defineAction('factory-dash-nav-factoryqc', function(target, ev) {
    navigateTo('factoryqc');
  });
  defineAction('factory-dash-nav-baymanagement', function(target, ev) {
    navigateTo('baymanagement');
  });
  defineAction('factory-dash-tile-click', function(target, ev) {
    var navTo = target.dataset.navigate;
    if (navTo) navigateTo(navTo);
  });
  defineAction('factory-dash-glass-order', function(target, ev) {
    var orderId = target.dataset.orderId;
    if (orderId) showGlassOrderModal(orderId);
  });
  defineAction('factory-dash-profile-order', function(target, ev) {
    var orderId = target.dataset.orderId;
    if (orderId) showProfileOrderModal(orderId);
  });
  defineAction('factory-dash-job-navigate', function(target, ev) {
    var jobId = target.dataset.jobId;
    if (jobId) navigateTo('jobs', {jobDetailId: jobId});
  });
  defineAction('factory-dash-review-job', function(target, ev) {
    var jobId = target.dataset.jobId;
    if (jobId) {
      setState({factoryReviewJobId: jobId});
      window._reviewTab = 'frames';
      navigateTo('jobsreview');
    }
  });
  defineAction('factory-dash-push-job', function(target, ev) {
    var jobId = target.dataset.jobId;
    if (jobId) pushJobToFactory(jobId);
  });
  defineAction('factory-dash-advance-order', function(target, ev) {
    var orderId = target.dataset.orderId;
    if (orderId) advanceFactoryOrder(orderId);
  });
  defineAction('factory-dash-sidebar-nav', function(target, ev) {
    var pageId = target.dataset.page;
    if (pageId) {
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      setState({
        page: pageId,
        dealDetailId: null,
        leadDetailId: null,
        contactDetailId: null,
        jobDetailId: null,
        sidebarOpen: native ? false : undefined
      });
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _isToday(iso) {
    if (!iso) return false;
    var d = new Date(iso); var t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }
  function _daysBetween(a, b) {
    return Math.round((new Date(a) - new Date(b)) / 86400000);
  }

  // Today's Target: frames in production whose install date is within
  // (stations_remaining) calendar days — i.e. they MUST advance today to make
  // the install. Uses the legacy 6-stage station list (cutting → milling →
  // welding → hardware → reveals → dispatch) so it doesn't depend on Stage 5
  // having shipped yet.
  var STATION_FLOW = ['cutting','milling','welding','hardware','reveals','dispatch'];
  function _todaysTarget(items) {
    var now = new Date(); now.setHours(0,0,0,0);
    return items.filter(function(it) {
      if (!it.due) return false;
      if (it.qcPassedAt) return false;
      var due = new Date(it.due); due.setHours(0,0,0,0);
      var daysToInstall = Math.round((due - now) / 86400000);
      var stationIdx = STATION_FLOW.indexOf(it.station);
      var stationsRemaining = stationIdx >= 0 ? STATION_FLOW.length - stationIdx : STATION_FLOW.length;
      // Frame must advance today if it has fewer (or equal) days than stations remaining
      return daysToInstall <= stationsRemaining && daysToInstall >= 0;
    }).length;
  }

  // Today's Actual: frames whose stationHistory has an entry stamped today
  function _todaysActual(items) {
    return items.filter(function(it) {
      var h = it.stationHistory || [];
      return h.some(function(e) { return _isToday(e.at); });
    }).length;
  }

  // Current Bottleneck: station with highest items/cap ratio (across all items
  // currently on the floor, not yet QC-passed)
  function _currentBottleneck(items) {
    if (typeof FACTORY_STATIONS === 'undefined') return null;
    var loads = FACTORY_STATIONS.map(function(s) {
      var n = items.filter(function(it){return it.station === s.id && !it.qcPassedAt;}).length;
      var pct = s.cap > 0 ? n / s.cap : 0;
      return { station:s, count:n, pct:pct };
    });
    loads.sort(function(a, b) { return b.pct - a.pct; });
    return loads[0] && loads[0].count > 0 ? loads[0] : null;
  }

  // Stock Alerts (defensive — Stage 2 not required)
  function _stockAlerts() {
    if (typeof getStockItems !== 'function' || typeof stockStatusOf !== 'function') return null;
    try {
      return getStockItems().filter(function(it) {
        var s = stockStatusOf(it);
        return s.key === 'low' || s.key === 'critical';
      }).length;
    } catch(e) { return null; }
  }

  // Material on Order (defensive — Stage 2 not required)
  function _materialOnOrder() {
    if (typeof getMaterialOrders !== 'function') return null;
    try {
      return getMaterialOrders().filter(function(o) {
        return ['sent','confirmed','dispatched'].indexOf(o.status) >= 0;
      }).length;
    } catch(e) { return null; }
  }

  // ── New 6-tile dashboard ───────────────────────────────────────────────────
  window.renderFactoryDash = function renderFactoryDash() {
    var orders   = getFactoryOrders();
    var items    = getFactoryItems();
    var jobs     = getState().jobs || [];
    var contacts = getState().contacts || [];
    var branch   = getState().branch || 'all';
    if (branch !== 'all') orders = orders.filter(function(o){return o.branch===branch;});

    // KPI source data
    var jobsToReview = jobs.filter(function(j) {
      return j.finalSignedAt && !j.productionStatus && !j.factoryHold
        && j.status !== 'h_completed_standard' && j.status !== 'i_cancelled';
    });
    var heldJobs   = jobs.filter(function(j){ return j.finalSignedAt && j.factoryHold && j.status !== 'h_completed_standard'; });
    var inFactory  = orders.filter(function(o){return o.status !== 'dispatched';});
    var dispatched = orders.filter(function(o){return o.status === 'dispatched';});

    var tgt        = _todaysTarget(items);
    var act        = _todaysActual(items);
    var bottleneck = _currentBottleneck(items);
    var stockAlerts= _stockAlerts();      // null if Stage 2 not loaded
    var matOnOrder = _materialOnOrder();  // null if Stage 2 not loaded

    // Header
    var h = '<div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">'
      + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">🏭 Factory CRM</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Production management — from signed-off designs through to dispatch</p></div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button data-action="factory-dash-nav-jobsreview" class="btn-w" style="font-size:11px">📋 Jobs to Review' + (jobsToReview.length ? ' <span style="background:#c41230;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px">' + jobsToReview.length + '</span>' : '') + '</button>'
      + '<button data-action="factory-dash-nav-factoryqc" class="btn-w" style="font-size:11px">✅ QC</button>'
      + '<button data-action="factory-dash-nav-baymanagement" class="btn-w" style="font-size:11px">🚛 Bays</button>'
      + '</div></div>';

    // ── 6 KPI tiles ────────────────────────────────────────────────────────────
    // Tile colour: red = action needed, green = healthy, orange = watch,
    // grey = neutral / unknown. Each tile is clickable.
    var tgtVsActCol = tgt === 0 ? '#22c55e' : (act >= tgt ? '#22c55e' : (act >= tgt * 0.5 ? '#f59e0b' : '#ef4444'));

    var tiles = [
      {
        label: 'Jobs to Review',
        value: jobsToReview.length,
        sub:   heldJobs.length > 0 ? heldJobs.length + ' on hold' : 'Awaiting PM review',
        col:   jobsToReview.length > 0 ? '#c41230' : '#22c55e',
        click: 'navigateTo(\'jobsreview\')',
      },
      {
        label: "Today's Target",
        value: tgt,
        sub:   'Frames must advance today',
        col:   tgt > 0 ? '#3b82f6' : '#9ca3af',
        click: 'navigateTo(\'prodboard\')',
      },
      {
        label: "Today's Actual",
        value: act,
        sub:   tgt > 0 ? Math.round(act / tgt * 100) + '% of target' : 'No target set',
        col:   tgtVsActCol,
        click: 'navigateTo(\'prodboard\')',
      },
      {
        label: 'Current Bottleneck',
        value: bottleneck ? (bottleneck.station.icon + ' ' + bottleneck.station.name.replace(' Inspection','').replace(' Assembly','').replace(' & Dispatch','')) : '—',
        sub:   bottleneck ? bottleneck.count + ' / ' + bottleneck.station.cap + ' (' + Math.round(bottleneck.pct * 100) + '%)' : 'All stations clear',
        col:   bottleneck && bottleneck.pct > 0.8 ? '#ef4444' : bottleneck && bottleneck.pct > 0.5 ? '#f59e0b' : '#22c55e',
        click: 'navigateTo(\'prodboard\')',
        big:   false, // smaller font since it's a name not a number
      },
      {
        label: 'Stock Alerts',
        value: stockAlerts === null ? '—' : stockAlerts,
        sub:   stockAlerts === null ? 'Stock module not enabled' : (stockAlerts === 0 ? 'All items healthy' : 'Low or critical items'),
        col:   stockAlerts === null ? '#9ca3af' : stockAlerts > 0 ? '#ef4444' : '#22c55e',
        click: stockAlerts === null ? null : 'navigateTo(\'stock\')',
      },
      {
        label: 'Material on Order',
        value: matOnOrder === null ? '—' : matOnOrder,
        sub:   matOnOrder === null ? 'Stock module not enabled' : 'POs in flight',
        col:   matOnOrder === null ? '#9ca3af' : matOnOrder > 0 ? '#3b82f6' : '#9ca3af',
        click: matOnOrder === null ? null : 'navigateTo(\'materialorders\')',
      },
    ];

    h += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px">';
    tiles.forEach(function(t) {
      var clickable = !!t.click;
      h += '<div ' + (clickable ? 'data-action="factory-dash-tile-click" data-navigate="' + t.click + '" ' : '')
        + 'style="padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;border-left:4px solid ' + t.col + ';'
        + (clickable ? 'cursor:pointer;transition:transform .15s,box-shadow .15s" onmouseenter="this.style.boxShadow=\'0 4px 14px #0000001a\';this.style.transform=\'translateY(-1px)\'" onmouseleave="this.style.boxShadow=\'\';this.style.transform=\'\'"' : '"')
        + '>'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">' + t.label + '</div>'
        + '<div style="font-size:' + (t.big === false ? '14px' : '24px') + ';font-weight:800;font-family:Syne,sans-serif;color:' + t.col + ';margin-top:6px;line-height:1.2">' + t.value + '</div>'
        + '<div style="font-size:10px;color:#9ca3af;margin-top:3px">' + t.sub + '</div>'
        + '</div>';
    });
    h += '</div>';

    // ── Station load row (preserved from legacy dashboard) ──────────────────
    if (typeof FACTORY_STATIONS !== 'undefined') {
      var stationLoad = {};
      FACTORY_STATIONS.forEach(function(s) {
        stationLoad[s.id] = items.filter(function(i){return i.station === s.id && !i.qcPassedAt;}).length;
      });
      h += '<div class="card" style="padding:16px;margin-bottom:16px"><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:12px">Station Load</div>'
        + '<div style="display:flex;gap:8px">';
      FACTORY_STATIONS.forEach(function(s) {
        var count = stationLoad[s.id] || 0;
        var pct = s.cap > 0 ? Math.round(count / s.cap * 100) : 0;
        var col = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : count > 0 ? '#22c55e' : '#d1d5db';
        h += '<div style="flex:1;text-align:center;padding:10px 6px;border-radius:8px;background:' + col + '10;border:1px solid ' + col + '30">'
          + '<div style="font-size:16px">' + s.icon + '</div>'
          + '<div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:' + col + '">' + count + '</div>'
          + '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + s.name + '</div>'
          + '<div style="font-size:8px;color:#9ca3af">cap: ' + s.cap + '/day</div>'
          + '</div>';
      });
      h += '</div></div>';
    }

    // ── Glass + Profile ordering protocol (preserved) ───────────────────────
    if (typeof getGlassAlerts === 'function') {
      var glassAlerts = getGlassAlerts(orders);
      var profileNotOrdered = orders.filter(function(o){return o.status!=='dispatched' && (o.profileStatus||'not_ordered')==='not_ordered';});
      var profileOrdered    = orders.filter(function(o){return o.profileStatus === 'ordered';});
      var profileReceived   = orders.filter(function(o){return o.profileStatus === 'received';});
      var glassUrgent  = glassAlerts.overdue.length + glassAlerts.dueThisWeek.length;
      var totalUrgent  = glassUrgent + profileNotOrdered.length;

      h += '<div class="card" style="padding:16px;margin-bottom:16px;border-left:4px solid ' + (totalUrgent > 0 ? '#ef4444' : '#22c55e') + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:' + (totalUrgent > 0 ? '12' : '0') + 'px">'
        + '<div><div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif">📦 Material Orders Protocol</div>'
        + '<div style="font-size:12px;color:#6b7280;margin-top:2px">Glass (3 weeks lead) + Aluplast Profiles — must be ordered before production</div></div>'
        + '<div style="display:flex;gap:4px;flex-wrap:wrap">'
        + '<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#ef444420;color:#ef4444;border:1px solid #ef444440">🪟 Glass Overdue: ' + glassAlerts.overdue.length + '</span>'
        + '<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#f59e0b20;color:#f59e0b;border:1px solid #f59e0b40">🪟 This Week: ' + glassAlerts.dueThisWeek.length + '</span>'
        + '<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#ef444420;color:#ef4444;border:1px solid #ef444440">📦 Profiles Not Ordered: ' + profileNotOrdered.length + '</span>'
        + '<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#3b82f620;color:#3b82f6;border:1px solid #3b82f640">📦 Ordered: ' + (glassAlerts.ordered.length + profileOrdered.length) + '</span>'
        + '<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#22c55e20;color:#22c55e;border:1px solid #22c55e40">✅ Received: ' + (glassAlerts.received.length + profileReceived.length) + '</span>'
        + '</div></div>';

      var urgentGlass = glassAlerts.overdue.concat(glassAlerts.dueThisWeek);
      var allUrgent = [];
      urgentGlass.forEach(function(o){ allUrgent.push(Object.assign({}, o, { urgentType:'glass' })); });
      profileNotOrdered.forEach(function(o) {
        if (!allUrgent.find(function(u){return u.id===o.id;})) allUrgent.push(Object.assign({}, o, { urgentType:'profile' }));
        else { var ex = allUrgent.find(function(u){return u.id===o.id;}); if (ex) ex.urgentType = 'both'; }
      });

      if (allUrgent.length > 0) {
        h += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
          + '<thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Frames</th><th class="th">Needs</th><th class="th"></th></tr></thead><tbody>';
        allUrgent.forEach(function(o) {
          var needsGlass   = (o.glassStatus||'not_ordered') === 'not_ordered';
          var needsProfile = (o.profileStatus||'not_ordered') === 'not_ordered';
          var needsStr     = (needsGlass ? '🪟 Glass ' : '') + (needsProfile ? '📦 Profiles' : '');
          h += '<tr style="background:#fef2f2">'
            + '<td class="td" style="font-weight:700;color:#c41230">' + o.jid + '</td>'
            + '<td class="td">' + o.customer + '</td>'
            + '<td class="td">' + o.frameCount + '</td>'
            + '<td class="td" style="font-weight:700;color:#ef4444">' + needsStr + '</td>'
            + '<td class="td" style="white-space:nowrap">'
            + (needsGlass   ? '<button data-action="factory-dash-glass-order" data-order-id="' + o.id + '" class="btn-r" style="font-size:9px;padding:2px 8px;margin-right:4px">🪟 Glass</button>' : '')
            + (needsProfile ? '<button data-action="factory-dash-profile-order" data-order-id="' + o.id + '" class="btn-r" style="font-size:9px;padding:2px 8px;background:#7c3aed">📦 Profiles</button>' : '')
            + '</td></tr>';
        });
        h += '</tbody></table>';
      }
      h += '</div>';
    }

    // ── Awaiting Production list ────────────────────────────────────────────
    if (jobsToReview.length > 0) {
      h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">'
        + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
        + '<h4 style="font-size:14px;font-weight:700;margin:0">⚡ Ready to Enter Production (' + jobsToReview.length + ')</h4>'
        + '<button data-action="factory-dash-nav-jobsreview" class="btn-w" style="font-size:11px;padding:4px 12px">Open Review Queue →</button>'
        + '</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Suburb</th><th class="th">Value</th><th class="th">Frames</th><th class="th">Signed</th><th class="th"></th></tr></thead><tbody>';
      jobsToReview.slice(0, 10).forEach(function(j, i) {
        var c = contacts.find(function(ct){return ct.id===j.contactId;});
        var frames = (j.cadFinalData || j.cadSurveyData || j.cadData || {}).projectItems || [];
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td" style="font-weight:700;color:#c41230"><span data-action="factory-dash-job-navigate" data-job-id="' + j.id + '" style="cursor:pointer;text-decoration:underline;text-underline-offset:2px">' + (j.jobNumber || j.id) + '</span></td>'
          + '<td class="td">' + (c ? c.fn + ' ' + c.ln : '—') + '</td>'
          + '<td class="td">' + (j.suburb || '') + '</td>'
          + '<td class="td" style="font-weight:600">$' + Number(j.val || 0).toLocaleString() + '</td>'
          + '<td class="td">' + frames.length + '</td>'
          + '<td class="td">' + (j.finalSignedAt ? new Date(j.finalSignedAt).toLocaleDateString('en-AU') : '—') + '</td>'
          + '<td class="td">'
          + '<button data-action="factory-dash-review-job" data-job-id="' + j.id + '" class="btn-r" style="font-size:10px;padding:4px 10px">Review →</button>'
          + ' <button data-action="factory-dash-push-job" data-job-id="' + j.id + '" style="font-size:10px;padding:4px 10px;background:none;border:1px solid #c41230;color:#c41230;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:600">🏭 Send</button>'
          + '</td></tr>';
      });
      if (jobsToReview.length > 10) {
        h += '<tr><td colspan="7" class="td" style="text-align:center;color:#9ca3af;font-size:11px">+' + (jobsToReview.length - 10) + ' more — open review queue to see all</td></tr>';
      }
      h += '</tbody></table></div>';
    }

    // ── Active Orders list (preserved) ──────────────────────────────────────
    if (inFactory.length > 0 && typeof getFactoryStatusObj === 'function' && typeof getGlassStatusObj === 'function' && typeof getProfileStatusObj === 'function') {
      h += '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">🛠️ Active Orders (' + inFactory.length + ')</h4></div>'
        + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Frames</th><th class="th">Value</th><th class="th">Status</th><th class="th">🪟 Glass</th><th class="th">📦 Profiles</th><th class="th">Install</th><th class="th" style="width:140px">Advance</th></tr></thead><tbody>';
      inFactory.forEach(function(o, i) {
        var ps  = getFactoryStatusObj(o.status);
        var gs  = getGlassStatusObj(o.glassStatus || 'not_ordered');
        var prs = getProfileStatusObj(o.profileStatus || 'not_ordered');
        var glassOverdue   = (o.glassStatus || 'not_ordered') === 'not_ordered';
        var profileOverdue = (o.profileStatus || 'not_ordered') === 'not_ordered';
        var rowRed = glassOverdue || profileOverdue;
        var nextIdx = FACTORY_STATUS_ORDER.indexOf(o.status) + 1;
        var nextSt  = nextIdx < FACTORY_STATUS_ORDER.length ? FACTORY_STATUS_ORDER[nextIdx] : null;

        h += '<tr style="' + (rowRed ? 'background:#fef2f2' : i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td" style="font-weight:700;color:#c41230"><span data-action="factory-dash-job-navigate" data-job-id="' + o.crmJobId + '" style="cursor:pointer;text-decoration:underline;text-underline-offset:2px">' + o.jid + '</span></td>'
          + '<td class="td">' + o.customer + '</td>'
          + '<td class="td">' + o.frameCount + '</td>'
          + '<td class="td" style="font-weight:600">$' + Number(o.value || 0).toLocaleString() + '</td>'
          + '<td class="td"><span class="bdg" style="background:' + ps.col + '20;color:' + ps.col + ';border:1px solid ' + ps.col + '40;font-size:10px">' + ps.label + '</span></td>'
          + '<td class="td" style="' + (glassOverdue ? 'background:#fef2f2' : '') + '"><span data-action="factory-dash-glass-order" data-order-id="' + o.id + '" style="cursor:pointer;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;' + (glassOverdue ? 'background:#ef4444;color:#fff' : 'color:' + gs.col) + '">' + gs.icon + ' ' + gs.label + (glassOverdue ? ' 🚨' : '') + '</span></td>'
          + '<td class="td" style="' + (profileOverdue ? 'background:#fef2f2' : '') + '"><span data-action="factory-dash-profile-order" data-order-id="' + o.id + '" style="cursor:pointer;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;' + (profileOverdue ? 'background:#ef4444;color:#fff' : 'color:' + prs.col) + '">' + prs.icon + ' ' + prs.label + (profileOverdue ? ' 🚨' : '') + '</span></td>'
          + '<td class="td">' + (o.installDate || '—') + '</td>'
          + '<td class="td">' + (nextSt ? '<button data-action="factory-dash-advance-order" data-order-id="' + o.id + '" class="btn-w" style="font-size:10px;padding:3px 10px">→ ' + getFactoryStatusObj(nextSt).label + '</button>' : '<span style="color:#22c55e;font-weight:600">✅</span>') + '</td>'
          + '</tr>';
      });
      h += '</tbody></table></div></div>';
    }

    return '<div>' + h + '</div>';
  };

  // ── Sidebar nav extension (runtime) ────────────────────────────────────────
  // The factoryNav array is a const inside renderSidebar in 07-shared-ui.js,
  // so we can't extend it directly. Instead we wrap renderSidebar and inject
  // the three Stage 1 ops links into the rendered HTML. The injection looks
  // for the existing 'Production Board' nav-item line and inserts our entries
  // after it — keeping them grouped with the other production-floor pages.
  var _origRenderSidebar = window.renderSidebar;
  if (typeof _origRenderSidebar === 'function') {
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      // Only inject when we're in factory mode
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      // Only inject if our new pages can be accessed
      if (typeof canAccessPage === 'function') {
        if (!canAccessPage('jobsreview') && !canAccessPage('factoryqc') && !canAccessPage('baymanagement')) return html;
      }
      // Already injected? (if this function re-runs during an SPA re-render)
      if (html.indexOf("setState({page:'jobsreview'") >= 0) return html;

      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      function _navItem(id, label, icon) {
        var page = st.page;
        var on = page === id;
        return '<div class="nav-item' + (on ? ' on' : '') + '" '
          + 'data-action="factory-dash-sidebar-nav" data-page="' + id + '" '
          + 'title="' + (!sidebarOpen ? label : '') + '">'
          + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">' + icon + '</span>'
          + (sidebarOpen ? '<span style="flex:1">' + label + '</span>' : '')
          + '</div>';
      }

      var injection = '';
      if (typeof canAccessPage !== 'function' || canAccessPage('jobsreview'))    injection += _navItem('jobsreview',    'Jobs to Review', '📋');
      if (typeof canAccessPage !== 'function' || canAccessPage('factoryqc'))     injection += _navItem('factoryqc',     'QC Checklist',   '✅');
      if (typeof canAccessPage !== 'function' || canAccessPage('baymanagement')) injection += _navItem('baymanagement', 'Bay Management', '🚛');

      // Find the BOM & Cut Sheets nav item (a stable anchor in factoryNav) and
      // insert our three items immediately AFTER it. Falls back to inserting
      // at the start of the nav block if the anchor isn't found.
      var anchor = "setState({page:'factorybom'";
      var idx = html.indexOf(anchor);
      if (idx < 0) {
        // Fallback: insert before the first nav-item
        var firstNav = html.indexOf('class="nav-item');
        if (firstNav < 0) return html;
        // Find the opening <div before that
        var divStart = html.lastIndexOf('<div', firstNav);
        if (divStart < 0) return html;
        return html.slice(0, divStart) + injection + html.slice(divStart);
      }
      // Find the closing </div> of the BOM nav-item
      var closeDiv = html.indexOf('</div>', idx);
      if (closeDiv < 0) return html;
      var insertAt = closeDiv + '</div>'.length;
      return html.slice(0, insertAt) + injection + html.slice(insertAt);
    };
  }

  console.log('[42-factory-dashboard-v2] 6-KPI dashboard active; sidebar nav extended for jobsreview / factoryqc / baymanagement.');
})();
