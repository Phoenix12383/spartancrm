// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 40-factory-stage2-stock.js
// Stage 2 — Stock Module (7-tab inventory page)
//
//   renderStockPage()  → /stock
//
// Provides:
//   • 7 category tabs (Aluplast, Steel, Hardware, Fly Screen, Timber, Beads,
//     Ancillaries) with per-item tracking, status badges, on-order qty
//   • Auto-reorder cards for any item below reorderPoint that isn't already on
//     order — bulk "Generate All POs" or per-item "Order"
//   • Predicted shortfall forecast — projects coverage % per category against
//     pending factory orders' BOM requirements
//   • Stock adjustment modal — Receive / Consume / Adjust, all routed through
//     a single recordStockMovement() that writes to the movements log
//
// Data model (all in localStorage):
//   spartan_stock_items      — array of stock items (see seed in 02b-mock-stock-data)
//   spartan_stock_movements  — append-only audit log of every quantity change
//   spartan_material_orders  — POs (data populated here, full UI in Stage 4)
//   spartan_suppliers        — suppliers (referenced by stock items + POs)
//
// Page-registration pattern:
//   This module registers /stock with the SPARTAN_EXTRA_PAGES global registry
//   and wraps renderDashboard once to dispatch from it. Future stages register
//   their pages the same way — no patches to 99-init.js needed.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS (data-action / data-on-* delegation)
  // ═══════════════════════════════════════════════════════════════════════════
  defineAction('stock-nav-back', function(target, ev) {
    navigateTo('factorydash');
  });

  defineAction('stock-gen-all-pos', function(target, ev) {
    generateAllReorderPOs();
  });

  defineAction('stock-gen-reorder-po', function(target, ev) {
    var itemId = target.dataset.itemId;
    if (itemId) generateReorderPO(itemId);
  });

  defineAction('stock-tab-select', function(target, ev) {
    var catId = target.dataset.categoryId;
    if (catId) {
      window._stockTab = catId;
      renderPage();
    }
  });

  defineAction('stock-open-adjust', function(target, ev) {
    var itemId = target.dataset.itemId;
    if (itemId) {
      window._stockEditId = itemId;
      renderPage();
    }
  });

  defineAction('stock-modal-bg-close', function(target, ev) {
    if (ev.target === target) {
      window._stockEditId = null;
      renderPage();
    }
  });

  defineAction('stock-modal-close', function(target, ev) {
    window._stockEditId = null;
    renderPage();
  });

  defineAction('stock-modal-cancel', function(target, ev) {
    window._stockEditId = null;
    renderPage();
  });

  defineAction('stock-apply-adjust', function(target, ev) {
    var itemId = target.dataset.itemId;
    if (itemId) applyStockAdjust(itemId);
  });

  defineAction('stock-sidebar-nav', function(target, ev) {
    var st = (typeof getState === 'function') ? getState() : {};
    var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
    setState({
      page:'stock',
      dealDetailId:null,
      leadDetailId:null,
      contactDetailId:null,
      jobDetailId:null,
      sidebarOpen: native ? false : st.sidebarOpen
    });
  });

  // ── Module state ───────────────────────────────────────────────────────────
  // Hoisted to window so the inline onclick handlers in the rendered HTML can
  // mutate them (the render is innerHTML-driven, no closures survive).
  window._stockTab    = window._stockTab    || 'aluplast';
  window._stockEditId = window._stockEditId || null;

  // ── Stock categories ───────────────────────────────────────────────────────
  var STOCK_CATEGORIES = [
    { id:'aluplast',    label:'Aluplast',     icon:'🧱', color:'#7c3aed' },
    { id:'steel',       label:'Steel',        icon:'⚙️',  color:'#6b7280' },
    { id:'hardware',    label:'Hardware',     icon:'🔧', color:'#06b6d4' },
    { id:'flyscreen',   label:'Fly Screen',   icon:'🪲', color:'#a855f7' },
    { id:'timber',      label:'Timber',       icon:'🪵', color:'#92400e' },
    { id:'beads',       label:'Glazing Beads',icon:'📐', color:'#3b82f6' },
    { id:'ancillaries', label:'Ancillaries',  icon:'📎', color:'#9ca3af' },
  ];
  window.STOCK_CATEGORIES = STOCK_CATEGORIES;

  // ── Persistence ────────────────────────────────────────────────────────────
  function getStockItems()      { try{return JSON.parse(localStorage.getItem('spartan_stock_items')||'[]');}catch(e){return [];} }
  function saveStockItems(it)   { localStorage.setItem('spartan_stock_items', JSON.stringify(it)); }
  function getStockMovements()  { try{return JSON.parse(localStorage.getItem('spartan_stock_movements')||'[]');}catch(e){return [];} }
  function saveStockMovements(m){ localStorage.setItem('spartan_stock_movements', JSON.stringify(m)); }
  function getMaterialOrders()  { try{return JSON.parse(localStorage.getItem('spartan_material_orders')||'[]');}catch(e){return [];} }
  function saveMaterialOrders(o){ localStorage.setItem('spartan_material_orders', JSON.stringify(o)); }
  function getSuppliers()       { try{return JSON.parse(localStorage.getItem('spartan_suppliers')||'[]');}catch(e){return [];} }
  function saveSuppliers(s)     { localStorage.setItem('spartan_suppliers', JSON.stringify(s)); }

  // ── Stock status helper ────────────────────────────────────────────────────
  // Returns one of: critical | low | ok | over. Tied to onHand vs reorderPoint
  // (with a buffer halfway-below-reorder that flips it to 'critical') and an
  // optional maxStock threshold for 'over'. Out-of-stock collapses to 'critical'.
  function stockStatusOf(item) {
    var oh = Number(item.onHand) || 0;
    var rp = Number(item.reorderPoint) || 0;
    if (oh <= 0)              return { key:'critical', label:'OUT OF STOCK', color:'#ef4444' };
    if (oh < rp * 0.5)        return { key:'critical', label:'CRITICAL',     color:'#ef4444' };
    if (oh < rp)              return { key:'low',      label:'LOW',          color:'#f59e0b' };
    if (oh > (item.maxStock || rp * 4)) return { key:'over', label:'OVERSTOCKED', color:'#a855f7' };
    return { key:'ok', label:'OK', color:'#22c55e' };
  }

  // Quantity already inbound on active POs (sent / confirmed / dispatched).
  // Excludes draft (not committed) and delivered (already received).
  function stockOnOrderQty(itemId) {
    var orders = getMaterialOrders();
    return orders.reduce(function(sum, o) {
      if (['sent','confirmed','dispatched'].indexOf(o.status) < 0) return sum;
      var line = (o.items || []).find(function(li){return li.stockItemId === itemId;});
      return sum + (line ? Number(line.qty) || 0 : 0);
    }, 0);
  }

  // ── Stock movement (single source of truth for any qty change) ─────────────
  // qty is signed: positive = stock in, negative = stock out. Returns true on
  // success, false on validation failure (with a toast).
  function recordStockMovement(itemId, qty, type, refType, refId, notes) {
    var items = getStockItems();
    var item  = items.find(function(i){return i.id === itemId;});
    if (!item) { addToast('Stock item not found', 'error'); return false; }

    var newOnHand = (Number(item.onHand) || 0) + Number(qty);
    if (newOnHand < 0) { addToast('Insufficient stock for ' + item.name, 'error'); return false; }

    saveStockItems(items.map(function(i) {
      return i.id === itemId ? Object.assign({}, i, {
        onHand:        newOnHand,
        lastReceivedAt: type === 'receive' ? new Date().toISOString() : i.lastReceivedAt,
        lastCountedAt:  type === 'adjust'  ? new Date().toISOString() : i.lastCountedAt,
      }) : i;
    }));

    var mv = {
      id:     'mv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      itemId: itemId,
      qty:    Number(qty),
      type:   type,
      refType:refType || null,
      refId:  refId   || null,
      at:     new Date().toISOString(),
      by:     (typeof getCurrentUser === 'function' && getCurrentUser() ? (getCurrentUser().name || 'system') : 'system'),
      notes:  notes || '',
    };
    saveStockMovements(getStockMovements().concat([mv]));
    return true;
  }

  // ── Auto-reorder cards ─────────────────────────────────────────────────────
  // An item earns a reorder card if it's below reorderPoint AND not already on
  // order. Sorted critical-first, then low.
  function autoReorderCards() {
    return getStockItems()
      .map(function(it) { return { item:it, status:stockStatusOf(it), onOrder:stockOnOrderQty(it.id) }; })
      .filter(function(r) { return r.onOrder <= 0 && (r.status.key === 'low' || r.status.key === 'critical'); })
      .sort(function(a, b) { return (a.status.key === 'critical' ? 0 : 1) - (b.status.key === 'critical' ? 0 : 1); });
  }

  // ── Predicted shortfall forecast ───────────────────────────────────────────
  // Looks at active factory orders that haven't started production and projects
  // material requirements per category against current stock. Coarse model
  // (matches the BOM estimate in 16e _reviewTabMaterials) — coverage is an
  // indicator, not a binding constraint.
  function predictShortfall() {
    var items  = getStockItems();
    var orders = (typeof getFactoryOrders === 'function') ? getFactoryOrders() : [];
    var frames = (typeof getFactoryItems  === 'function') ? getFactoryItems()  : [];

    var pendingFrames = frames.filter(function(f) {
      var ord = orders.find(function(o){return o.jid === f.orderId;});
      if (!ord) return false;
      return ['received','bom_generated','materials_ordered'].indexOf(ord.status) >= 0;
    });
    var totalPerim = pendingFrames.reduce(function(s, f) {
      return s + 2 * (((f.widthMm || f.width || 0) + (f.heightMm || f.height || 0)) / 1000);
    }, 0);
    var n = pendingFrames.length;

    var demand = {
      aluplast:    totalPerim * 1.10 * 1.05,
      steel:       totalPerim * 0.80 * 1.05,
      hardware:    n,
      flyscreen:   Math.ceil(n * 0.7),
      timber:      totalPerim * 1.20 * 1.10,
      beads:       totalPerim * 0.90 * 1.08,
      ancillaries: n * 4,
    };

    var supply = {};
    items.forEach(function(it) { supply[it.category] = (supply[it.category] || 0) + (Number(it.onHand) || 0); });

    return STOCK_CATEGORIES.map(function(cat) {
      var d = demand[cat.id] || 0;
      var s = supply[cat.id] || 0;
      var coverage = d > 0 ? Math.min(100, Math.round(s / d * 100)) : 100;
      return { category:cat, demand:d, supply:s, shortfall:Math.max(0, d - s), coverage:coverage };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  function renderStockPage() {
    var items     = getStockItems();
    var matOrders = getMaterialOrders();
    var reorder   = autoReorderCards();
    var shortfall = predictShortfall();

    var totalValue   = items.reduce(function(s, i){return s + (Number(i.onHand) || 0) * (Number(i.costPerUnit) || 0);}, 0);
    var lowCount     = items.filter(function(i){var st = stockStatusOf(i); return st.key === 'low' || st.key === 'critical';}).length;
    var onOrderCount = matOrders.filter(function(o){return ['sent','confirmed','dispatched'].indexOf(o.status) >= 0;}).length;

    // Header
    var h = '<div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">'
      + '<div style="display:flex;align-items:center;gap:10px">'
      + '<button data-action="stock-nav-back" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">←</button>'
      + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">📦 Stock & Materials</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Per-item inventory across 7 categories — auto-reorder &amp; shortfall forecasting</p></div></div>'
      + '<div style="font-size:11px;color:#9ca3af">Receiving / Material Orders / Stocktake — coming in Stages 3–4</div>'
      + '</div>';

    // KPI strip
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">';
    [
      { l:'Total Items',     v:items.length,                                 c:'#3b82f6' },
      { l:'Low / Critical',  v:lowCount,                                     c:lowCount > 0 ? '#ef4444' : '#22c55e' },
      { l:'POs On the Way',  v:onOrderCount,                                 c:'#f59e0b' },
      { l:'Stock Value',     v:'$' + Math.round(totalValue).toLocaleString(),c:'#22c55e' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    // Auto-reorder cards
    if (reorder.length) {
      h += '<div class="card" style="padding:16px;margin-bottom:14px;border-left:4px solid #ef4444">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">'
        + '<div><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">⚡ Auto-Reorder Recommendations (' + reorder.length + ')</div>'
        + '<div style="font-size:11px;color:#6b7280;margin-top:2px">Items below reorder point with no PO already in flight. Bulk action drafts one PO per supplier.</div></div>'
        + '<button data-action="stock-gen-all-pos" class="btn-r" style="font-size:11px;padding:6px 14px;font-weight:700;flex-shrink:0">Generate All PO Drafts</button>'
        + '</div>';
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px">';
      reorder.slice(0, 8).forEach(function(r) {
        var bg = r.status.key === 'critical' ? '#fef2f2' : '#fffbeb';
        h += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;background:' + bg + '">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:12px;font-weight:700;color:#374151;line-height:1.3">' + r.item.name + '</div>'
          + '<div style="font-size:10px;color:#9ca3af;margin-top:2px;font-family:monospace">' + r.item.sku + ' · onHand ' + r.item.onHand + ' ' + r.item.unit + ' · reorder at ' + r.item.reorderPoint + '</div>'
          + '</div>'
          + '<span style="font-size:9px;background:' + r.status.color + ';color:#fff;padding:2px 6px;border-radius:10px;font-weight:700;flex-shrink:0;white-space:nowrap">' + r.status.label + '</span>'
          + '</div>'
          + '<button data-action="stock-gen-reorder-po" data-item-id="' + r.item.id + '" style="margin-top:8px;width:100%;padding:5px;font-size:11px;font-weight:600;background:#fff;border:1px solid #c41230;color:#c41230;border-radius:6px;cursor:pointer;font-family:inherit">Draft PO — order ' + r.item.reorderQty + ' ' + r.item.unit + ' →</button>'
          + '</div>';
      });
      if (reorder.length > 8) {
        h += '<div style="display:flex;align-items:center;justify-content:center;border:1px dashed #e5e7eb;border-radius:8px;padding:12px;font-size:11px;color:#9ca3af">+' + (reorder.length - 8) + ' more — switch tabs to view by category</div>';
      }
      h += '</div></div>';
    }

    // Shortfall forecast
    h += '<div class="card" style="padding:14px 18px;margin-bottom:14px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '<div><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">🔮 Predicted Coverage — Active Factory Orders</div>'
      + '<div style="font-size:11px;color:#6b7280;margin-top:2px">% of estimated BOM demand currently in stock, per category.</div></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">';
    shortfall.forEach(function(f) {
      var col = f.coverage >= 100 ? '#22c55e' : f.coverage >= 70 ? '#f59e0b' : '#ef4444';
      h += '<div style="text-align:center;padding:10px 6px;border:1px solid ' + col + '40;border-radius:8px;background:' + col + '10">'
        + '<div style="font-size:16px">' + f.category.icon + '</div>'
        + '<div style="font-size:18px;font-weight:800;color:' + col + ';font-family:Syne,sans-serif;margin-top:2px">' + f.coverage + '%</div>'
        + '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + f.category.label + '</div>'
        + (f.shortfall > 0 ? '<div style="font-size:9px;color:#ef4444;font-weight:600;margin-top:2px">short ' + f.shortfall.toFixed(0) + '</div>' : '<div style="font-size:9px;color:#22c55e;margin-top:2px">covered</div>')
        + '</div>';
    });
    h += '</div></div>';

    // Tabs
    h += '<div style="display:flex;border-bottom:2px solid #e5e7eb;margin-bottom:14px;overflow-x:auto;gap:0">';
    STOCK_CATEGORIES.forEach(function(c) {
      var active = window._stockTab === c.id;
      var n = items.filter(function(i){return i.category === c.id;}).length;
      var lowN = items.filter(function(i){if (i.category !== c.id) return false; var st = stockStatusOf(i); return st.key === 'low' || st.key === 'critical';}).length;
      h += '<button data-action="stock-tab-select" data-category-id="' + c.id + '" style="padding:10px 14px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:' + (active ? '700' : '500') + ';color:' + (active ? '#c41230' : '#6b7280') + ';border-bottom:3px solid ' + (active ? '#c41230' : 'transparent') + ';margin-bottom:-2px;white-space:nowrap;font-family:inherit;display:inline-flex;align-items:center;gap:5px">'
        + c.icon + ' ' + c.label + ' <span style="font-weight:400;color:#9ca3af">(' + n + ')</span>'
        + (lowN > 0 ? ' <span style="background:#ef4444;color:#fff;border-radius:8px;padding:1px 5px;font-size:9px;font-weight:700">' + lowN + '</span>' : '')
        + '</button>';
    });
    h += '</div>';

    // Tab body
    h += _renderStockTabBody(window._stockTab, items);

    // Modal
    if (window._stockEditId) h += _renderStockAdjustModal();
    return '<div>' + h + '</div>';
  }

  function _renderStockTabBody(catId, items) {
    var cat = STOCK_CATEGORIES.find(function(c){return c.id === catId;});
    if (!cat) return '';

    var rows = items.filter(function(i){return i.category === catId;}).slice().sort(function(a, b) {
      var sa = stockStatusOf(a).key, sb = stockStatusOf(b).key;
      var rank = { critical:0, low:1, ok:2, over:3 };
      return (rank[sa] || 9) - (rank[sb] || 9) || a.name.localeCompare(b.name);
    });

    if (!rows.length) {
      return '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">'
        + '<div style="font-size:40px;margin-bottom:10px">' + cat.icon + '</div>'
        + '<div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px">No ' + cat.label + ' items yet</div>'
        + '<div style="font-size:12px">Items appear here once added or received via Stage 3 Receiving.</div></div>';
    }

    var h = '<div class="card" style="padding:0;overflow:hidden">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">SKU</th><th class="th">Item</th><th class="th">On Hand</th><th class="th">Reorder Pt</th><th class="th">Status</th><th class="th">On Order</th><th class="th">Last Received</th><th class="th">Value</th><th class="th">Actions</th></tr></thead><tbody>';
    rows.forEach(function(it, i) {
      var st     = stockStatusOf(it);
      var onOrd  = stockOnOrderQty(it.id);
      var value  = (Number(it.onHand) || 0) * (Number(it.costPerUnit) || 0);
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="font-family:monospace;font-size:11px;color:#6b7280">' + it.sku + '</td>'
        + '<td class="td"><div style="font-weight:600;color:#374151">' + it.name + '</div>'
        + '<div style="font-size:10px;color:#9ca3af">' + (it.location || '—') + (it.subcategory ? ' · ' + it.subcategory : '') + '</div></td>'
        + '<td class="td" style="font-weight:700;color:' + st.color + '">' + it.onHand + ' <span style="font-weight:400;color:#9ca3af">' + it.unit + '</span></td>'
        + '<td class="td" style="color:#6b7280">' + it.reorderPoint + '</td>'
        + '<td class="td"><span style="font-size:9px;background:' + st.color + ';color:#fff;padding:2px 6px;border-radius:10px;font-weight:700">' + st.label + '</span></td>'
        + '<td class="td">' + (onOrd > 0 ? '<span style="color:#3b82f6;font-weight:600">' + onOrd + ' ' + it.unit + '</span>' : '<span style="color:#d1d5db">—</span>') + '</td>'
        + '<td class="td" style="color:#6b7280;font-size:11px">' + (it.lastReceivedAt ? new Date(it.lastReceivedAt).toLocaleDateString('en-AU') : '—') + '</td>'
        + '<td class="td" style="font-weight:600">$' + value.toFixed(0) + '</td>'
        + '<td class="td" style="white-space:nowrap">'
        + '<button data-action="stock-open-adjust" data-item-id="' + it.id + '" style="padding:3px 8px;font-size:10px;background:none;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-family:inherit;color:#374151">Adjust</button>'
        + ' <button data-action="stock-gen-reorder-po" data-item-id="' + it.id + '" style="padding:3px 8px;font-size:10px;background:none;border:1px solid #c41230;color:#c41230;border-radius:6px;cursor:pointer;font-family:inherit">Order</button>'
        + '</td></tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function _renderStockAdjustModal() {
    var item = getStockItems().find(function(i){return i.id === window._stockEditId;});
    if (!item) return '';
    return '<div class="modal-bg" data-action="stock-modal-bg-close">'
      + '<div class="modal" style="max-width:440px">'
      + '<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
      + '<h3 style="margin:0;font-size:15px;font-weight:700">Adjust Stock — ' + item.name + '</h3>'
      + '<button data-action="stock-modal-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:20px;line-height:1">×</button>'
      + '</div>'
      + '<div style="padding:20px">'
      + '<div style="background:#f9fafb;padding:10px 12px;border-radius:8px;font-size:12px;margin-bottom:14px;color:#374151">'
      + 'Currently: <strong>' + item.onHand + ' ' + item.unit + '</strong> · Reorder at ' + item.reorderPoint + ' · ' + item.sku + '</div>'
      + '<label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Action</label>'
      + '<select id="stk_adj_type" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;margin-bottom:12px;font-family:inherit">'
      + '<option value="receive">Receive (add to stock)</option>'
      + '<option value="consume">Consume (subtract from stock)</option>'
      + '<option value="adjust">Adjust (set new total)</option>'
      + '</select>'
      + '<label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Quantity (' + item.unit + ')</label>'
      + '<input id="stk_adj_qty" type="number" step="0.1" placeholder="0" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:12px;font-family:inherit;box-sizing:border-box">'
      + '<label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Notes</label>'
      + '<input id="stk_adj_notes" type="text" placeholder="Reason / reference…" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box">'
      + '<div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">'
      + '<button data-action="stock-modal-cancel" class="btn-w" style="font-size:12px">Cancel</button>'
      + '<button data-action="stock-apply-adjust" data-item-id="' + window._stockEditId + '" class="btn-r" style="font-size:12px">Apply</button>'
      + '</div></div></div></div>';
  }

  function applyStockAdjust(itemId) {
    var typeEl  = document.getElementById('stk_adj_type');
    var qtyEl   = document.getElementById('stk_adj_qty');
    var notesEl = document.getElementById('stk_adj_notes');
    if (!typeEl || !qtyEl) return;
    var type  = typeEl.value;
    var qty   = parseFloat(qtyEl.value || '0');
    var notes = notesEl ? (notesEl.value || '') : '';
    if (!qty || qty <= 0) { addToast('Quantity must be > 0', 'error'); return; }

    var item = getStockItems().find(function(i){return i.id === itemId;});
    if (!item) return;

    var ok = false;
    if (type === 'receive')      ok = recordStockMovement(itemId,  qty, 'receive', 'manual', null, notes);
    else if (type === 'consume') ok = recordStockMovement(itemId, -qty, 'consume', 'manual', null, notes);
    else if (type === 'adjust') {
      var delta = qty - (Number(item.onHand) || 0);
      ok = recordStockMovement(itemId, delta, 'adjust', 'manual', null, notes || ('Adjusted to ' + qty));
    }
    if (ok) {
      addToast('Stock updated', 'success');
      window._stockEditId = null;
      renderPage();
    }
  }

  // ── PO drafting (data writes only — full UI in Stage 4) ────────────────────
  function _nextPoNumber(existingCount) {
    return 'PO-' + new Date().getFullYear() + '-' + String(existingCount + 1).padStart(4, '0');
  }

  function generateReorderPO(itemId) {
    var item = getStockItems().find(function(i){return i.id === itemId;});
    if (!item) return;
    var supplier = getSuppliers().find(function(s){return s.id === item.supplierId;}) || { id:item.supplierId || 'sup_misc', name:'Unknown supplier', leadDays:7 };
    var qty   = Number(item.reorderQty) || Math.max(1, Number(item.reorderPoint) || 10);
    var unit  = Number(item.costPerUnit) || 0;
    var existing = getMaterialOrders();
    var o = {
      id:          'mo_' + Date.now(),
      poNumber:    _nextPoNumber(existing.length),
      supplierId:  supplier.id,
      supplierName:supplier.name,
      status:      'draft',
      items:       [{ stockItemId:itemId, qty:qty, unitCost:unit, lineTotal:qty * unit }],
      total:       qty * unit,
      expectedAt:  new Date(Date.now() + (supplier.leadDays || 7) * 86400000).toISOString(),
      sentAt:null, confirmedAt:null, dispatchedAt:null, deliveredAt:null,
      notes:       'Auto-generated from reorder threshold (' + item.sku + ').',
    };
    saveMaterialOrders(existing.concat([o]));
    addToast('Draft PO created for ' + item.name + ' — open in Stage 4 Material Orders', 'success');
    renderPage();
  }

  function generateAllReorderPOs() {
    var cards = autoReorderCards();
    if (!cards.length) { addToast('Nothing to reorder', 'warning'); return; }
    var bySup = {};
    cards.forEach(function(c) {
      var sid = c.item.supplierId || 'sup_misc';
      bySup[sid] = bySup[sid] || [];
      bySup[sid].push(c.item);
    });

    var existing = getMaterialOrders();
    var created = 0;
    var draftPOs = [];
    Object.keys(bySup).forEach(function(sid) {
      var supplier = getSuppliers().find(function(s){return s.id === sid;}) || { id:sid, name:'Unknown', leadDays:7 };
      var its = bySup[sid];
      var total = 0;
      var lines = its.map(function(it) {
        var qty  = Number(it.reorderQty) || 10;
        var unit = Number(it.costPerUnit) || 0;
        total += qty * unit;
        return { stockItemId:it.id, qty:qty, unitCost:unit, lineTotal:qty * unit };
      });
      draftPOs.push({
        id:          'mo_' + Date.now() + '_' + created,
        poNumber:    _nextPoNumber(existing.length + created),
        supplierId:  supplier.id,
        supplierName:supplier.name,
        status:      'draft',
        items:       lines,
        total:       total,
        expectedAt:  new Date(Date.now() + (supplier.leadDays || 7) * 86400000).toISOString(),
        sentAt:null, confirmedAt:null, dispatchedAt:null, deliveredAt:null,
        notes:       'Auto-generated bulk reorder.',
      });
      created++;
    });
    saveMaterialOrders(existing.concat(draftPOs));
    addToast(created + ' draft PO' + (created === 1 ? '' : 's') + ' created — open in Stage 4 Material Orders', 'success');
    renderPage();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE REGISTRY + DISPATCHER
  // ═══════════════════════════════════════════════════════════════════════════
  // Goal: register /stock as a routable page WITHOUT patching 99-init.js.
  //
  // 99-init.js's pageRenderers map falls through to renderDashboard for any
  // unknown page key. We hook that fall-through: maintain a single global
  // SPARTAN_EXTRA_PAGES registry that future stages append to, and wrap
  // renderDashboard exactly once to dispatch from it. The wrapper is
  // idempotent — re-loading this module won't double-wrap.
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.stock = function() { return renderStockPage(); };

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

  // ═══════════════════════════════════════════════════════════════════════════
  // SIDEBAR NAV INJECTION
  // ═══════════════════════════════════════════════════════════════════════════
  // Adds a "Stock" entry to the factory sidebar. Same idempotent injection
  // pattern as Stage 1: wrap renderSidebar, find the BOM nav item as the
  // anchor, insert after it (keeping us grouped with the supply-chain pages).
  if (typeof window.renderSidebar === 'function' && !window._STAGE2_SIDEBAR_WRAPPED) {
    window._STAGE2_SIDEBAR_WRAPPED = true;
    var _origRenderSidebar = window.renderSidebar;
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      if (typeof canAccessPage === 'function' && !canAccessPage('stock')) return html;
      // Idempotent — don't double-inject on re-render
      if (html.indexOf("setState({page:'stock'") >= 0) return html;

      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      var on = st.page === 'stock';
      var label = 'Stock';
      var icon = '📦';

      var entry = '<div class="nav-item' + (on ? ' on' : '') + '" '
        + 'data-action="stock-sidebar-nav"'
        + 'title="' + (!sidebarOpen ? label : '') + '">'
        + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">' + icon + '</span>'
        + (sidebarOpen ? '<span style="flex:1">' + label + '</span>' : '')
        + '</div>';

      // Anchor: BOM & Cut Sheets nav item (also used by Stage 1 sidebar wrap).
      // We insert AFTER any Stage 1 entries already injected (jobsreview /
      // factoryqc / baymanagement) by walking forward from the anchor through
      // each immediate sibling nav-item. This keeps Stock grouped with the
      // production-floor pages but after the QA/dispatch ones.
      var anchor = "setState({page:'factorybom'";
      var idx = html.indexOf(anchor);
      if (idx < 0) {
        // Fallback: prepend before first nav-item
        var firstNav = html.indexOf('class="nav-item');
        if (firstNav < 0) return html;
        var divStart = html.lastIndexOf('<div', firstNav);
        return divStart < 0 ? html : html.slice(0, divStart) + entry + html.slice(divStart);
      }
      // Find end of factorybom nav-item div, then walk past any Stage 1 entries
      var insertAt = html.indexOf('</div>', idx) + '</div>'.length;
      // Walk over Stage 1 entries (jobsreview / factoryqc / baymanagement) so
      // Stock lands AFTER them, not BEFORE.
      var stage1Pages = ['jobsreview', 'factoryqc', 'baymanagement'];
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = 0; i < stage1Pages.length; i++) {
          var probe = "setState({page:'" + stage1Pages[i] + "'";
          var probeIdx = html.indexOf(probe, insertAt);
          // Only walk past if it's *immediately* after our current insertAt
          // (i.e. the next nav-item, with only whitespace between).
          if (probeIdx >= 0 && probeIdx - insertAt < 200) {
            insertAt = html.indexOf('</div>', probeIdx) + '</div>'.length;
            changed = true;
          }
        }
      }
      return html.slice(0, insertAt) + entry + html.slice(insertAt);
    };
  }

  // ── Window exports ─────────────────────────────────────────────────────────
  window.renderStockPage       = renderStockPage;
  window.applyStockAdjust      = applyStockAdjust;
  window.generateReorderPO     = generateReorderPO;
  window.generateAllReorderPOs = generateAllReorderPOs;
  window.recordStockMovement   = recordStockMovement;
  window.getStockItems         = getStockItems;
  window.getStockMovements     = getStockMovements;
  window.getMaterialOrders     = getMaterialOrders;
  window.getSuppliers          = getSuppliers;
  window.predictShortfall      = predictShortfall;
  window.autoReorderCards      = autoReorderCards;
  window.stockStatusOf         = stockStatusOf;
  window.stockOnOrderQty       = stockOnOrderQty;

  console.log('[40-factory-stage2-stock] Stock page registered (/stock) and sidebar nav extended.');
})();
