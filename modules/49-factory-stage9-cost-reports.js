// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 49-factory-stage9-cost-reports.js
// Stage 9 — Cost Reports + Operator Efficiency
//
//   renderCostReports()  → /costreports
//
// Three tabs:
//   1. Order Cost Report — per-order: estimated labour + material vs actual
//      labour, with variance. Click an order row to drill into its frames.
//   2. Operator Efficiency — per-operator: hours booked, frames done, $/hr
//      effective, issue rate, top stations.
//   3. Frame Detail — drill-down view: per-station labour breakdown for a
//      single frame, showing each operator's contribution and variance vs
//      the frame's stationTimes budget.
//
// Cost calculation
//   Labour ACTUAL  = sum over operator log (type='done', frame in scope) of
//                    (durationMs / 3.6e6) * operator.hourlyRate
//   Labour BUDGET  = sum over frame.stationTimes[sid] of (mins/60 * stn.rate)
//                    where stn.rate comes from FACTORY_STATIONS_TIMES
//   Material EST   = perimeter * categoryRate (coarse BOM proxy — same shape
//                    as Stage 2's predictShortfall demand model). Honest:
//                    we don't have per-frame consume tracking yet so this
//                    is an estimate, NOT actuals.
//   Variance LAB   = Actual - Budget (positive = over-spent labour-wise)
//
// Page registration via SPARTAN_EXTRA_PAGES; sidebar entry as 💰 Cost Reports.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  window._costTab          = window._costTab          || 'orders';
  window._costFrameDetail  = window._costFrameDetail  || null;
  window._costOrderExpand  = window._costOrderExpand  || null;
  window._costOpDetail     = window._costOpDetail     || null;

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
  defineAction('costreports-tab-orders', function(target, ev) {
    window._costTab = 'orders';
    renderPage();
  });
  defineAction('costreports-tab-operators', function(target, ev) {
    window._costTab = 'operators';
    renderPage();
  });
  defineAction('costreports-order-expand', function(target, ev) {
    ev.stopPropagation();
    var orderId = target.dataset.orderId;
    window._costOrderExpand = (window._costOrderExpand === orderId) ? null : orderId;
    renderPage();
  });
  defineAction('costreports-frame-detail', function(target, ev) {
    ev.stopPropagation();
    window._costFrameDetail = target.dataset.frameId;
    renderPage();
  });
  defineAction('costreports-frame-back', function(target, ev) {
    window._costFrameDetail = null;
    renderPage();
  });
  defineAction('costreports-op-detail', function(target, ev) {
    window._costOpDetail = target.dataset.opId;
    renderPage();
  });
  defineAction('costreports-op-back', function(target, ev) {
    window._costOpDetail = null;
    renderPage();
  });

  // ── Persistence ────────────────────────────────────────────────────────────
  function _getOperatorLog() {
    try { return JSON.parse(localStorage.getItem('spartan_operator_log') || '[]'); }
    catch(e) { return []; }
  }
  function _getOperators() {
    try { return JSON.parse(localStorage.getItem('spartan_operators') || '[]'); }
    catch(e) { return []; }
  }
  function _stationRate(stationId) {
    if (typeof FACTORY_STATIONS_TIMES === 'undefined') return 40;
    var s = FACTORY_STATIONS_TIMES.find(function(x){return x.id === stationId;});
    return s ? (Number(s.rate) || 40) : 40;
  }
  function _stationName(stationId) {
    if (typeof FACTORY_STATIONS_TIMES === 'undefined') return stationId;
    var s = FACTORY_STATIONS_TIMES.find(function(x){return x.id === stationId;});
    return s ? s.name : stationId;
  }

  // ── Cost computations ──────────────────────────────────────────────────────
  // Returns { budget, actual, variance, hours, issueCount } for a frame.
  function frameCost(frame, log, opsById) {
    var stationTimes = frame.stationTimes || {};
    // Budget: sum minutes × station rate. Iterates the 11-key contract
    // (CAD_STATION_KEYS) explicitly so any stray keys on the frame are
    // ignored. If the contract isn't loaded, fall back to whatever keys
    // the frame happens to have.
    var budget = 0;
    var _keys = (typeof CAD_STATION_KEYS !== 'undefined')
      ? CAD_STATION_KEYS
      : Object.keys(stationTimes);
    _keys.forEach(function(sid) {
      var mins = Number(stationTimes[sid]) || 0;
      budget += (mins / 60) * _stationRate(sid);
    });
    // Actual: sum durationMs * operator hourlyRate over 'done' events for this frame
    var actual = 0, hours = 0, issueCount = 0;
    (log || []).forEach(function(e) {
      if (e.frameId !== frame.id) return;
      if (e.type === 'done' && e.durationMs) {
        var hrs = e.durationMs / 3600000;
        var op  = opsById[e.operatorId];
        var rate = op ? (Number(op.hourlyRate) || 40) : 40;
        actual += hrs * rate;
        hours  += hrs;
      } else if (e.type === 'issue') {
        issueCount++;
      }
    });
    return { budget:budget, actual:actual, variance:actual - budget, hours:hours, issueCount:issueCount };
  }

  // Per-frame material estimate. Coarse BOM proxy keyed on perimeter and
  // product type — same shape as Stage 2's predictShortfall demand model.
  function frameMaterialEstimate(frame) {
    var w = Number(frame.widthMm)  || Number(frame.width)  || 1000;
    var h = Number(frame.heightMm) || Number(frame.height) || 1000;
    var perimeterM = (2 * (w + h)) / 1000;
    var pt = (frame.productType || '').toLowerCase();
    // Per-meter material cost estimate by product family. Order matters —
    // 'door' wins over 'slid' so that 'sliding_door' is rated as a door
    // (track + door profile + hardware = more material than a window slider).
    var rate = 110;                             // default casement/awning
    if (pt.indexOf('door') >= 0)        rate = 180;
    else if (pt.indexOf('slid') >= 0)   rate = 140;   // matches 'slider' AND 'sliding_window'
    else if (pt.indexOf('fixed') >= 0)  rate = 80;
    return perimeterM * rate;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderCostReports() {
    if (window._costFrameDetail) return _renderFrameDetail(window._costFrameDetail);
    if (window._costOpDetail)    return _renderOperatorDetail(window._costOpDetail);

    var h = '<div style="margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'
      + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">💰 Cost Reports</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Labour cost from operator log × hourly rates · material estimates from BOM</p></div>'
      + '<div style="display:flex;gap:6px">'
      + _tabBtn('orders',    'Orders', window._costTab)
      + _tabBtn('operators', 'Operators', window._costTab)
      + '</div></div>';

    if (window._costTab === 'operators') return '<div>' + h + _renderOperatorsTab() + '</div>';
    return '<div>' + h + _renderOrdersTab() + '</div>';
  }

  function _tabBtn(key, label, current) {
    var on = current === key;
    var actionName = key === 'orders' ? 'costreports-tab-orders' : 'costreports-tab-operators';
    return '<button data-action="' + actionName + '" style="padding:6px 14px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid ' + (on ? '#c41230' : '#e5e7eb') + ';background:' + (on ? '#c41230' : '#fff') + ';color:' + (on ? '#fff' : '#374151') + ';cursor:pointer;font-family:inherit">' + label + '</button>';
  }

  // ── Tab 1: Orders ─────────────────────────────────────────────────────────
  function _renderOrdersTab() {
    var orders = (typeof getFactoryOrders === 'function') ? getFactoryOrders() : [];
    var items  = (typeof getFactoryItems  === 'function') ? getFactoryItems()  : [];
    var log    = _getOperatorLog();
    var ops    = _getOperators();
    var opsById = {}; ops.forEach(function(o){opsById[o.id] = o;});

    // Build per-order rollups
    var rollups = orders.map(function(o) {
      var frames = items.filter(function(it){return it.orderId === o.jid;});
      var budget = 0, actual = 0, material = 0, hours = 0, doneCount = 0, issueCount = 0;
      frames.forEach(function(f) {
        var fc = frameCost(f, log, opsById);
        budget   += fc.budget;
        actual   += fc.actual;
        hours    += fc.hours;
        issueCount += fc.issueCount;
        material += frameMaterialEstimate(f);
        if (fc.hours > 0) doneCount++;
      });
      return Object.assign({ frames:frames, budget:budget, actual:actual, material:material, hours:hours, doneCount:doneCount, issueCount:issueCount, variance:actual - budget }, o);
    });

    // KPIs across visible orders
    var totalBudget   = rollups.reduce(function(s, r){return s + r.budget;}, 0);
    var totalActual   = rollups.reduce(function(s, r){return s + r.actual;}, 0);
    var totalMaterial = rollups.reduce(function(s, r){return s + r.material;}, 0);
    var totalVariance = totalActual - totalBudget;

    var h = '';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Labour Budget',  v:'$' + Math.round(totalBudget).toLocaleString(),   c:'#3b82f6' },
      { l:'Labour Actual',  v:'$' + Math.round(totalActual).toLocaleString(),   c:'#22c55e' },
      { l:'Labour Variance', v:(totalVariance >= 0 ? '+' : '') + '$' + Math.round(totalVariance).toLocaleString(), c:totalVariance > 0 ? '#ef4444' : '#22c55e' },
      { l:'Material Est.',   v:'$' + Math.round(totalMaterial).toLocaleString(), c:'#a855f7' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    if (!rollups.length) {
      h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">No factory orders to report on yet.</div>';
      return h;
    }

    h += '<div class="card" style="padding:0;overflow:hidden">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">Order</th><th class="th">Customer</th><th class="th">Frames</th><th class="th">Hours</th><th class="th">Labour Budget</th><th class="th">Labour Actual</th><th class="th">Variance</th><th class="th">Material Est.</th><th class="th">Total Cost</th><th class="th"></th></tr></thead><tbody>';

    rollups.sort(function(a, b){return Math.abs(b.variance) - Math.abs(a.variance);});
    rollups.forEach(function(r, i) {
      var varCol = r.variance > 0 ? '#ef4444' : r.variance < 0 ? '#22c55e' : '#9ca3af';
      var pctVar = r.budget > 0 ? Math.round(r.variance / r.budget * 100) : 0;
      var totalCost = r.actual + r.material;
      var expanded = window._costOrderExpand === r.id;
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + ';cursor:pointer" data-action="costreports-order-expand" data-order-id="' + r.id + '">'
        + '<td class="td" style="font-weight:700;color:#c41230">' + r.jid + '</td>'
        + '<td class="td">' + (r.customer || '—') + '</td>'
        + '<td class="td">' + (r.frames.length) + (r.doneCount > 0 ? ' <span style="font-size:10px;color:#22c55e">(' + r.doneCount + ' worked)</span>' : '') + '</td>'
        + '<td class="td">' + r.hours.toFixed(1) + 'h</td>'
        + '<td class="td">$' + Math.round(r.budget).toLocaleString() + '</td>'
        + '<td class="td" style="font-weight:600">$' + Math.round(r.actual).toLocaleString() + '</td>'
        + '<td class="td" style="color:' + varCol + ';font-weight:700">' + (r.variance >= 0 ? '+' : '') + '$' + Math.round(r.variance).toLocaleString() + (Math.abs(pctVar) > 0 ? ' <span style="font-size:10px">(' + (pctVar >= 0 ? '+' : '') + pctVar + '%)</span>' : '') + '</td>'
        + '<td class="td" style="color:#a855f7">$' + Math.round(r.material).toLocaleString() + '</td>'
        + '<td class="td" style="font-weight:700">$' + Math.round(totalCost).toLocaleString() + '</td>'
        + '<td class="td" style="color:#9ca3af">' + (expanded ? '▼' : '▶') + '</td>'
        + '</tr>';

      // Expanded: show per-frame breakdown
      if (expanded) {
        h += '<tr><td colspan="10" style="padding:0;background:#fafafa">'
          + '<div style="padding:12px 22px">'
          + '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Frames in this order</div>'
          + '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th">Frame</th><th class="th">Station</th><th class="th">Hours</th><th class="th">Budget</th><th class="th">Actual</th><th class="th">Variance</th><th class="th">Issues</th><th class="th"></th></tr></thead><tbody>';
        r.frames.forEach(function(f) {
          var fc = frameCost(f, log, opsById);
          var fVarCol = fc.variance > 0 ? '#ef4444' : fc.variance < 0 ? '#22c55e' : '#9ca3af';
          h += '<tr>'
            + '<td class="td"><span style="font-weight:700">' + (f.name || f.id) + '</span>' + (f.rework ? ' <span style="font-size:9px;background:#ef4444;color:#fff;padding:1px 5px;border-radius:6px;font-weight:700">REWORK</span>' : '') + '</td>'
            + '<td class="td">' + (f.station || '—') + '</td>'
            + '<td class="td">' + fc.hours.toFixed(1) + 'h</td>'
            + '<td class="td">$' + Math.round(fc.budget).toLocaleString() + '</td>'
            + '<td class="td">$' + Math.round(fc.actual).toLocaleString() + '</td>'
            + '<td class="td" style="color:' + fVarCol + ';font-weight:600">' + (fc.variance >= 0 ? '+' : '') + '$' + Math.round(fc.variance).toLocaleString() + '</td>'
            + '<td class="td">' + (fc.issueCount > 0 ? '<span style="color:#ef4444;font-weight:700">' + fc.issueCount + '</span>' : '<span style="color:#9ca3af">0</span>') + '</td>'
            + '<td class="td"><button data-action="costreports-frame-detail" data-frame-id="' + f.id + '" style="padding:3px 10px;font-size:10px;background:none;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-family:inherit;color:#374151">Detail →</button></td>'
            + '</tr>';
        });
        h += '</tbody></table></div></td></tr>';
      }
    });
    h += '</tbody></table></div>';
    h += '<div style="margin-top:10px;font-size:11px;color:#6b7280">Material cost is an estimate from BOM (perimeter × category rate). Per-frame consumption tracking is a future enhancement.</div>';
    return h;
  }

  // ── Tab 2: Operators ──────────────────────────────────────────────────────
  function _renderOperatorsTab() {
    var ops = _getOperators();
    var log = _getOperatorLog();

    if (!ops.length) {
      return '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">'
        + '<div style="font-size:40px;margin-bottom:10px">👷</div>'
        + '<div style="font-size:14px;font-weight:600;color:#374151">No operators in the system</div>'
        + '<div style="font-size:12px;margin-top:4px">Run loadMockOperatorData() in the console to seed 8 mock operators.</div></div>';
    }

    var weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    var rollups = ops.map(function(op) {
      var myEvents = log.filter(function(e){return e.operatorId === op.id;});
      var myDone   = myEvents.filter(function(e){return e.type === 'done' && e.durationMs;});
      var myIssue  = myEvents.filter(function(e){return e.type === 'issue';});
      var allTimeHours  = myDone.reduce(function(s, e){return s + (e.durationMs / 3600000);}, 0);
      var weekHours     = myDone.filter(function(e){return new Date(e.at) >= weekStart;}).reduce(function(s, e){return s + (e.durationMs / 3600000);}, 0);
      var todayHours    = myDone.filter(function(e){return new Date(e.at) >= todayStart;}).reduce(function(s, e){return s + (e.durationMs / 3600000);}, 0);
      var todayDone     = myDone.filter(function(e){return new Date(e.at) >= todayStart;}).length;
      var labourCost    = allTimeHours * (Number(op.hourlyRate) || 0);
      // Top stations by hours
      var byStation = {};
      myDone.forEach(function(e){byStation[e.stationId] = (byStation[e.stationId] || 0) + (e.durationMs / 3600000);});
      var topStations = Object.keys(byStation).map(function(k){return {id:k, hrs:byStation[k]};}).sort(function(a, b){return b.hrs - a.hrs;}).slice(0, 3);
      // Issue rate (issues per 100 dones)
      var issueRate = myDone.length > 0 ? (myIssue.length / myDone.length * 100) : 0;
      return Object.assign({}, op, {
        allTimeHours:allTimeHours, weekHours:weekHours, todayHours:todayHours,
        todayDone:todayDone, doneCount:myDone.length, issueCount:myIssue.length,
        labourCost:labourCost, topStations:topStations, issueRate:issueRate,
      });
    });

    // KPI strip
    var totalDones    = rollups.reduce(function(s, r){return s + r.doneCount;}, 0);
    var totalHours    = rollups.reduce(function(s, r){return s + r.allTimeHours;}, 0);
    var totalCost     = rollups.reduce(function(s, r){return s + r.labourCost;}, 0);
    var todayHoursAll = rollups.reduce(function(s, r){return s + r.todayHours;}, 0);
    var h = '';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Frames Completed', v:totalDones, c:'#22c55e' },
      { l:'Hours Booked',     v:totalHours.toFixed(0) + 'h', c:'#3b82f6' },
      { l:'Hours Today',      v:todayHoursAll.toFixed(1) + 'h', c:todayHoursAll > 0 ? '#22c55e' : '#9ca3af' },
      { l:'Labour Spend',     v:'$' + Math.round(totalCost).toLocaleString(), c:'#7c3aed' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    rollups.sort(function(a, b){return b.allTimeHours - a.allTimeHours;});

    h += '<div class="card" style="padding:0;overflow:hidden">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">Operator</th><th class="th">Rate</th><th class="th">Today</th><th class="th">This Week</th><th class="th">All-Time Hours</th><th class="th">Frames Done</th><th class="th">Issue Rate</th><th class="th">Top Stations</th><th class="th">Labour Cost</th><th class="th"></th></tr></thead><tbody>';

    rollups.forEach(function(r, i) {
      var topStrings = r.topStations.map(function(s){return _stationName(s.id) + ' (' + s.hrs.toFixed(1) + 'h)';});
      var issueCol = r.issueRate > 10 ? '#ef4444' : r.issueRate > 5 ? '#f59e0b' : '#22c55e';
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td"><div style="font-weight:700">' + r.name + '</div><div style="font-size:10px;color:#9ca3af">' + (r.active === false ? 'inactive' : 'active') + '</div></td>'
        + '<td class="td">$' + (Number(r.hourlyRate) || 0) + '/h</td>'
        + '<td class="td">' + (r.todayDone > 0 ? '<strong>' + r.todayDone + '</strong> done · ' + r.todayHours.toFixed(1) + 'h' : '<span style="color:#9ca3af">—</span>') + '</td>'
        + '<td class="td">' + r.weekHours.toFixed(1) + 'h</td>'
        + '<td class="td" style="font-weight:600">' + r.allTimeHours.toFixed(1) + 'h</td>'
        + '<td class="td">' + r.doneCount + '</td>'
        + '<td class="td" style="color:' + issueCol + ';font-weight:600">' + (r.doneCount > 0 ? r.issueRate.toFixed(1) + '%' : '<span style="color:#9ca3af">—</span>') + ' <span style="font-size:10px;color:#6b7280">(' + r.issueCount + ' issues)</span></td>'
        + '<td class="td" style="font-size:11px;color:#6b7280">' + (topStrings.length ? topStrings.join('<br>') : '<span style="color:#d1d5db">no activity</span>') + '</td>'
        + '<td class="td" style="font-weight:700;color:#7c3aed">$' + Math.round(r.labourCost).toLocaleString() + '</td>'
        + '<td class="td"><button data-action="costreports-op-detail" data-op-id="' + r.id + '" style="padding:3px 10px;font-size:10px;background:none;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-family:inherit;color:#374151">Detail →</button></td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  // ── Frame Detail (drill-down from Order tab) ──────────────────────────────
  function _renderFrameDetail(frameId) {
    var items = (typeof getFactoryItems === 'function') ? getFactoryItems() : [];
    var f = items.find(function(i){return i.id === frameId;});
    if (!f) { window._costFrameDetail = null; return renderCostReports(); }

    var log = _getOperatorLog().filter(function(e){return e.frameId === frameId;});
    var ops = _getOperators();
    var opsById = {}; ops.forEach(function(o){opsById[o.id] = o;});

    // Per-station breakdown: budget vs actual for every station this frame touched/will touch
    var stationTimes = f.stationTimes || {};
    var stationIds   = (typeof FACTORY_STATIONS_TIMES !== 'undefined') ? FACTORY_STATIONS_TIMES.map(function(s){return s.id;}) : Object.keys(stationTimes);
    var rows = stationIds.filter(function(sid){return (Number(stationTimes[sid]) || 0) > 0 || log.some(function(e){return e.stationId === sid;});});

    var h = '<div style="margin-bottom:14px;display:flex;align-items:center;gap:10px">'
      + '<button data-action="costreports-frame-back" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">← Cost Reports</button>'
      + '<div style="flex:1"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:20px;margin:0">' + (f.name || f.id) + '</h2>'
      + '<p style="color:#6b7280;font-size:12px;margin:3px 0 0">' + (f.jobRef || f.orderId || '—') + ' · ' + formatProductType(f.productType) + ' · ' + (f.widthMm || f.width || '?') + '×' + (f.heightMm || f.height || '?') + 'mm' + (f.rework ? ' · <span style="color:#ef4444;font-weight:700">REWORK</span>' : '') + '</p></div>'
      + '</div>';

    var fc = frameCost(f, log, opsById);
    var matEst = frameMaterialEstimate(f);

    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Labour Budget',  v:'$' + Math.round(fc.budget).toLocaleString(), c:'#3b82f6' },
      { l:'Labour Actual',  v:'$' + Math.round(fc.actual).toLocaleString(), c:'#22c55e' },
      { l:'Variance',        v:(fc.variance >= 0 ? '+' : '') + '$' + Math.round(fc.variance).toLocaleString(), c:fc.variance > 0 ? '#ef4444' : fc.variance < 0 ? '#22c55e' : '#9ca3af' },
      { l:'Material Est.',   v:'$' + Math.round(matEst).toLocaleString(),   c:'#a855f7' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    if (!rows.length) {
      h += '<div class="card" style="padding:30px;text-align:center;color:#9ca3af">No station data for this frame.</div>';
      return '<div>' + h + '</div>';
    }

    h += '<div class="card" style="padding:0;overflow:hidden">'
      + '<div style="padding:12px 18px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:13px;font-weight:700;margin:0">Per-Station Breakdown</h4></div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">Station</th><th class="th">Budget Min</th><th class="th">Actual Min</th><th class="th">Operator</th><th class="th">Budget $</th><th class="th">Actual $</th><th class="th">Variance</th><th class="th">Done At</th></tr></thead><tbody>';

    rows.forEach(function(sid, i) {
      var budgetMin = Number(stationTimes[sid]) || 0;
      var rate = _stationRate(sid);
      var budgetCost = (budgetMin / 60) * rate;
      var entries = log.filter(function(e){return e.stationId === sid && e.type === 'done' && e.durationMs;});
      var actualMin = entries.reduce(function(s, e){return s + (e.durationMs / 60000);}, 0);
      var actualCost = entries.reduce(function(s, e) {
        var op = opsById[e.operatorId];
        return s + ((e.durationMs / 3600000) * (op ? (Number(op.hourlyRate) || 40) : 40));
      }, 0);
      var stnVariance = actualCost - budgetCost;
      var stnVarCol = stnVariance > 0 ? '#ef4444' : stnVariance < 0 ? '#22c55e' : '#9ca3af';
      var operatorNames = entries.map(function(e){var op = opsById[e.operatorId]; return op ? op.name : (e.operatorId || '—');}).join(', ') || '<span style="color:#9ca3af">— pending —</span>';
      var lastDone = entries.length ? new Date(entries[entries.length - 1].at).toLocaleString('en-AU', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : '—';

      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="font-weight:600">' + _stationName(sid) + '</td>'
        + '<td class="td">' + budgetMin + 'm</td>'
        + '<td class="td">' + (actualMin > 0 ? actualMin.toFixed(0) + 'm' : '<span style="color:#9ca3af">—</span>') + '</td>'
        + '<td class="td" style="font-size:11px">' + operatorNames + '</td>'
        + '<td class="td">$' + budgetCost.toFixed(0) + '</td>'
        + '<td class="td">$' + actualCost.toFixed(0) + '</td>'
        + '<td class="td" style="color:' + stnVarCol + ';font-weight:600">' + (entries.length ? (stnVariance >= 0 ? '+' : '') + '$' + Math.round(stnVariance).toLocaleString() : '<span style="color:#9ca3af">pending</span>') + '</td>'
        + '<td class="td" style="font-size:11px;color:#6b7280">' + lastDone + '</td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    return '<div>' + h + '</div>';
  }

  // ── Operator Detail ───────────────────────────────────────────────────────
  function _renderOperatorDetail(opId) {
    var ops = _getOperators();
    var op = ops.find(function(x){return x.id === opId;});
    if (!op) { window._costOpDetail = null; return renderCostReports(); }

    var log = _getOperatorLog().filter(function(e){return e.operatorId === opId;});
    var done = log.filter(function(e){return e.type === 'done' && e.durationMs;});

    var h = '<div style="margin-bottom:14px;display:flex;align-items:center;gap:10px">'
      + '<button data-action="costreports-op-back" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">← Operators</button>'
      + '<div style="flex:1"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:20px;margin:0">' + op.name + '</h2>'
      + '<p style="color:#6b7280;font-size:12px;margin:3px 0 0">$' + (Number(op.hourlyRate) || 0) + '/h · default ' + _stationName(op.defaultStation || '') + '</p></div>'
      + '</div>';

    if (!log.length) {
      h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">No activity for this operator yet.</div>';
      return '<div>' + h + '</div>';
    }

    // Summary
    var totalHrs = done.reduce(function(s, e){return s + (e.durationMs / 3600000);}, 0);
    var totalCost = totalHrs * (Number(op.hourlyRate) || 0);
    var avgFrameMin = done.length ? (done.reduce(function(s, e){return s + (e.durationMs / 60000);}, 0) / done.length) : 0;

    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Frames Completed', v:done.length,                               c:'#22c55e' },
      { l:'Hours Booked',     v:totalHrs.toFixed(1) + 'h',                 c:'#3b82f6' },
      { l:'Avg Time / Frame', v:avgFrameMin.toFixed(0) + 'min',             c:'#f59e0b' },
      { l:'Labour Cost',       v:'$' + Math.round(totalCost).toLocaleString(), c:'#7c3aed' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    // Recent activity
    var recent = log.slice().sort(function(a, b){return new Date(b.at) - new Date(a.at);}).slice(0, 50);
    h += '<div class="card" style="padding:0;overflow:hidden">'
      + '<div style="padding:12px 18px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:13px;font-weight:700;margin:0">Recent Activity (last 50 events)</h4></div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">When</th><th class="th">Type</th><th class="th">Frame</th><th class="th">Station</th><th class="th">Duration</th><th class="th">Cost</th><th class="th">Notes</th></tr></thead><tbody>';

    recent.forEach(function(e, i) {
      var typeCol = e.type === 'done' ? '#22c55e' : e.type === 'issue' ? '#ef4444' : e.type === 'pause' ? '#f59e0b' : '#3b82f6';
      var dur = e.durationMs ? Math.round(e.durationMs / 60000) + 'min' : '—';
      var cost = e.durationMs ? '$' + ((e.durationMs / 3600000) * (Number(op.hourlyRate) || 0)).toFixed(0) : '—';
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="font-size:11px;color:#6b7280">' + new Date(e.at).toLocaleString('en-AU', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) + '</td>'
        + '<td class="td"><span style="font-size:10px;background:' + typeCol + '20;color:' + typeCol + ';padding:2px 7px;border-radius:8px;font-weight:700;text-transform:uppercase">' + e.type + '</span></td>'
        + '<td class="td" style="font-family:monospace;font-size:11px">' + (e.frameId || '—') + '</td>'
        + '<td class="td">' + _stationName(e.stationId || '') + '</td>'
        + '<td class="td">' + dur + '</td>'
        + '<td class="td">' + cost + '</td>'
        + '<td class="td" style="font-size:11px;color:#6b7280;max-width:240px;overflow:hidden;text-overflow:ellipsis">' + (e.notes || '') + '</td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    return '<div>' + h + '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION + SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.costreports = function() { return renderCostReports(); };

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

  if (typeof window.renderSidebar === 'function' && !window._STAGE9_SIDEBAR_WRAPPED) {
    window._STAGE9_SIDEBAR_WRAPPED = true;
    var _origRenderSidebar = window.renderSidebar;
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      if (html.indexOf("setState({page:'costreports'") >= 0) return html;
      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      var on = st.page === 'costreports';
      var entry = '<div class="nav-item' + (on ? ' on' : '') + '" '
        + 'onclick="setState({page:\'costreports\',dealDetailId:null,leadDetailId:null,contactDetailId:null,jobDetailId:null' + (native ? ',sidebarOpen:false' : '') + '})" '
        + 'title="' + (!sidebarOpen ? 'Cost Reports' : '') + '">'
        + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">💰</span>'
        + (sidebarOpen ? '<span style="flex:1">Cost Reports</span>' : '')
        + '</div>';
      // Insert after factoryreports if present, else after servicerework / tabletoperator
      var anchors = ["setState({page:'factoryreports'", "setState({page:'servicerework'", "setState({page:'tabletoperator'", "setState({page:'smartplanner'"];
      var idx = -1;
      for (var i = 0; i < anchors.length; i++) {
        var x = html.indexOf(anchors[i]);
        if (x >= 0) { idx = x; break; }
      }
      if (idx < 0) {
        var firstNav = html.indexOf('class="nav-item');
        if (firstNav < 0) return html;
        var divStart = html.lastIndexOf('<div', firstNav);
        return divStart < 0 ? html : html.slice(0, divStart) + entry + html.slice(divStart);
      }
      var insertAt = html.indexOf('</div>', idx) + '</div>'.length;
      return html.slice(0, insertAt) + entry + html.slice(insertAt);
    };
  }

  // ── Window exports ─────────────────────────────────────────────────────────
  window.renderCostReports     = renderCostReports;
  window.frameCost             = frameCost;
  window.frameMaterialEstimate = frameMaterialEstimate;

  console.log('[49-factory-stage9-cost-reports] /costreports registered.');
})();
