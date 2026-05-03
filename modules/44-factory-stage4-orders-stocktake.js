// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 44-factory-stage4-orders-stocktake.js
// Stage 4 — Material Orders Lifecycle UI + Stocktake
//
//   renderMaterialOrders()  → /materialorders
//   renderStocktakePage()   → /stocktake
//
// Material Orders
//   List view: status filter chips, sortable PO table, "+ New PO"
//   Detail view: 5-step lifecycle pipeline (Draft→Sent→Confirmed→Dispatched
//     →Delivered), line items table, status transition buttons
//   Draft POs: add/remove/edit lines; sent+ POs are read-only
//   "Mark Delivered" delegates to Stage 3's receiveMatOrderAllLines so stock
//     is incremented exactly once via the canonical movements log
//
// Stocktake
//   Bulk count entry, items grouped by category
//   System / Counted / Variance columns; running variance value at top
//   Commit: one stock movement per non-zero variance (type='adjust',
//     refType='stocktake'); zero-variance items get lastCountedAt stamped
//
// Page-registration: same SPARTAN_EXTRA_PAGES pattern as Stages 2 & 3 — no
// patches to 99-init.js. Sidebar entries inserted after Receiving.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
  defineAction('stage4-nav-to-stock', function(target, ev) {
    navigateTo('stock');
  });
  defineAction('stage4-new-po', function(target, ev) {
    newMatOrder();
  });
  defineAction('stage4-filter-all', function(target, ev) {
    window._matOrderFilter = 'all';
    renderPage();
  });
  defineAction('stage4-filter-status', function(target, ev) {
    var status = target.dataset.status;
    window._matOrderFilter = status;
    renderPage();
  });
  defineAction('stage4-open-order', function(target, ev) {
    var orderId = target.dataset.orderId;
    window._matOrderDetailId = orderId;
    renderPage();
  });
  defineAction('stage4-back-to-orders', function(target, ev) {
    window._matOrderDetailId = null;
    renderPage();
  });
  defineAction('stage4-remove-line', function(target, ev) {
    var orderId = target.dataset.orderId;
    var lineIdx = parseInt(target.dataset.lineIdx, 10);
    removeMatOrderLine(orderId, lineIdx);
  });
  defineAction('stage4-add-line', function(target, ev) {
    var orderId = target.dataset.orderId;
    addMatOrderLine(orderId);
  });
  defineAction('stage4-advance-sent', function(target, ev) {
    var orderId = target.dataset.orderId;
    advanceMatOrder(orderId, 'sent');
  });
  defineAction('stage4-advance-confirmed', function(target, ev) {
    var orderId = target.dataset.orderId;
    advanceMatOrder(orderId, 'confirmed');
  });
  defineAction('stage4-advance-dispatched', function(target, ev) {
    var orderId = target.dataset.orderId;
    advanceMatOrder(orderId, 'dispatched');
  });
  defineAction('stage4-advance-delivered', function(target, ev) {
    var orderId = target.dataset.orderId;
    advanceMatOrder(orderId, 'delivered');
  });
  defineAction('stage4-nav-to-receiving', function(target, ev) {
    navigateTo('receiving');
  });
  defineAction('stage4-cancel-po', function(target, ev) {
    var orderId = target.dataset.orderId;
    cancelMatOrder(orderId);
  });
  defineAction('stage4-close-modal', function(target, ev) {
    if (ev && ev.target === target) {
      window._matOrderShowNew = false;
      renderPage();
    }
  });
  defineAction('stage4-hide-new-modal', function(target, ev) {
    window._matOrderShowNew = false;
    renderPage();
  });
  defineAction('stage4-create-draft', function(target, ev) {
    createMatOrderFromModal();
  });
  defineAction('stage4-reset-stocktake', function(target, ev) {
    resetStocktake();
  });
  defineAction('stage4-commit-stocktake', function(target, ev) {
    commitStocktake();
  });
  defineAction('stage4-stocktake-input', function(target, ev) {
    var itemId = target.dataset.itemId;
    window._stocktakeCounts[itemId] = target.value;
  });
  defineAction('stage4-sidebar-nav', function(target, ev) {
    var pageId = target.dataset.pageId;
    var pageState = {
      page: pageId,
      dealDetailId: null,
      leadDetailId: null,
      contactDetailId: null,
      jobDetailId: null
    };
    var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
    if (native) pageState.sidebarOpen = false;
    setState(pageState);
  });

  // Sanity check — Stage 2 helpers are needed for both pages
  if (typeof window.recordStockMovement !== 'function' || typeof window.getStockItems !== 'function') {
    console.warn('[44-factory-stage4] Stage 2 helpers missing. Module loaded out of order — expected after 40-factory-stage2-stock.js.');
  }
  // Stage 3's full-receive helper is preferred for the Mark-Delivered path.
  // We fall back to a local replica if it isn't loaded.
  var hasStage3 = (typeof window.receiveMatOrderAllLines === 'function');

  // ── Module state (hoisted to window for innerHTML rerender survival) ───────
  window._matOrderDetailId  = window._matOrderDetailId  || null;
  window._matOrderFilter    = window._matOrderFilter    || 'all';
  window._matOrderShowNew   = window._matOrderShowNew   || false;
  window._stocktakeCounts   = window._stocktakeCounts   || {};

  // ── PO status reference (exposed so future stages can reuse) ───────────────
  var MAT_ORDER_STATUSES = [
    { key:'draft',      label:'Draft',      color:'#9ca3af' },
    { key:'sent',       label:'Sent',       color:'#3b82f6' },
    { key:'confirmed',  label:'Confirmed',  color:'#7c3aed' },
    { key:'dispatched', label:'Dispatched', color:'#f59e0b' },
    { key:'delivered',  label:'Delivered',  color:'#22c55e' },
    { key:'cancelled',  label:'Cancelled',  color:'#ef4444' },
  ];
  var LIFECYCLE = ['draft','sent','confirmed','dispatched','delivered'];
  function _matOrderStatusObj(k) { return MAT_ORDER_STATUSES.find(function(s){return s.key===k;}) || MAT_ORDER_STATUSES[0]; }
  window.MAT_ORDER_STATUSES  = MAT_ORDER_STATUSES;
  window._matOrderStatusObj  = _matOrderStatusObj;

  // ── Persistence shims (Stage 2's helpers are closure-private, so we use the
  //    same localStorage keys directly) ────────────────────────────────────────
  function _getOrders() { return (typeof getMaterialOrders === 'function') ? getMaterialOrders() : []; }
  function _saveOrders(o){ localStorage.setItem('spartan_material_orders', JSON.stringify(o)); }
  function _getItems()  { return (typeof getStockItems === 'function') ? getStockItems() : []; }
  function _getSuppliers(){ return (typeof getSuppliers === 'function') ? getSuppliers() : []; }

  // ═══════════════════════════════════════════════════════════════════════════
  // MATERIAL ORDERS PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderMaterialOrders() {
    if (window._matOrderDetailId) return _renderMatOrderDetail(window._matOrderDetailId);

    var orders = _getOrders().slice().sort(function(a, b) {
      // Most recently-actioned first
      var ad = a.deliveredAt || a.dispatchedAt || a.confirmedAt || a.sentAt || a.expectedAt || 0;
      var bd = b.deliveredAt || b.dispatchedAt || b.confirmedAt || b.sentAt || b.expectedAt || 0;
      return new Date(bd) - new Date(ad);
    });

    var filtered = window._matOrderFilter === 'all'
      ? orders
      : orders.filter(function(o){return o.status === window._matOrderFilter;});

    var h = '<div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">'
      + '<div style="display:flex;align-items:center;gap:10px">'
      + '<button data-action="stage4-nav-to-stock" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">←</button>'
      + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">📋 Material Orders</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Purchase order lifecycle — Draft → Sent → Confirmed → Dispatched → Delivered</p></div></div>'
      + '<button data-action="stage4-new-po" class="btn-r" style="font-size:12px;padding:8px 16px;font-weight:700">+ New PO</button>'
      + '</div>';

    // Status filter chips (also serve as KPI counts)
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">';
    var allCount = orders.length;
    var allActive = window._matOrderFilter === 'all';
    h += '<button data-action="stage4-filter-all" style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid ' + (allActive ? '#c41230' : '#e5e7eb') + ';background:' + (allActive ? '#c41230' : '#fff') + ';color:' + (allActive ? '#fff' : '#374151') + ';cursor:pointer;font-family:inherit">All (' + allCount + ')</button>';
    MAT_ORDER_STATUSES.forEach(function(s) {
      var n = orders.filter(function(o){return o.status === s.key;}).length;
      var active = window._matOrderFilter === s.key;
      h += '<button data-action="stage4-filter-status" data-status="' + s.key + '" style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid ' + (active ? s.color : s.color + '50') + ';background:' + (active ? s.color : s.color + '15') + ';color:' + (active ? '#fff' : s.color) + ';cursor:pointer;font-family:inherit">' + s.label + ' (' + n + ')</button>';
    });
    h += '</div>';

    if (!filtered.length) {
      h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">'
        + '<div style="font-size:40px;margin-bottom:10px">📋</div>'
        + '<div style="font-size:14px;font-weight:600;color:#374151">No POs in ' + (window._matOrderFilter === 'all' ? 'the system' : '"' + _matOrderStatusObj(window._matOrderFilter).label + '"') + '</div>'
        + '<div style="font-size:12px;margin-top:4px">Click "+ New PO" or generate one from the Stock page reorder cards.</div></div>';
    } else {
      h += '<div class="card" style="padding:0;overflow:hidden">'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr><th class="th">PO Number</th><th class="th">Supplier</th><th class="th">Lines</th><th class="th">Total</th><th class="th">Expected</th><th class="th">Status</th><th class="th">Last Action</th><th class="th"></th></tr></thead><tbody>';
      filtered.forEach(function(o, i) {
        var s = _matOrderStatusObj(o.status);
        var lines = (o.items || []).length;
        var expDate = o.expectedAt ? new Date(o.expectedAt).toLocaleDateString('en-AU') : '—';
        var overdue = o.expectedAt && new Date(o.expectedAt) < new Date() && ['sent','confirmed','dispatched'].indexOf(o.status) >= 0;
        var lastAction = o.deliveredAt || o.dispatchedAt || o.confirmedAt || o.sentAt;
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + (overdue ? ';background:#fef2f2' : '') + '">'
          + '<td class="td" style="font-family:monospace;font-weight:700;color:#c41230">' + o.poNumber + '</td>'
          + '<td class="td">' + o.supplierName + '</td>'
          + '<td class="td">' + lines + '</td>'
          + '<td class="td" style="font-weight:600">$' + Number(o.total || 0).toLocaleString() + '</td>'
          + '<td class="td">' + expDate + (overdue ? ' <span style="color:#ef4444;font-weight:700;font-size:10px">⚠ OVERDUE</span>' : '') + '</td>'
          + '<td class="td"><span class="bdg" style="background:' + s.color + '20;color:' + s.color + ';border:1px solid ' + s.color + '40;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700">' + s.label + '</span></td>'
          + '<td class="td" style="font-size:11px;color:#6b7280">' + (lastAction ? new Date(lastAction).toLocaleDateString('en-AU') : '—') + '</td>'
          + '<td class="td"><button data-action="stage4-open-order" data-order-id="' + o.id + '" style="padding:3px 10px;font-size:10px;background:none;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-family:inherit;color:#374151">Open →</button></td>'
          + '</tr>';
      });
      h += '</tbody></table></div>';
    }

    if (window._matOrderShowNew) h += _renderNewMatOrderModal();
    return '<div>' + h + '</div>';
  }

  function _renderMatOrderDetail(orderId) {
    var orders = _getOrders();
    var o = orders.find(function(x){return x.id === orderId;});
    if (!o) { window._matOrderDetailId = null; return renderMaterialOrders(); }
    var stockItems = _getItems();
    var s = _matOrderStatusObj(o.status);
    var isDraft = o.status === 'draft';
    var isCancelled = o.status === 'cancelled';

    var h = '<div style="margin-bottom:14px;display:flex;align-items:center;gap:10px">'
      + '<button data-action="stage4-back-to-orders" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">← Orders</button>'
      + '<div style="flex:1"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:20px;margin:0">' + o.poNumber + '</h2>'
      + '<p style="color:#6b7280;font-size:12px;margin:3px 0 0">' + o.supplierName + ' · $' + Number(o.total || 0).toLocaleString() + ' · ' + (o.items || []).length + ' line' + ((o.items || []).length === 1 ? '' : 's') + '</p></div>'
      + '<span class="bdg" style="background:' + s.color + '20;color:' + s.color + ';border:1px solid ' + s.color + '40;font-size:11px;padding:4px 10px;border-radius:14px;font-weight:700">' + s.label + '</span>'
      + '</div>';

    // ── Lifecycle pipeline ───────────────────────────────────────────────────
    if (!isCancelled) h += _renderLifecyclePipeline(o);
    else h += '<div class="card" style="padding:14px 18px;margin-bottom:14px;border-left:4px solid #ef4444;background:#fef2f2;font-size:12px;color:#b91c1c">⚠ This PO was cancelled. No further actions are available.</div>';

    // ── Line items ───────────────────────────────────────────────────────────
    h += _renderMatOrderLines(o, stockItems, isDraft, isCancelled);

    // ── Notes ────────────────────────────────────────────────────────────────
    if (o.notes) {
      h += '<div class="card" style="padding:14px 18px;margin-bottom:14px;border-left:4px solid #3b82f6">'
        + '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Notes</div>'
        + '<div style="font-size:12px;color:#374151">' + o.notes + '</div></div>';
    }

    // ── Actions (sticky bar) ────────────────────────────────────────────────
    if (!isCancelled) h += _renderMatOrderActions(o);

    return '<div>' + h + '</div>';
  }

  function _renderLifecyclePipeline(o) {
    var idx = LIFECYCLE.indexOf(o.status);
    var h = '<div class="card" style="padding:14px 18px;margin-bottom:14px">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">';
    LIFECYCLE.forEach(function(k, i) {
      var ss = _matOrderStatusObj(k);
      var done = i <= idx;
      var current = i === idx;
      var ts = (k === 'draft' ? null
              : k === 'sent' ? o.sentAt
              : k === 'confirmed' ? o.confirmedAt
              : k === 'dispatched' ? o.dispatchedAt
              : k === 'delivered' ? o.deliveredAt
              : null);
      h += '<div style="flex:1;text-align:center;position:relative">'
        + '<div style="width:32px;height:32px;border-radius:50%;background:' + (done ? ss.color : '#e5e7eb') + ';color:#fff;font-weight:700;line-height:32px;font-size:12px;margin:0 auto;' + (current ? 'box-shadow:0 0 0 4px ' + ss.color + '40' : '') + '">' + (i + 1) + '</div>'
        + '<div style="font-size:10px;color:' + (done ? ss.color : '#9ca3af') + ';margin-top:4px;font-weight:' + (done ? '700' : '500') + '">' + ss.label + '</div>'
        + (ts ? '<div style="font-size:9px;color:#9ca3af;margin-top:1px">' + new Date(ts).toLocaleDateString('en-AU') + '</div>' : '')
        + '</div>';
      if (i < LIFECYCLE.length - 1) {
        var lineCol = i < idx ? _matOrderStatusObj(LIFECYCLE[i+1]).color : '#e5e7eb';
        h += '<div style="flex:1;height:2px;background:' + lineCol + ';margin:0 -10px;align-self:flex-start;margin-top:16px"></div>';
      }
    });
    h += '</div></div>';
    return h;
  }

  function _renderMatOrderLines(o, stockItems, isDraft, isCancelled) {
    var h = '<div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">'
      + '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
      + '<h4 style="font-size:13px;font-weight:700;margin:0">Order Lines (' + (o.items || []).length + ')</h4>'
      + (isDraft ? '<span style="font-size:11px;color:#6b7280">Draft — lines are editable</span>' : '<span style="font-size:11px;color:#9ca3af">Read-only — lines lock when PO is sent</span>')
      + '</div>';

    if (!(o.items || []).length) {
      h += '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No lines yet.' + (isDraft ? ' Add one below.' : '') + '</div>';
    } else {
      h += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr><th class="th">SKU</th><th class="th">Item</th><th class="th">Qty</th><th class="th">Unit Cost</th><th class="th">Line Total</th>'
        + (o.status !== 'draft' ? '<th class="th">Received</th>' : '')
        + (isDraft ? '<th class="th"></th>' : '')
        + '</tr></thead><tbody>';

      (o.items || []).forEach(function(li, i) {
        var it = stockItems.find(function(x){return x.id === li.stockItemId;}) || {};
        var ordered  = Number(li.qty)      || 0;
        var received = Number(li.received) || 0;
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td" style="font-family:monospace;font-size:11px;color:#6b7280">' + (it.sku || li.stockItemId) + '</td>'
          + '<td class="td">' + (it.name || '<span style="color:#ef4444">(item not found)</span>') + '</td>'
          + '<td class="td" style="font-weight:600">' + ordered + ' ' + (it.unit || '') + '</td>'
          + '<td class="td">$' + Number(li.unitCost || 0).toFixed(2) + '</td>'
          + '<td class="td" style="font-weight:600">$' + Number(li.lineTotal || 0).toFixed(2) + '</td>';
        if (o.status !== 'draft') {
          var pct = ordered > 0 ? Math.round(received / ordered * 100) : 0;
          h += '<td class="td"><span style="color:' + (pct === 100 ? '#22c55e' : received > 0 ? '#f59e0b' : '#9ca3af') + ';font-weight:' + (received > 0 ? '600' : '400') + '">' + received + ' / ' + ordered + (pct > 0 && pct < 100 ? ' (' + pct + '%)' : pct === 100 ? ' ✓' : '') + '</span></td>';
        }
        if (isDraft) {
          h += '<td class="td"><button data-action="stage4-remove-line" data-order-id="' + o.id + '" data-line-idx="' + i + '" style="padding:3px 8px;font-size:10px;background:none;border:1px solid #fca5a5;color:#b91c1c;border-radius:6px;cursor:pointer;font-family:inherit">Remove</button></td>';
        }
        h += '</tr>';
      });
      h += '<tr style="background:#fafafa;font-weight:700"><td class="td" colspan="4" style="text-align:right">Total</td><td class="td">$' + Number(o.total || 0).toLocaleString() + '</td>' + (o.status !== 'draft' ? '<td class="td"></td>' : '') + (isDraft ? '<td class="td"></td>' : '') + '</tr>';
      h += '</tbody></table>';
    }

    // ── Inline add-line form (drafts only) ─────────────────────────────────
    if (isDraft) h += _renderAddLineForm(o, stockItems);
    h += '</div>';
    return h;
  }

  function _renderAddLineForm(o, stockItems) {
    // Group stock items by category for the dropdown
    var bySupplier = stockItems.filter(function(it){return !o.supplierId || it.supplierId === o.supplierId;});
    var fallback   = stockItems.filter(function(it){return !bySupplier.find(function(x){return x.id===it.id;});});
    return '<div style="padding:12px 16px;background:#fafafa;border-top:1px solid #f0f0f0">'
      + '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px">+ Add Line</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'
      + '<div style="flex:2;min-width:240px">'
      + '<label style="font-size:10px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Item</label>'
      + '<select id="ml_item_' + o.id + '" style="width:100%;padding:7px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit">'
      + '<option value="">— Select an item —</option>'
      + (bySupplier.length ? '<optgroup label="Items from ' + (o.supplierName || 'this supplier') + '">' + bySupplier.map(function(it){return '<option value="' + it.id + '" data-cost="' + (it.costPerUnit || 0) + '">' + it.sku + ' — ' + it.name + ' (' + it.unit + ')</option>';}).join('') + '</optgroup>' : '')
      + (fallback.length ? '<optgroup label="Other items">' + fallback.map(function(it){return '<option value="' + it.id + '" data-cost="' + (it.costPerUnit || 0) + '">' + it.sku + ' — ' + it.name + ' (' + it.unit + ')</option>';}).join('') + '</optgroup>' : '')
      + '</select></div>'
      + '<div style="flex:0 0 100px"><label style="font-size:10px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Qty</label>'
      + '<input id="ml_qty_' + o.id + '" type="number" step="0.1" min="0" placeholder="0" style="width:100%;padding:7px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box"></div>'
      + '<div style="flex:0 0 110px"><label style="font-size:10px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Unit Cost ($)</label>'
      + '<input id="ml_cost_' + o.id + '" type="number" step="0.01" min="0" placeholder="auto" style="width:100%;padding:7px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box"></div>'
      + '<button data-action="stage4-add-line" data-order-id="' + o.id + '" class="btn-r" style="padding:8px 14px;font-size:11px;font-weight:700;flex-shrink:0">+ Add</button>'
      + '</div></div>';
  }

  function _renderMatOrderActions(o) {
    var h = '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:14px 18px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 4px 16px #00000010">';
    if (o.status === 'draft') {
      var noLines = !(o.items || []).length;
      h += '<button data-action="stage4-advance-sent" data-order-id="' + o.id + '" class="btn-r" style="padding:8px 16px;font-size:12px;font-weight:700"' + (noLines ? ' disabled style="opacity:.5;cursor:not-allowed"' : '') + '>📤 Send to Supplier</button>';
    }
    if (o.status === 'sent')       h += '<button data-action="stage4-advance-confirmed" data-order-id="' + o.id + '" class="btn-r" style="padding:8px 16px;font-size:12px;font-weight:700">✓ Mark Confirmed</button>';
    if (o.status === 'confirmed')  h += '<button data-action="stage4-advance-dispatched" data-order-id="' + o.id + '" class="btn-r" style="padding:8px 16px;font-size:12px;font-weight:700">🚚 Mark Dispatched</button>';
    if (o.status === 'dispatched') {
      h += '<button data-action="stage4-advance-delivered" data-order-id="' + o.id + '" class="btn-r" style="padding:8px 16px;font-size:12px;font-weight:700">📥 Mark Delivered (auto-receive remaining)</button>';
      h += '<button data-action="stage4-nav-to-receiving" class="btn-w" style="padding:8px 14px;font-size:12px">📥 Open in Receiving (line-by-line)</button>';
    }
    if (['draft','sent','confirmed'].indexOf(o.status) >= 0) {
      h += '<button data-action="stage4-cancel-po" data-order-id="' + o.id + '" class="btn-w" style="padding:8px 14px;font-size:12px;color:#ef4444">Cancel PO</button>';
    }
    h += '</div>';
    return h;
  }

  // ── New PO modal ───────────────────────────────────────────────────────────
  function _renderNewMatOrderModal() {
    var suppliers = _getSuppliers();
    if (!suppliers.length) {
      return '<div class="modal-bg" data-action="stage4-close-modal">'
        + '<div class="modal" style="max-width:420px"><div style="padding:20px 24px"><h3 style="margin:0 0 12px;font-size:15px">No suppliers configured</h3>'
        + '<p style="font-size:12px;color:#6b7280;margin:0 0 16px">Add at least one supplier (in localStorage `spartan_suppliers` for now) before drafting a PO.</p>'
        + '<button data-action="stage4-hide-new-modal" class="btn-w" style="font-size:12px">Close</button></div></div></div>';
    }
    return '<div class="modal-bg" data-action="stage4-close-modal">'
      + '<div class="modal" style="max-width:480px">'
      + '<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
      + '<h3 style="margin:0;font-size:15px;font-weight:700">+ New Material Order</h3>'
      + '<button data-action="stage4-hide-new-modal" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:20px;line-height:1">×</button></div>'
      + '<div style="padding:20px">'
      + '<label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Supplier</label>'
      + '<select id="mo_new_supplier" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;margin-bottom:12px;font-family:inherit">'
      + suppliers.map(function(s){return '<option value="' + s.id + '" data-lead="' + (s.leadDays || 7) + '">' + s.name + (s.leadDays ? ' (' + s.leadDays + 'd lead)' : '') + '</option>';}).join('')
      + '</select>'
      + '<label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Notes (optional)</label>'
      + '<textarea id="mo_new_notes" placeholder="Internal notes — purpose of this PO, special instructions…" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;font-family:inherit;min-height:64px;resize:vertical;box-sizing:border-box"></textarea>'
      + '<div style="font-size:11px;color:#6b7280;margin-top:10px;background:#f9fafb;padding:8px 10px;border-radius:6px">A draft PO will be created with no lines. Add line items in the next view.</div>'
      + '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">'
      + '<button data-action="stage4-hide-new-modal" class="btn-w" style="font-size:12px">Cancel</button>'
      + '<button data-action="stage4-create-draft" class="btn-r" style="font-size:12px">Create Draft</button>'
      + '</div></div></div></div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS — PO lifecycle + line management
  // ═══════════════════════════════════════════════════════════════════════════
  function newMatOrder() {
    window._matOrderShowNew = true;
    renderPage();
  }

  function createMatOrderFromModal() {
    var supplierEl = document.getElementById('mo_new_supplier');
    var notesEl    = document.getElementById('mo_new_notes');
    if (!supplierEl) return;
    var supId = supplierEl.value;
    var supplier = _getSuppliers().find(function(s){return s.id === supId;});
    if (!supplier) { addToast('Supplier not found','error'); return; }

    var existing = _getOrders();
    var o = {
      id:           'mo_' + Date.now(),
      poNumber:     'PO-' + new Date().getFullYear() + '-' + String(existing.length + 1).padStart(4, '0'),
      supplierId:   supplier.id,
      supplierName: supplier.name,
      status:       'draft',
      items:        [],
      total:        0,
      expectedAt:   new Date(Date.now() + (supplier.leadDays || 7) * 86400000).toISOString(),
      sentAt:null, confirmedAt:null, dispatchedAt:null, deliveredAt:null,
      notes:        notesEl ? (notesEl.value || '') : '',
    };
    _saveOrders(existing.concat([o]));

    window._matOrderShowNew = false;
    window._matOrderDetailId = o.id;
    addToast('Draft PO ' + o.poNumber + ' created — add line items','success');
    renderPage();
  }

  function addMatOrderLine(orderId) {
    var orders = _getOrders();
    var o = orders.find(function(x){return x.id === orderId;});
    if (!o) return;
    if (o.status !== 'draft') { addToast('Lines can only be added to draft POs','error'); return; }

    var itemEl = document.getElementById('ml_item_' + orderId);
    var qtyEl  = document.getElementById('ml_qty_'  + orderId);
    var costEl = document.getElementById('ml_cost_' + orderId);
    if (!itemEl || !qtyEl) return;

    var stockItemId = itemEl.value;
    var qty         = parseFloat(qtyEl.value || '0');
    if (!stockItemId) { addToast('Pick an item','error'); return; }
    if (!qty || qty <= 0) { addToast('Qty must be > 0','error'); return; }

    var stockItem = _getItems().find(function(i){return i.id === stockItemId;});
    if (!stockItem) { addToast('Stock item not found','error'); return; }

    // Unit cost: explicit override else item.costPerUnit
    var rawCost = (costEl && costEl.value !== '') ? parseFloat(costEl.value) : NaN;
    var unitCost = isFinite(rawCost) && rawCost >= 0 ? rawCost : (Number(stockItem.costPerUnit) || 0);

    var line = {
      stockItemId: stockItemId,
      qty: qty,
      unitCost: unitCost,
      lineTotal: qty * unitCost,
    };

    // Merge into existing line if same stockItemId already present (combined qty)
    var existingLineIdx = (o.items || []).findIndex(function(l){return l.stockItemId === stockItemId;});
    if (existingLineIdx >= 0) {
      var existingLine = o.items[existingLineIdx];
      existingLine.qty       = (Number(existingLine.qty) || 0) + qty;
      existingLine.unitCost  = unitCost;                          // last write wins on cost
      existingLine.lineTotal = existingLine.qty * unitCost;
      addToast('Existing line updated (combined qty)','success');
    } else {
      o.items = (o.items || []).concat([line]);
      addToast('Line added','success');
    }
    o.total = (o.items || []).reduce(function(t, l){return t + (Number(l.lineTotal) || 0);}, 0);
    _saveOrders(orders);
    renderPage();
  }

  function removeMatOrderLine(orderId, lineIdx) {
    var orders = _getOrders();
    var o = orders.find(function(x){return x.id === orderId;});
    if (!o) return;
    if (o.status !== 'draft') { addToast('Lines can only be removed from draft POs','error'); return; }
    o.items.splice(lineIdx, 1);
    o.total = (o.items || []).reduce(function(t, l){return t + (Number(l.lineTotal) || 0);}, 0);
    _saveOrders(orders);
    addToast('Line removed','success');
    renderPage();
  }

  function advanceMatOrder(orderId, toStatus) {
    var orders = _getOrders();
    var o = orders.find(function(x){return x.id === orderId;});
    if (!o) return;

    // Guard against skipping states (only allow forward 1 step at a time, plus
    // delivered as the special auto-receive transition from dispatched)
    var fromIdx = LIFECYCLE.indexOf(o.status);
    var toIdx   = LIFECYCLE.indexOf(toStatus);
    if (fromIdx < 0 || toIdx < 0 || toIdx !== fromIdx + 1) {
      addToast('Invalid status transition: ' + o.status + ' → ' + toStatus, 'error');
      return;
    }

    if (toStatus === 'sent' && !(o.items || []).length) {
      addToast('Cannot send a PO with no lines','error'); return;
    }

    if (toStatus === 'delivered') {
      // Delegate to Stage 3's full-receive helper so stock movements are
      // written through the canonical movements log. Falls back to a local
      // replica if Stage 3 isn't loaded.
      if (hasStage3) {
        receiveMatOrderAllLines(orderId);   // will set status + deliveredAt
        return;
      }
      // Fallback: receive remaining manually
      (o.items || []).forEach(function(line) {
        var ordered  = Number(line.qty)      || 0;
        var received = Number(line.received) || 0;
        var remaining = Math.max(0, ordered - received);
        if (remaining > 0 && typeof recordStockMovement === 'function') {
          if (recordStockMovement(line.stockItemId, remaining, 'receive', 'mat_order', orderId, 'Received via ' + o.poNumber)) {
            line.received = received + remaining;
          }
        }
      });
    }

    var stamp = new Date().toISOString();
    o.status = toStatus;
    if (toStatus === 'sent')       o.sentAt       = stamp;
    if (toStatus === 'confirmed')  o.confirmedAt  = stamp;
    if (toStatus === 'dispatched') o.dispatchedAt = stamp;
    if (toStatus === 'delivered')  o.deliveredAt  = stamp;
    _saveOrders(orders);
    addToast(_matOrderStatusObj(toStatus).label, 'success');
    renderPage();
  }

  function cancelMatOrder(orderId) {
    if (!confirm('Cancel this PO?\n\nThis cannot be undone — to bring it back, create a new draft.')) return;
    var orders = _getOrders().map(function(o) {
      return o.id === orderId ? Object.assign({}, o, { status:'cancelled' }) : o;
    });
    _saveOrders(orders);
    addToast('PO cancelled','warning');
    renderPage();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STOCKTAKE PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderStocktakePage() {
    var items = _getItems().slice().sort(function(a, b) {
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    });
    var STOCK_CATEGORIES = window.STOCK_CATEGORIES || [
      { id:'aluplast', label:'Aluplast', icon:'🧱' }, { id:'steel', label:'Steel', icon:'⚙️' },
      { id:'hardware', label:'Hardware', icon:'🔧' }, { id:'flyscreen', label:'Fly Screen', icon:'🪲' },
      { id:'timber', label:'Timber', icon:'🪵' }, { id:'beads', label:'Glazing Beads', icon:'📐' },
      { id:'ancillaries', label:'Ancillaries', icon:'📎' },
    ];

    // Totals
    var entered = Object.keys(window._stocktakeCounts).filter(function(k) {
      return window._stocktakeCounts[k] !== undefined && window._stocktakeCounts[k] !== '';
    }).length;

    var variance = 0;
    var varianceUp = 0, varianceDown = 0;
    Object.keys(window._stocktakeCounts).forEach(function(id) {
      var raw = window._stocktakeCounts[id];
      if (raw === undefined || raw === '') return;
      var item = items.find(function(i){return i.id === id;});
      if (!item) return;
      var counted = parseFloat(raw);
      if (isNaN(counted)) return;
      var delta = counted - (Number(item.onHand) || 0);
      var deltaValue = Math.abs(delta * (Number(item.costPerUnit) || 0));
      variance += deltaValue;
      if (delta > 0) varianceUp += deltaValue; else if (delta < 0) varianceDown += deltaValue;
    });

    // Header
    var h = '<div style="margin-bottom:20px;display:flex;align-items:center;gap:10px">'
      + '<button data-action="stage4-nav-to-stock" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">←</button>'
      + '<div style="flex:1"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">🔍 Stocktake</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Bulk count entry — variances are written as adjustment movements when you commit</p></div>'
      + '<button data-action="stage4-reset-stocktake" class="btn-w" style="font-size:12px;padding:8px 14px">↺ Reset</button>'
      + '<button data-action="stage4-commit-stocktake" class="btn-r" style="font-size:12px;padding:8px 18px;font-weight:700"' + (entered === 0 ? ' disabled style="opacity:.5;cursor:not-allowed"' : '') + '>✓ Commit Counts (' + entered + ')</button>'
      + '</div>';

    // KPI strip
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Items Entered',   v:entered + ' / ' + items.length, c:'#3b82f6' },
      { l:'Items Remaining', v:items.length - entered,         c:items.length - entered > 0 ? '#f59e0b' : '#22c55e' },
      { l:'Variance Value',  v:'$' + Math.round(variance).toLocaleString(), c:variance > 0 ? '#ef4444' : '#22c55e' },
      { l:'Net (+/-)',       v:'$' + Math.round(varianceUp).toLocaleString() + ' / -$' + Math.round(varianceDown).toLocaleString(), c:'#6b7280' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:' + (typeof k.v === 'string' && k.v.length > 12 ? '14' : '20') + 'px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    if (!items.length) {
      h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">No stock items yet. Add items via Receiving (Stage 3) or the Stock page.</div>';
      return '<div>' + h + '</div>';
    }

    // Tip card
    h += '<div class="card" style="padding:10px 16px;margin-bottom:12px;border-left:3px solid #3b82f6;font-size:11px;color:#1e3a8a;background:#eff6ff">'
      + '💡 Enter the physically-counted qty for each item. Items with no count entered are skipped on commit. Items where count matches the system get their <em>last counted</em> stamp updated without writing a movement.</div>';

    // Per-category sections
    STOCK_CATEGORIES.forEach(function(cat) {
      var rows = items.filter(function(i){return i.category === cat.id;});
      if (!rows.length) return;
      h += _renderStocktakeCategory(cat, rows);
    });

    return '<div>' + h + '</div>';
  }

  function _renderStocktakeCategory(cat, rows) {
    var counts = window._stocktakeCounts || {};
    var enteredHere = rows.filter(function(it){return counts[it.id] !== undefined && counts[it.id] !== '';}).length;

    var h = '<div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">'
      + '<div style="padding:10px 16px;border-bottom:1px solid #f0f0f0;background:#fafafa;display:flex;justify-content:space-between;align-items:center">'
      + '<h4 style="font-size:13px;font-weight:700;margin:0">' + cat.icon + ' ' + cat.label + ' (' + rows.length + ')</h4>'
      + '<span style="font-size:11px;color:#6b7280">' + enteredHere + ' / ' + rows.length + ' counted</span>'
      + '</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">SKU</th><th class="th">Item</th><th class="th">System Qty</th><th class="th" style="width:140px">Counted</th><th class="th">Variance</th><th class="th">Variance Value</th></tr></thead><tbody>';

    rows.forEach(function(it, i) {
      var raw = counts[it.id];
      var counted = (raw === undefined || raw === '') ? null : parseFloat(raw);
      var sys = Number(it.onHand) || 0;
      var delta = counted === null || isNaN(counted) ? null : counted - sys;
      var deltaCol  = delta === null ? '#9ca3af' : (Math.abs(delta) < 0.001 ? '#22c55e' : delta < 0 ? '#ef4444' : '#f59e0b');
      var deltaText = delta === null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(1);
      var deltaValue = delta === null ? null : Math.abs(delta * (Number(it.costPerUnit) || 0));
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="font-family:monospace;font-size:11px;color:#6b7280">' + it.sku + '</td>'
        + '<td class="td">' + it.name + '<span style="color:#9ca3af;font-size:10px"> · ' + (it.location || '—') + '</span></td>'
        + '<td class="td" style="color:#6b7280">' + sys + ' ' + it.unit + '</td>'
        + '<td class="td"><input type="number" step="0.1" min="0" data-action="stage4-stocktake-input" data-item-id="' + it.id + '" value="' + (raw === undefined ? '' : raw) + '" placeholder="—" style="width:100%;padding:5px 8px;border:1px solid ' + (raw !== undefined && raw !== '' ? '#bbf7d0' : '#e5e7eb') + ';border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box"></td>'
        + '<td class="td" style="color:' + deltaCol + ';font-weight:' + (delta !== null && Math.abs(delta) > 0.001 ? '700' : '400') + '">' + deltaText + '</td>'
        + '<td class="td" style="color:#6b7280">' + (deltaValue === null ? '—' : '$' + deltaValue.toFixed(0)) + '</td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function commitStocktake() {
    var keys = Object.keys(window._stocktakeCounts).filter(function(k) {
      return window._stocktakeCounts[k] !== undefined && window._stocktakeCounts[k] !== '';
    });
    if (!keys.length) { addToast('No counts entered yet','warning'); return; }
    if (!confirm('Commit ' + keys.length + ' counted item(s)?\n\nThis will write adjustment movements for any variances against the system on-hand totals.')) return;

    var items = _getItems();
    var adjustments = 0;
    var stamped = 0;
    var failed = 0;

    keys.forEach(function(id) {
      var item = items.find(function(i){return i.id === id;});
      if (!item) return;
      var raw = window._stocktakeCounts[id];
      var counted = parseFloat(raw);
      if (isNaN(counted) || counted < 0) { failed++; return; }
      var delta = counted - (Number(item.onHand) || 0);
      if (Math.abs(delta) > 0.001) {
        if (typeof recordStockMovement === 'function') {
          if (recordStockMovement(id, delta, 'adjust', 'stocktake', null, 'Stocktake variance')) {
            adjustments++;
          } else {
            failed++;
          }
        }
      } else {
        // Just stamp lastCountedAt (no movement needed)
        var arr = _getItems();
        localStorage.setItem('spartan_stock_items', JSON.stringify(arr.map(function(i) {
          return i.id === id ? Object.assign({}, i, { lastCountedAt:new Date().toISOString() }) : i;
        })));
        stamped++;
      }
    });

    window._stocktakeCounts = {};
    var msg = adjustments + ' adjustment' + (adjustments === 1 ? '' : 's') + ' written'
      + (stamped > 0 ? ', ' + stamped + ' confirmed unchanged' : '')
      + (failed > 0 ? ', ' + failed + ' failed' : '');
    addToast(msg, failed > 0 ? 'warning' : 'success');
    navigateTo('stock');
  }

  function resetStocktake() {
    if (!Object.keys(window._stocktakeCounts).length) return;
    if (!confirm('Discard all entered counts?')) return;
    window._stocktakeCounts = {};
    addToast('Counts cleared','warning');
    renderPage();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE REGISTRATION + SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.materialorders = function() { return renderMaterialOrders(); };
  window.SPARTAN_EXTRA_PAGES.stocktake      = function() { return renderStocktakePage(); };

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

  // Sidebar — insert "Material Orders" and "Stocktake" after the Receiving entry
  if (typeof window.renderSidebar === 'function' && !window._STAGE4_SIDEBAR_WRAPPED) {
    window._STAGE4_SIDEBAR_WRAPPED = true;
    var _origRenderSidebar = window.renderSidebar;
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      // Idempotent
      if (html.indexOf("setState({page:'materialorders'") >= 0) return html;

      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      function _entry(id, label, icon) {
        if (typeof canAccessPage === 'function' && !canAccessPage(id)) return '';
        var on = st.page === id;
        return '<div class="nav-item' + (on ? ' on' : '') + '" '
          + 'data-action="stage4-sidebar-nav" data-page-id="' + id + '" '
          + 'title="' + (!sidebarOpen ? label : '') + '">'
          + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">' + icon + '</span>'
          + (sidebarOpen ? '<span style="flex:1">' + label + '</span>' : '')
          + '</div>';
      }

      var injection = _entry('materialorders', 'Material Orders', '📋')
                    + _entry('stocktake',      'Stocktake',       '🔍');
      if (!injection) return html;

      // Anchor priority: receiving > stock > factorybom (each is the "latest"
      // sidebar entry whichever stage has loaded). Walk past any newer entries
      // to land at the correct insertion point.
      var anchors = ["setState({page:'receiving'", "setState({page:'stock'", "setState({page:'factorybom'"];
      var insertAt = -1;
      for (var i = 0; i < anchors.length; i++) {
        var idx = html.indexOf(anchors[i]);
        if (idx >= 0) { insertAt = html.indexOf('</div>', idx) + '</div>'.length; break; }
      }
      if (insertAt < 0) {
        // Last-resort: prepend to first nav-item
        var firstNav = html.indexOf('class="nav-item');
        if (firstNav < 0) return html;
        var divStart = html.lastIndexOf('<div', firstNav);
        return divStart < 0 ? html : html.slice(0, divStart) + injection + html.slice(divStart);
      }

      // Walk past any stage-1 entries that might come between (jobsreview etc.)
      var walkPast = ['jobsreview','factoryqc','baymanagement','stock','receiving'];
      var changed = true;
      while (changed) {
        changed = false;
        for (var j = 0; j < walkPast.length; j++) {
          var p = "setState({page:'" + walkPast[j] + "'";
          var pIdx = html.indexOf(p, insertAt);
          if (pIdx >= 0 && pIdx - insertAt < 200) {
            insertAt = html.indexOf('</div>', pIdx) + '</div>'.length;
            changed = true;
          }
        }
      }

      return html.slice(0, insertAt) + injection + html.slice(insertAt);
    };
  }

  // ── Window exports ─────────────────────────────────────────────────────────
  window.renderMaterialOrders     = renderMaterialOrders;
  window.renderStocktakePage      = renderStocktakePage;
  window.newMatOrder              = newMatOrder;
  window.createMatOrderFromModal  = createMatOrderFromModal;
  window.addMatOrderLine          = addMatOrderLine;
  window.removeMatOrderLine       = removeMatOrderLine;
  window.advanceMatOrder          = advanceMatOrder;
  window.cancelMatOrder           = cancelMatOrder;
  window.commitStocktake          = commitStocktake;
  window.resetStocktake           = resetStocktake;

  console.log('[44-factory-stage4-orders-stocktake] /materialorders and /stocktake registered; sidebar nav extended.');
})();
