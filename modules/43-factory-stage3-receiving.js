// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 43-factory-stage3-receiving.js
// Stage 3 — Receiving Workflow
//
//   renderReceivingPage()  → /receiving
//
// Lists Stage 2 material orders that are out for delivery (status:
// sent | confirmed | dispatched), grouped by urgency. Each PO can be
// expanded inline to confirm receipt line-by-line, with partial receipts
// supported (line.received accumulates across multiple confirmation events).
// When every line on a PO is fully received, the PO auto-advances to
// 'delivered' and any factory orders currently in 'materials_ordered'
// status are surfaced as candidates for the production manager to advance.
//
// Stock writes go through Stage 2's recordStockMovement(...) so they hit
// the same audit log used by manual adjustments and (in Stage 4) stocktake.
//
// Page-registration: same SPARTAN_EXTRA_PAGES pattern as Stage 2 — no
// patches to 99-init.js. Sidebar entry inserted after the Stock entry.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Sanity check the dependencies we rely on. We don't bail if missing —
  // the page renders helpfully even if Stage 2 isn't loaded yet — but a
  // console warn helps debugging load-order issues.
  if (typeof window.recordStockMovement !== 'function' || typeof window.getMaterialOrders !== 'function') {
    console.warn('[43-factory-stage3-receiving] Stage 2 helpers missing. Module loaded out of order — expected after 40-factory-stage2-stock.js.');
  }

  // ── Module state ───────────────────────────────────────────────────────────
  // Hoisted to window so inline onclick handlers can mutate them across the
  // innerHTML rerender boundary.
  window._receivingExpandId = window._receivingExpandId || null;

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
  defineAction('receiving-nav-back', function(target, ev) {
    navigateTo('stock');
  });
  defineAction('receiving-expand-order', function(target, ev) {
    var orderId = target.dataset.orderId;
    window._receivingExpandId = (window._receivingExpandId === orderId) ? null : orderId;
    renderPage();
  });
  defineAction('receiving-receive-line', function(target, ev) {
    var orderId = target.dataset.orderId;
    var lineIdx = parseInt(target.dataset.lineIdx, 10);
    var inputId = target.dataset.inputId;
    receiveMatOrderLine(orderId, lineIdx, inputId);
  });
  defineAction('receiving-receive-all', function(target, ev) {
    var orderId = target.dataset.orderId;
    receiveMatOrderAllLines(orderId);
  });
  defineAction('receiving-nav-factory', function(target, ev) {
    navigateTo('factorydash');
  });
  defineAction('receiving-advance-order', function(target, ev) {
    var orderId = target.dataset.orderId;
    advanceFactoryOrder(orderId);
  });
  defineAction('receiving-nav-costreports', function(target, ev) {
    var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
    var patch = {page:'receiving', dealDetailId:null, leadDetailId:null, contactDetailId:null, jobDetailId:null};
    if (native) patch.sidebarOpen = false;
    setState(patch);
  });

  // ── PO status reference (mirrors Stage 4's full lifecycle) ─────────────────
  var MAT_ORDER_STATUSES = [
    { key:'draft',      label:'Draft',      color:'#9ca3af' },
    { key:'sent',       label:'Sent',       color:'#3b82f6' },
    { key:'confirmed',  label:'Confirmed',  color:'#7c3aed' },
    { key:'dispatched', label:'Dispatched', color:'#f59e0b' },
    { key:'delivered',  label:'Delivered',  color:'#22c55e' },
    { key:'cancelled',  label:'Cancelled',  color:'#ef4444' },
  ];
  function _matOrderStatusObj(k) { return MAT_ORDER_STATUSES.find(function(s){return s.key===k;}) || MAT_ORDER_STATUSES[0]; }

  function _getMaterialOrders() { return (typeof getMaterialOrders === 'function') ? getMaterialOrders() : []; }
  function _saveMaterialOrders(o) {
    // Stage 2 doesn't expose its persistence helpers as globals (they're
    // closure-private) — write directly to localStorage with the same key.
    localStorage.setItem('spartan_material_orders', JSON.stringify(o));
  }
  function _getStockItems()  { return (typeof getStockItems  === 'function') ? getStockItems()  : []; }
  function _getFactoryOrders(){ return (typeof getFactoryOrders === 'function') ? getFactoryOrders() : []; }
  function _getStockCoverage(){ return (typeof predictShortfall === 'function') ? predictShortfall() : []; }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderReceivingPage() {
    var orders = _getMaterialOrders().filter(function(o) {
      return ['sent','confirmed','dispatched'].indexOf(o.status) >= 0;
    }).sort(function(a, b) {
      return new Date(a.expectedAt || 0) - new Date(b.expectedAt || 0);
    });
    var stockItems    = _getStockItems();
    var factoryOrders = _getFactoryOrders().filter(function(o){return o.status === 'materials_ordered';});

    // Header
    var h = '<div style="margin-bottom:20px;display:flex;align-items:center;gap:10px">'
      + '<button data-action="receiving-nav-back" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">←</button>'
      + '<div style="flex:1"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">📥 Receiving</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Confirm deliveries line-by-line — stock auto-increments via the movements log; factory orders awaiting material surface for advance</p></div>'
      + '</div>';

    // Today / overdue / soon split
    var today  = new Date(); today.setHours(0,0,0,0);
    var inThree = new Date(today.getTime() + 3 * 86400000);
    var overdue  = orders.filter(function(o){return new Date(o.expectedAt) < today;});
    var dueToday = orders.filter(function(o){var d=new Date(o.expectedAt); d.setHours(0,0,0,0); return d.getTime()===today.getTime();});
    var dueSoon  = orders.filter(function(o){var d=new Date(o.expectedAt); return d>today && d<=inThree;});
    var later    = orders.filter(function(o){return new Date(o.expectedAt) > inThree;});

    // KPI strip
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Overdue',         v:overdue.length,   c:overdue.length ? '#ef4444' : '#22c55e' },
      { l:'Due Today',       v:dueToday.length,  c:dueToday.length ? '#f59e0b' : '#9ca3af' },
      { l:'Due Within 3d',   v:dueSoon.length,   c:'#3b82f6' },
      { l:'Total Active',    v:orders.length,    c:'#6b7280' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    if (!orders.length) {
      h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">'
        + '<div style="font-size:40px;margin-bottom:10px">📥</div>'
        + '<div style="font-size:14px;font-weight:600;color:#374151">No deliveries to receive right now</div>'
        + '<div style="font-size:12px;margin-top:4px">POs in Sent / Confirmed / Dispatched status appear here. Create one from the Stock page.</div></div>';
    } else {
      [
        { title:'⚠️ Overdue',          col:'#ef4444', orders:overdue },
        { title:'📅 Due Today',         col:'#f59e0b', orders:dueToday },
        { title:'🔜 Due Within 3 Days', col:'#3b82f6', orders:dueSoon },
        { title:'📆 Later',             col:'#6b7280', orders:later },
      ].forEach(function(g) {
        if (!g.orders.length) return;
        h += _renderGroup(g, stockItems);
      });
    }

    // Factory orders awaiting material — informational panel that the PM can
    // act on. These orders are waiting in 'materials_ordered' status. After a
    // delivery, this list often shows the orders that are now unblocked.
    if (factoryOrders.length) h += _renderAwaitingMaterialPanel(factoryOrders);

    return '<div>' + h + '</div>';
  }

  function _renderGroup(g, stockItems) {
    var h = '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px;border-left:4px solid ' + g.col + '">'
      + '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;background:' + g.col + '08">'
      + '<h4 style="font-size:13px;font-weight:700;margin:0;color:' + g.col + '">' + g.title + ' (' + g.orders.length + ')</h4></div>';

    g.orders.forEach(function(o) {
      var expanded = window._receivingExpandId === o.id;
      var s = _matOrderStatusObj(o.status);

      // Compute progress: total received / total ordered (across all lines)
      var totQty = 0, totRcv = 0;
      (o.items || []).forEach(function(li) {
        totQty += Number(li.qty)      || 0;
        totRcv += Number(li.received) || 0;
      });
      var pct = totQty > 0 ? Math.round(totRcv / totQty * 100) : 0;

      // Summary row (clickable to expand)
      h += '<div style="border-bottom:1px solid #f9fafb">'
        + '<div data-action="receiving-expand-order" data-order-id="' + o.id + '" '
        + 'style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:14px;background:' + (expanded ? '#fafafa' : '') + '">'
        + '<div style="font-size:13px;color:#6b7280;width:14px">' + (expanded ? '▼' : '▶') + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<span style="font-family:monospace;font-weight:700;color:#c41230;font-size:13px">' + o.poNumber + '</span>'
        + '<span style="font-size:13px;font-weight:600;color:#374151">' + o.supplierName + '</span>'
        + '<span class="bdg" style="background:' + s.color + '20;color:' + s.color + ';font-size:9px;padding:2px 7px;border-radius:10px;font-weight:700">' + s.label + '</span>'
        + (pct > 0 ? '<span style="font-size:10px;color:#22c55e;font-weight:600">' + pct + '% received</span>' : '')
        + '</div>'
        + '<div style="font-size:11px;color:#6b7280;margin-top:3px">'
        + (o.items || []).length + ' line' + ((o.items || []).length === 1 ? '' : 's')
        + ' · $' + Number(o.total || 0).toLocaleString()
        + ' · expected ' + (o.expectedAt ? new Date(o.expectedAt).toLocaleDateString('en-AU') : '—')
        + '</div></div>'
        // Inline progress bar
        + (totQty > 0 ? '<div style="width:80px;height:6px;background:#f0f0f0;border-radius:3px;overflow:hidden;flex-shrink:0">'
            + '<div style="height:100%;background:' + (pct === 100 ? '#22c55e' : pct > 0 ? '#f59e0b' : '#e5e7eb') + ';width:' + pct + '%"></div></div>' : '')
        + '</div>';

      // Expanded detail
      if (expanded) h += _renderExpandedLines(o, stockItems);
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  function _renderExpandedLines(o, stockItems) {
    var h = '<div style="padding:0 16px 14px 44px">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">Item</th><th class="th">Ordered</th><th class="th">Already Received</th><th class="th">Remaining</th><th class="th">Receive Now</th><th class="th"></th></tr></thead><tbody>';

    var allDone = true;
    (o.items || []).forEach(function(li, lineIdx) {
      var item     = stockItems.find(function(x){return x.id === li.stockItemId;}) || {};
      var ordered  = Number(li.qty)      || 0;
      var received = Number(li.received) || 0;
      var remaining = Math.max(0, ordered - received);
      if (remaining > 0) allDone = false;
      var inputId = 'rcv_' + o.id + '_' + lineIdx;

      h += '<tr>'
        + '<td class="td">'
        + '<div style="font-weight:600">' + (item.name || '<span style="color:#ef4444">(item not found)</span>') + '</div>'
        + '<div style="font-size:10px;color:#9ca3af;font-family:monospace">' + (item.sku || li.stockItemId) + '</div>'
        + '</td>'
        + '<td class="td">' + ordered + ' ' + (item.unit || '') + '</td>'
        + '<td class="td" style="color:' + (received > 0 ? '#22c55e' : '#9ca3af') + ';font-weight:' + (received > 0 ? '600' : '400') + '">' + received + ' ' + (item.unit || '') + '</td>'
        + '<td class="td" style="font-weight:' + (remaining > 0 ? '700' : '400') + ';color:' + (remaining > 0 ? '#374151' : '#9ca3af') + '">' + remaining + ' ' + (item.unit || '') + '</td>'
        + '<td class="td">'
        + (remaining > 0
            ? '<input id="' + inputId + '" type="number" step="0.1" min="0" max="' + remaining + '" placeholder="' + remaining + '" style="width:90px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit">'
            : '<span style="color:#22c55e;font-weight:600">✓ Complete</span>')
        + '</td>'
        + '<td class="td" style="white-space:nowrap">'
        + (remaining > 0
            ? '<button data-action="receiving-receive-line" data-order-id="' + o.id + '" data-line-idx="' + lineIdx + '" data-input-id="' + inputId + '" class="btn-r" style="padding:4px 10px;font-size:10px">Receive</button>'
            : '')
        + '</td></tr>';
    });

    h += '</tbody></table>';

    // Footer actions
    if (!allDone) {
      h += '<div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">'
        + '<button data-action="receiving-receive-all" data-order-id="' + o.id + '" class="btn-r" style="font-size:11px;padding:6px 14px">📥 Receive All Remaining</button>'
        + '</div>';
    }
    h += '</div>';
    return h;
  }

  function _renderAwaitingMaterialPanel(factoryOrders) {
    var coverage = _getStockCoverage();           // [{category, demand, supply, shortfall, coverage}]
    var allCovered = coverage.length > 0 && coverage.every(function(c){return c.coverage >= 100;});

    var h = '<div class="card" style="padding:14px 18px;margin-top:14px;border-left:4px solid ' + (allCovered ? '#22c55e' : '#f59e0b') + '">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">'
      + '<div>'
      + '<div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">⏳ Factory Orders Awaiting Material (' + factoryOrders.length + ')</div>'
      + '<div style="font-size:11px;color:#6b7280;margin-top:2px">'
      + (allCovered
          ? '✅ Stock now fully covers projected BOM demand — these orders are candidates to advance to In Production'
          : '⚠️ Stock does not yet cover projected BOM demand for all categories — receive remaining POs before advancing')
      + '</div>'
      + '</div>'
      + (allCovered ? '<button data-action="receiving-nav-factory" class="btn-r" style="font-size:11px;padding:6px 14px;font-weight:700;flex-shrink:0">Open Factory Dashboard →</button>' : '')
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px">';

    factoryOrders.forEach(function(fo) {
      var glassReady   = (fo.glassStatus   || 'not_ordered') !== 'not_ordered';
      var profileReady = (fo.profileStatus || 'not_ordered') !== 'not_ordered';
      var blockers = [];
      if (!glassReady)   blockers.push('🪟 Glass');
      if (!profileReady) blockers.push('📦 Profile');
      var canAdvance = allCovered && glassReady && profileReady;

      h += '<div style="border:1px solid ' + (canAdvance ? '#bbf7d0' : '#e5e7eb') + ';border-radius:8px;padding:10px;background:' + (canAdvance ? '#f0fdf4' : '#fff') + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px">'
        + '<div><div style="font-size:13px;font-weight:700;color:#c41230">' + fo.jid + '</div>'
        + '<div style="font-size:11px;color:#374151">' + fo.customer + '</div></div>'
        + (canAdvance ? '<span style="font-size:9px;background:#22c55e;color:#fff;padding:2px 6px;border-radius:10px;font-weight:700">READY</span>' : '')
        + '</div>'
        + '<div style="font-size:10px;color:#9ca3af">' + fo.frameCount + ' frames · install ' + (fo.installDate ? new Date(fo.installDate).toLocaleDateString('en-AU') : '—') + '</div>'
        + (blockers.length ? '<div style="font-size:10px;color:#ef4444;font-weight:600;margin-top:4px">Blocked by: ' + blockers.join(', ') + '</div>' : '')
        + (canAdvance ? '<button data-action="receiving-advance-order" data-order-id="' + fo.id + '" style="margin-top:6px;width:100%;padding:5px;font-size:11px;font-weight:600;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit">→ Advance to In Production</button>' : '')
        + '</div>';
    });
    h += '</div></div>';
    return h;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIVE ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // Receive a single PO line. Reads qty from the input field; if blank, defaults
  // to the remaining qty (so the user can just click Receive without typing).
  function receiveMatOrderLine(orderId, lineIdx, inputId) {
    var orders = _getMaterialOrders();
    var o = orders.find(function(x){return x.id === orderId;});
    if (!o) { addToast('PO not found', 'error'); return; }

    var line = (o.items || [])[lineIdx];
    if (!line) { addToast('Line not found', 'error'); return; }

    var ordered  = Number(line.qty)      || 0;
    var received = Number(line.received) || 0;
    var remaining = Math.max(0, ordered - received);
    if (remaining <= 0) { addToast('Line already fully received', 'warning'); return; }

    var inputEl = document.getElementById(inputId);
    var raw = inputEl && inputEl.value;
    var qty = parseFloat(raw || '');
    if (isNaN(qty) || qty <= 0) qty = remaining;        // default to all remaining
    qty = Math.min(qty, remaining);                      // cap at remaining (no over-receive)

    var ok = (typeof recordStockMovement === 'function')
      ? recordStockMovement(line.stockItemId, qty, 'receive', 'mat_order', orderId, 'Received via ' + o.poNumber)
      : false;
    if (!ok) return;

    line.received = received + qty;
    var nowAllDone = (o.items || []).every(function(l){return (Number(l.received)||0) >= (Number(l.qty)||0);});
    if (nowAllDone) {
      o.status = 'delivered';
      o.deliveredAt = new Date().toISOString();
      addToast('All lines received — PO marked Delivered ✅', 'success');
      _surfaceFactoryAdvanceHint();
    } else {
      addToast('Received ' + qty + ' of ' + ordered + ' — partial', 'success');
    }
    _saveMaterialOrders(orders);
    renderPage();
  }

  // Receive every remaining unit on the PO at once. Iterates lines and writes
  // one stock movement per line that still has remaining qty.
  function receiveMatOrderAllLines(orderId) {
    var orders = _getMaterialOrders();
    var o = orders.find(function(x){return x.id === orderId;});
    if (!o) { addToast('PO not found', 'error'); return; }

    var anyReceived = false;
    var failed = false;
    (o.items || []).forEach(function(line) {
      var ordered  = Number(line.qty)      || 0;
      var received = Number(line.received) || 0;
      var remaining = Math.max(0, ordered - received);
      if (remaining > 0) {
        var ok = (typeof recordStockMovement === 'function')
          ? recordStockMovement(line.stockItemId, remaining, 'receive', 'mat_order', orderId, 'Received via ' + o.poNumber)
          : false;
        if (ok) {
          line.received = received + remaining;
          anyReceived = true;
        } else {
          failed = true;
        }
      }
    });

    if (!anyReceived) {
      addToast(failed ? 'Receive failed — check stock state' : 'Nothing left to receive', 'warning');
      return;
    }

    o.status = 'delivered';
    o.deliveredAt = new Date().toISOString();
    _saveMaterialOrders(orders);
    addToast('PO fully received ✅', 'success');
    _surfaceFactoryAdvanceHint();
    renderPage();
  }

  // After a delivery, count how many factory orders in 'materials_ordered'
  // status now have full BOM coverage (from predictShortfall). If any do, fire
  // a follow-up toast so the PM knows to check the Awaiting Material panel.
  // We do NOT auto-advance — that decision belongs to the PM, since stock
  // coverage at the category level doesn't guarantee the right SKUs are present
  // for a specific job.
  function _surfaceFactoryAdvanceHint() {
    var fos = _getFactoryOrders().filter(function(o){return o.status === 'materials_ordered';});
    if (!fos.length) return;
    var coverage = _getStockCoverage();
    var allCovered = coverage.length > 0 && coverage.every(function(c){return c.coverage >= 100;});
    if (allCovered) {
      addToast(fos.length + ' factory order' + (fos.length === 1 ? '' : 's') + ' now have full stock cover — review the Awaiting Material panel', 'info');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE REGISTRATION + SIDEBAR INJECTION
  // ═══════════════════════════════════════════════════════════════════════════
  // Stage 2 already wrapped renderDashboard, so we just register our renderer
  // on the registry. If for some reason Stage 2 hasn't loaded, set up the wrap
  // ourselves (idempotent — Stage 2 will skip if it sees us already wrapped).
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.receiving = function() { return renderReceivingPage(); };

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

  // Sidebar — insert "Receiving" entry after the Stock entry (which Stage 2
  // injects after the Stage 1 group). Same idempotent walking pattern.
  if (typeof window.renderSidebar === 'function' && !window._STAGE3_SIDEBAR_WRAPPED) {
    window._STAGE3_SIDEBAR_WRAPPED = true;
    var _origRenderSidebar = window.renderSidebar;
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      if (typeof canAccessPage === 'function' && !canAccessPage('receiving')) return html;
      // Idempotent
      if (html.indexOf("setState({page:'receiving'") >= 0) return html;

      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      var on = st.page === 'receiving';
      var entry = '<div class="nav-item' + (on ? ' on' : '') + '" '
        + 'data-action="receiving-nav-costreports" '
        + 'title="' + (!sidebarOpen ? 'Receiving' : '') + '">'
        + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">📥</span>'
        + (sidebarOpen ? '<span style="flex:1">Receiving</span>' : '')
        + '</div>';

      // Anchor at the Stock entry. Stock injects after factorybom + Stage 1 group,
      // so finding "page:'stock'" gives us the right insert point.
      var anchor = "setState({page:'stock'";
      var idx = html.indexOf(anchor);
      if (idx < 0) {
        // Stock not yet injected — fall back to the BOM anchor and walk past
        // any Stage 1 entries the same way Stage 2 does.
        anchor = "setState({page:'factorybom'";
        idx = html.indexOf(anchor);
        if (idx < 0) return html;
        var insertAt = html.indexOf('</div>', idx) + '</div>'.length;
        var stage1 = ['jobsreview','factoryqc','baymanagement'];
        var changed = true;
        while (changed) {
          changed = false;
          for (var i = 0; i < stage1.length; i++) {
            var pIdx = html.indexOf("setState({page:'" + stage1[i] + "'", insertAt);
            if (pIdx >= 0 && pIdx - insertAt < 200) {
              insertAt = html.indexOf('</div>', pIdx) + '</div>'.length;
              changed = true;
            }
          }
        }
        return html.slice(0, insertAt) + entry + html.slice(insertAt);
      }
      // Insert immediately after Stock's nav-item closing div
      var insertAt = html.indexOf('</div>', idx) + '</div>'.length;
      return html.slice(0, insertAt) + entry + html.slice(insertAt);
    };
  }

  // ── Window exports ─────────────────────────────────────────────────────────
  window.renderReceivingPage     = renderReceivingPage;
  window.receiveMatOrderLine     = receiveMatOrderLine;
  window.receiveMatOrderAllLines = receiveMatOrderAllLines;

  console.log('[43-factory-stage3-receiving] Receiving page registered (/receiving) and sidebar nav extended.');
})();
