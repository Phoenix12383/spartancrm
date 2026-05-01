// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/16-factory-crm.js
// Factory CRM render functions and the renderer classes that back them.
//
// Each renderer corresponds to a page in the Operations Manual v3.1 workflow:
//   - renderFactoryDashboard  → daily snapshot (Ch. 4 §1 morning gate, §3 floor)
//   - renderProdQueue         → Production Queue (Ch. 4 §2 status flow)
//   - renderProdBoard         → Kanban floor view (Ch. 4 §2.2 manufacturing line)
//   - renderFactoryBom        → BOM & Cut Sheets (Ch. 2 §5.2 list generation)
//   - renderFactoryCapacity   → $175k/wk + station load (Ch. 5 §2.1, Ch. 4 §3)
//   - renderFactoryDispatch   → Cut Tick + One-by-One Pack (Ch. 4 §5)
//   - renderFactoryAudit      → audit log + Red Tag Loss Sheet (Ch. 4 §3.2/§4.1)
//
// Globals exposed (per CONTRACT.md):
//   FactoryDashboardRenderer, ProductionQueueRenderer, ProductionBoardRenderer,
//   FactoryBomRenderer, FactoryCapacityRenderer, FactoryDispatchRenderer,
//   FactoryAuditRenderer
//   renderFactoryDashboard, renderProdQueue, renderProdBoard, renderFactoryBom,
//   renderFactoryCapacity, renderFactoryDispatch, renderFactoryAudit
//
// Depends on (loaded before this file): 24-factory-state.js,
// 25-factory-persistence.js, 23-factory-helpers.js, plus shared globals
// from 05-state-auth-rbac.js and 07-shared-ui.js.
// ═════════════════════════════════════════════════════════════════════════════

// ── Renderer base class ──────────────────────────────────────────────────────
// All renderers share the same shell: a header, the body HTML, and helpers
// for stat tiles. Pulled out to avoid duplication across the seven pages.

class FactoryRendererBase {
  static header(title, subtitle, emoji) {
    return '<div style="margin-bottom:20px">'
      + '<h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">'
      + (emoji ? emoji + ' ' : '') + title + '</h2>'
      + (subtitle ? '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">' + subtitle + '</p>' : '')
      + '</div>';
  }

  static statTile(label, value, color) {
    return '<div class="card" style="padding:14px 18px;border-left:4px solid ' + color + '">'
      + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + label + '</div>'
      + '<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + color + ';margin-top:4px">' + value + '</div>'
      + '</div>';
  }

  static emptyState(emoji, message) {
    return '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">'
      + '<div style="font-size:36px;margin-bottom:8px">' + emoji + '</div>' + message + '</div>';
  }

  static branchFilter(orders) {
    var branch = (typeof getState === 'function' ? getState().branch : 'all') || 'all';
    return branch === 'all' ? orders : (orders || []).filter(function(o){ return o.branch === branch; });
  }

  // Tiny tag pill — used for ORDER_LOCK, HOLD, RED_TAG, etc.
  static tag(label, color) {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;background:' + color + '20;color:' + color + ';border:1px solid ' + color + '40;margin-right:4px">' + label + '</span>';
  }
}

// ── Factory Dashboard (Ch. 4 §1) ─────────────────────────────────────────────

class FactoryDashboardRenderer extends FactoryRendererBase {
  static render() {
    var orders = FactoryRendererBase.branchFilter(getFactoryOrders());
    var items  = getFactoryItems();
    var jobs   = (typeof getState === 'function' ? getState().jobs : []) || [];

    // Awaiting entry: jobs with Final Signed Order but no factory record.
    var awaiting = jobs.filter(function(j){
      return j.finalSignedAt && !j.productionStatus && j.status !== 'h_completed_standard' && j.status !== 'i_cancelled';
    });
    var inFactory = orders.filter(function(o){ return o.status !== 'dispatched'; });
    var dispatched = orders.filter(function(o){ return o.status === 'dispatched'; });

    var stationLoad = CapacityCalculator.stationLoad(items, FACTORY_STATIONS_FROM_MANUAL);

    var h = FactoryRendererBase.header('Factory CRM', 'Production management — from signed-off designs through to dispatch', '🏭');

    // Stat tiles row
    h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">'
      + FactoryRendererBase.statTile('Awaiting Entry', awaiting.length, '#c41230')
      + FactoryRendererBase.statTile('In Factory', inFactory.length, '#f59e0b')
      + FactoryRendererBase.statTile('Frames on Floor', items.filter(function(i){ return i.station !== 'complete'; }).length, '#3b82f6')
      + FactoryRendererBase.statTile('Dispatched', dispatched.length, '#22c55e')
      + FactoryRendererBase.statTile('Factory Value', '$' + Math.round(inFactory.reduce(function(s,o){ return s + (o.value||0); }, 0) / 1000) + 'k', '#a855f7')
      + '</div>';

    // Station load bar
    h += '<div class="card" style="padding:16px;margin-bottom:16px">'
      + '<div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:12px">Station Load (Manufacturing Line — Ch. 4 §2.2)</div>'
      + '<div style="display:flex;gap:8px">';
    FACTORY_STATIONS_FROM_MANUAL.forEach(function(s){
      var stat = stationLoad[s.id] || { count: 0, cap: s.cap, pct: 0 };
      var col  = stat.pct > 80 ? '#ef4444' : stat.pct > 50 ? '#f59e0b' : stat.count > 0 ? '#22c55e' : '#d1d5db';
      h += '<div style="flex:1;text-align:center;padding:10px 6px;border-radius:8px;background:' + col + '10;border:1px solid ' + col + '30">'
        + '<div style="font-size:16px">' + s.icon + '</div>'
        + '<div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:' + col + '">' + stat.count + '</div>'
        + '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + s.name + '</div>'
        + '<div style="font-size:8px;color:#9ca3af">cap: ' + s.cap + '/day</div>'
        + '</div>';
    });
    h += '</div></div>';

    // Awaiting entry list
    if (awaiting.length > 0) {
      h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">'
        + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0">'
        + '<h4 style="font-size:14px;font-weight:700;margin:0">⚡ Ready to Enter Production (' + awaiting.length + ')</h4></div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
        + '<th class="th">Job</th><th class="th">Status</th><th class="th">Final Signed</th><th class="th"></th></tr></thead><tbody>';
      awaiting.forEach(function(j, i){
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td" style="font-weight:700;color:#c41230">' + (j.jobNumber || '') + '</td>'
          + '<td class="td">' + (j.status || '') + '</td>'
          + '<td class="td">' + (j.finalSignedAt ? new Date(j.finalSignedAt).toLocaleDateString('en-AU') : '—') + '</td>'
          + '<td class="td"><button onclick="pushJobToFactory(\'' + j.id + '\')" class="btn-r" style="font-size:10px;padding:4px 14px">🏭 Send to Factory</button></td></tr>';
      });
      h += '</tbody></table></div>';
    }

    return '<div>' + h + '</div>';
  }
}

// ── Production Queue (Ch. 4 §2) ──────────────────────────────────────────────

class ProductionQueueRenderer extends FactoryRendererBase {
  static render() {
    var orders = FactoryRendererBase.branchFilter(getFactoryOrders());
    var h = FactoryRendererBase.header('Production Queue', 'All factory orders — Ascora status d.1 → d.5 → e', '📋');

    // Status pills
    h += '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">';
    FACTORY_ASCORA_STATUSES.forEach(function(s){
      var count = orders.filter(function(o){ return o.status === s.key; }).length;
      h += '<span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;background:'
        + s.col + '15;color:' + s.col + ';border:1px solid ' + s.col + '30">' + s.label + ' (' + count + ')</span>';
    });
    h += '</div>';

    if (orders.length === 0) {
      h += FactoryRendererBase.emptyState('🏭', 'No orders. Jobs appear after Final Sign Off → Send to Factory.');
      return '<div>' + h + '</div>';
    }

    h += '<div class="card" style="padding:0;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
      + '<th class="th">Job</th><th class="th">Kind</th><th class="th">Customer</th><th class="th">Frames</th>'
      + '<th class="th">Status</th><th class="th">Tags</th><th class="th">Dispatch</th></tr></thead><tbody>';
    orders.forEach(function(o, i){
      var st = FACTORY_ASCORA_STATUSES.find(function(s){ return s.key === o.status; }) || FACTORY_ASCORA_STATUSES[0];
      var kind = (o.kind === FACTORY_ORDER_KIND.SERVICE) ? 'S' : 'O';
      var tags = '';
      (o.tags || []).forEach(function(t){
        var col = t === FACTORY_TAGS.HOLD ? '#ef4444' : t === FACTORY_TAGS.ORDER_LOCK ? '#7c3aed' : '#6b7280';
        tags += FactoryRendererBase.tag(t, col);
      });
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="font-weight:700;color:#c41230">' + (o.jid || o.klaesNumber || o.id) + '</td>'
        + '<td class="td">' + FactoryRendererBase.tag(kind, kind === 'S' ? '#a855f7' : '#3b82f6') + '</td>'
        + '<td class="td">' + (o.customer || '—') + '</td>'
        + '<td class="td">' + (o.frameCount || 0) + '</td>'
        + '<td class="td"><span class="bdg" style="background:' + st.col + '20;color:' + st.col + ';border:1px solid ' + st.col + '40;font-size:10px">' + st.label + '</span></td>'
        + '<td class="td">' + (tags || '—') + '</td>'
        + '<td class="td">' + (o.dispatchDate || '—') + '</td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    return '<div>' + h + '</div>';
  }
}

// ── Production Board / Kanban (Ch. 4 §2.2) ───────────────────────────────────

class ProductionBoardRenderer extends FactoryRendererBase {
  static render() {
    var items = getFactoryItems();
    var h = FactoryRendererBase.header('Production Board', 'Kanban — d.3 Cutting → d.4 Welding → d.5 Hardware → Dispatch', '📊');

    if (items.length === 0) {
      h += FactoryRendererBase.emptyState('🏭', 'No frames in production.');
      return '<div>' + h + '</div>';
    }

    h += '<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:10px">';
    FACTORY_STATIONS_FROM_MANUAL.forEach(function(stn, sIdx){
      var stnItems = items.filter(function(i){ return i.station === stn.id; });
      var nextStn  = sIdx < FACTORY_STATIONS_FROM_MANUAL.length - 1 ? FACTORY_STATIONS_FROM_MANUAL[sIdx + 1] : null;

      h += '<div style="min-width:200px;flex:1;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;display:flex;flex-direction:column">'
        + '<div style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">'
        + '<span style="font-size:16px">' + stn.icon + '</span>'
        + '<div style="font-size:12px;font-weight:700;margin-top:2px">' + stn.name + '</div>'
        + '<div style="font-size:10px;color:#9ca3af">' + stnItems.length + '/' + stn.cap + '</div></div>'
        + '<div style="flex:1;padding:6px;display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto">';

      if (stnItems.length === 0) h += '<div style="color:#d1d5db;font-size:10px;text-align:center;padding:12px">—</div>';
      stnItems.forEach(function(it){
        h += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px;font-size:10px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center">'
          + '<span style="font-weight:700;color:#c41230">' + (it.name || '') + '</span></div>'
          + '<div style="color:#6b7280;margin-top:2px">' + (it.widthMm || 0) + '×' + (it.heightMm || 0) + 'mm</div>'
          + '<div style="color:#9ca3af;font-size:9px">' + (it.customer || '') + ' · ' + (it.suburb || '') + '</div>'
          + (it.rework ? '<div style="color:#ef4444;font-weight:700;font-size:9px;margin-top:2px">⚠️ REWORK</div>' : '')
          + (nextStn
              ? '<button onclick="assignToStation(\'' + it.id + '\',\'' + nextStn.id + '\')" style="margin-top:4px;width:100%;padding:3px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;font-size:9px;cursor:pointer;color:#3b82f6;font-weight:600">→ ' + nextStn.name + '</button>'
              : '<button onclick="completeStation(\'' + it.id + '\')" style="margin-top:4px;width:100%;padding:3px;border:none;border-radius:4px;background:#22c55e;font-size:9px;cursor:pointer;color:#fff;font-weight:600">✅ Complete</button>')
          + '</div>';
      });
      h += '</div></div>';
    });
    h += '</div>';
    return '<div>' + h + '</div>';
  }
}

// ── BOM & Cut Sheets (Ch. 2 §5.2) ────────────────────────────────────────────

class FactoryBomRenderer extends FactoryRendererBase {
  static render() {
    var orders = FactoryRendererBase.branchFilter(getFactoryOrders());
    var h = FactoryRendererBase.header('BOM & Cut Sheets', 'Klaes-style: Cutting · Assembly · Glass · E-Control · Master Checklist', '📋');

    if (orders.length === 0) {
      h += FactoryRendererBase.emptyState('📋', 'No factory orders yet.');
      return '<div>' + h + '</div>';
    }

    h += '<div class="card" style="padding:0;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
      + '<th class="th">Job</th><th class="th">Frames</th><th class="th">Profile</th><th class="th">Reveal Deduction</th><th class="th">Cut Lines</th><th class="th">Glass Lines</th></tr></thead><tbody>';
    orders.forEach(function(o, i){
      try {
        var bom = generateBOM(o.frames || [], { profileSystem: o.profileSystem || 'ideal_4000' });
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td" style="font-weight:700;color:#c41230">' + (o.jid || o.id) + '</td>'
          + '<td class="td">' + (o.frameCount || (o.frames || []).length) + '</td>'
          + '<td class="td">' + bom.profileSystem + '</td>'
          + '<td class="td">−' + bom.revealDeductionMm + 'mm</td>'
          + '<td class="td">' + bom.cuttingList.length + '</td>'
          + '<td class="td">' + bom.glassList.length + '</td></tr>';
      } catch (e) {
        h += '<tr><td class="td" colspan="6" style="color:#ef4444">⚠ ' + (o.jid || o.id) + ': ' + e.message + '</td></tr>';
      }
    });
    h += '</tbody></table></div>';

    h += '<div class="card" style="padding:16px;margin-top:16px;border-left:3px solid #3b82f6">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:4px">ℹ️ Klaes Reveal Deductions (Ch. 2 §1.2)</div>'
      + '<div style="font-size:12px;color:#6b7280">Standard / Vario 2-Track: −' + KLAES_REVEAL_DEDUCTIONS_MM.STANDARD_VARIO_2T + 'mm · Vario 3-Track: −' + KLAES_REVEAL_DEDUCTIONS_MM.VARIO_3T + 'mm. Float glass is rejected by the BOM engine — Ch. 2 §1.2 mandates safety glass selection.</div></div>';

    return '<div>' + h + '</div>';
  }
}

// ── Capacity Planner (Ch. 5 §2.1 + Ch. 4 §3) ─────────────────────────────────

class FactoryCapacityRenderer extends FactoryRendererBase {
  static render() {
    var items = getFactoryItems();
    var jobs  = (typeof getState === 'function' ? getState().jobs : []) || [];
    var thisWeek = jobs.filter(function(j){
      if (!j.installDate) return false;
      var d = new Date(j.installDate);
      var now = new Date();
      var diff = (d - now) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    });

    var revenue = CapacityCalculator.weeklyRevenueLoad(thisWeek);
    var stationLoad = CapacityCalculator.stationLoad(items, FACTORY_STATIONS_FROM_MANUAL);

    var h = FactoryRendererBase.header('Capacity Planner', 'KPI: $175k installed revenue/week · 2 finished windows/installer/day', '📈');

    // Revenue tile
    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">'
      + FactoryRendererBase.statTile('This Week Revenue', '$' + Math.round(revenue.revenue / 1000) + 'k', revenue.meetsTarget ? '#22c55e' : '#ef4444')
      + FactoryRendererBase.statTile('Target', '$' + Math.round(revenue.target / 1000) + 'k', '#3b82f6')
      + FactoryRendererBase.statTile('% of Target', revenue.pctOfTarget + '%', revenue.meetsTarget ? '#22c55e' : '#f59e0b')
      + '</div>';

    // Station load detail
    h += '<div class="card" style="padding:16px;margin-bottom:16px"><div style="font-size:13px;font-weight:700;margin-bottom:12px">Station Capacity</div>';
    FACTORY_STATIONS_FROM_MANUAL.forEach(function(s){
      var stat = stationLoad[s.id] || { count: 0, cap: s.cap, pct: 0 };
      var col  = stat.pct > 80 ? '#ef4444' : stat.pct > 50 ? '#f59e0b' : '#22c55e';
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        + '<div style="width:140px;font-size:11px">' + s.icon + ' ' + s.name + '</div>'
        + '<div style="flex:1;height:10px;background:#f3f4f6;border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, stat.pct) + '%;background:' + col + '"></div></div>'
        + '<div style="width:80px;text-align:right;font-size:11px;color:' + col + ';font-weight:700">' + stat.count + '/' + stat.cap + ' (' + stat.pct + '%)</div></div>';
    });
    h += '</div>';

    return '<div>' + h + '</div>';
  }
}

// ── Dispatch (Ch. 4 §5) ──────────────────────────────────────────────────────

class FactoryDispatchRenderer extends FactoryRendererBase {
  static render() {
    var orders = FactoryRendererBase.branchFilter(getFactoryOrders());
    var ready  = orders.filter(function(o){ return o.status === 'ready_dispatch' || o.status === 'e_dispatch_standard' || o.status === 'e1_dispatch_service'; });
    var done   = orders.filter(function(o){ return o.status === 'dispatched' || o.status === 'f_installing'; });

    var h = FactoryRendererBase.header('Dispatch', 'Cut Tick Protocol (Ch. 4 §5.1) · Service One-by-One Pack (§5.2) · Bay Assignment (§5.3)', '🚚');

    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">'
      + FactoryRendererBase.statTile('Ready', ready.length, '#06b6d4')
      + FactoryRendererBase.statTile('Dispatched', done.length, '#22c55e') + '</div>';

    if (ready.length === 0 && done.length === 0) {
      h += FactoryRendererBase.emptyState('🚚', 'No dispatch activity.');
      return '<div>' + h + '</div>';
    }

    function row(o, i, color) {
      var kind = (o.kind === FACTORY_ORDER_KIND.SERVICE) ? 'S' : 'O';
      return '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="font-weight:700;color:' + color + '">' + (o.jid || o.id) + '</td>'
        + '<td class="td">' + FactoryRendererBase.tag(kind, kind === 'S' ? '#a855f7' : '#3b82f6') + '</td>'
        + '<td class="td">' + (o.customer || '—') + '</td>'
        + '<td class="td">' + (o.address || '—') + '</td>'
        + '<td class="td">' + (o.frameCount || 0) + '</td>'
        + '<td class="td">' + (o.bayNumber || '—') + '</td></tr>';
    }

    if (ready.length > 0) {
      h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">'
        + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;background:#ecfeff">'
        + '<h4 style="font-size:14px;font-weight:700;margin:0;color:#0e7490">📦 Ready for Dispatch</h4></div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
        + '<th class="th">Job</th><th class="th">Kind</th><th class="th">Client</th><th class="th">Address</th><th class="th">Frames</th><th class="th">Bay</th></tr></thead><tbody>';
      ready.forEach(function(o, i){ h += row(o, i, '#0e7490'); });
      h += '</tbody></table></div>';
    }

    if (done.length > 0) {
      h += '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;background:#f0fdf4">'
        + '<h4 style="font-size:14px;font-weight:700;margin:0;color:#15803d">✅ Dispatched</h4></div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
        + '<th class="th">Job</th><th class="th">Kind</th><th class="th">Client</th><th class="th">Address</th><th class="th">Frames</th><th class="th">Bay</th></tr></thead><tbody>';
      done.forEach(function(o, i){ h += row(o, i, '#15803d'); });
      h += '</tbody></table></div>';
    }

    return '<div>' + h + '</div>';
  }
}

// ── Audit Log + Red Tag Loss Sheet (Ch. 4 §3.2 / §4.1) ───────────────────────

class FactoryAuditRenderer extends FactoryRendererBase {
  static render() {
    var redTags = (typeof loadFactoryRedTags === 'function') ? loadFactoryRedTags() : [];
    var auditLog = (typeof _factoryState !== 'undefined' && _factoryState) ? (_factoryState.get().auditLog || []) : [];

    var humanCount   = redTags.filter(function(r){ return r.cause === 'human'; }).length;
    var machineCount = redTags.filter(function(r){ return r.cause === 'machine'; }).length;
    var totalLoss    = redTags.reduce(function(s, r){ return s + (Number(r.lossValue) || 0); }, 0);

    var h = FactoryRendererBase.header('Factory Audit', 'Red Tag Loss Sheet & End-of-Day Audit (Ch. 4 §3.2, §4.1)', '🔍');

    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">'
      + FactoryRendererBase.statTile('Red Tags (Total)', redTags.length, '#ef4444')
      + FactoryRendererBase.statTile('Human Cause', humanCount, '#f59e0b')
      + FactoryRendererBase.statTile('Machine Cause', machineCount, '#7c3aed')
      + FactoryRendererBase.statTile('Loss Value', '$' + Math.round(totalLoss).toLocaleString(), '#c41230')
      + '</div>';

    if (redTags.length > 0) {
      h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">'
        + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0;color:#ef4444">🔴 Red Tag Loss Sheet</h4></div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
        + '<th class="th">When</th><th class="th">Job</th><th class="th">Station</th><th class="th">Category</th><th class="th">Cause</th><th class="th">Loss</th><th class="th">Notes</th></tr></thead><tbody>';
      redTags.slice().reverse().forEach(function(rt, i){
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td">' + new Date(rt.at).toLocaleString('en-AU') + '</td>'
          + '<td class="td">' + (rt.jobNumber || '—') + '</td>'
          + '<td class="td">' + (rt.station || '—') + '</td>'
          + '<td class="td">' + (rt.category || '—') + '</td>'
          + '<td class="td">' + FactoryRendererBase.tag(rt.cause || '—', rt.cause === 'machine' ? '#7c3aed' : '#f59e0b') + '</td>'
          + '<td class="td">$' + Number(rt.lossValue || 0).toLocaleString() + '</td>'
          + '<td class="td" style="color:#6b7280">' + (rt.notes || '—') + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }

    if (auditLog.length > 0) {
      h += '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">📜 Station Audit Log</h4></div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
        + '<th class="th">When</th><th class="th">Type</th><th class="th">Station</th><th class="th">Item</th><th class="th">Operator</th></tr></thead><tbody>';
      auditLog.slice().reverse().slice(0, 50).forEach(function(e, i){
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td">' + new Date(e.at).toLocaleString('en-AU') + '</td>'
          + '<td class="td">' + (e.type || '—') + '</td>'
          + '<td class="td">' + (e.station || '—') + '</td>'
          + '<td class="td">' + (e.itemId || '—') + '</td>'
          + '<td class="td">' + (e.operator || '—') + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }

    if (redTags.length === 0 && auditLog.length === 0) {
      h += FactoryRendererBase.emptyState('🔍', 'No audit activity yet.');
    }

    return '<div>' + h + '</div>';
  }
}

// ── Coexistence with the legacy split (modules/16*-factory-*.js) ────────────
//
// The renderer classes above are the "manual-flavored" view of the factory
// pages — they read the new FACTORY_STATIONS_FROM_MANUAL (cutting / milling /
// assembly / dispatch) station IDs and the new FACTORY_ASCORA_STATUSES keys
// (d.1, d.2, ...). The CRM today still stores data with the legacy station
// IDs and status keys, so calling these classes against live data won't show
// existing items.
//
// To keep the app working, the global render entry points (renderFactoryDash,
// renderProdQueue, renderProdBoard, renderFactoryBOM, renderFactoryCapacity,
// renderFactoryDispatch) are LEFT to the legacy modules/16d-factory-pages.js
// and modules/16c-factory-capacity.js. Do NOT redefine them here.
//
// The bindings below are net-new only:
//   - renderFactoryDashboard / renderFactoryBom  : casing-friendly aliases
//                                                  pointing at the legacy fns
//   - renderFactoryAudit                         : a TRULY new page (Red Tag
//                                                  Loss Sheet + station audit)
//                                                  — no legacy equivalent.
//
// To wire the audit page into the sidebar/router, add `factoryaudit:
// renderFactoryAudit` to pageRenderers in 99-init.js and a sidebar entry.

(function aliasNewNamesToLegacy(){
  if (typeof window === 'undefined') return;
  if (typeof renderFactoryDash === 'function' && typeof renderFactoryDashboard !== 'function') {
    window.renderFactoryDashboard = renderFactoryDash;
  }
  if (typeof renderFactoryBOM === 'function' && typeof renderFactoryBom !== 'function') {
    window.renderFactoryBom = renderFactoryBOM;
  }
})();

// New page — no legacy equivalent. Safe to expose under its own name.
function renderFactoryAudit() { return FactoryAuditRenderer.render(); }
