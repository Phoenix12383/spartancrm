// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 48-factory-stage8-service-rework.js
// Stage 8 — Service Rework UI (Two-Order Rule)
//
//   renderServiceRework()  → /servicerework
//
// The Two-Order Rule: every rework frame consumes TWO production slots —
// one for the original (already shipped/installed) and one for the
// replacement being remade. This page makes that double-slot consumption
// visible to the production manager so capacity planning reflects the
// real load, not just the count of "frames in the building".
//
// Data sources:
//   • factory items where rework === true (set by Stage 1 QC fail or
//     Stage 7 tablet "Flag Issue")
//   • factory orders for the original shipping context
//   • Stage 1 QC store (spartan_qc) for failure attribution + reason codes
//   • Stage 7 operator log for "issue" events with notes
//   • job state for service tickets (j.isService / j.serviceTicketId)
//
// Page registration via SPARTAN_EXTRA_PAGES; sidebar entry as 🔄 Service Rework.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
  defineAction('rework-open-job', function(target, ev) {
    var jobId = target.dataset.jobId;
    navigateTo('jobs', {jobDetailId: jobId});
  });
  defineAction('rework-clear-group', function(target, ev) {
    var orderRef = target.dataset.orderRef;
    clearReworkGroup(orderRef);
  });
  defineAction('rework-nav-costreports', function(target, ev) {
    var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
    var patch = {page:'servicerework', dealDetailId:null, leadDetailId:null, contactDetailId:null, jobDetailId:null};
    if (native) patch.sidebarOpen = false;
    setState(patch);
  });

  function _getQCStore() {
    try { return JSON.parse(localStorage.getItem('spartan_qc') || '{}'); }
    catch(e) { return {}; }
  }
  function _getOperatorLog() {
    try { return JSON.parse(localStorage.getItem('spartan_operator_log') || '[]'); }
    catch(e) { return []; }
  }

  // For each rework frame, build a "rework record" with all the attribution
  // data we can find — most-recent QC failure, most-recent operator issue
  // event, root-cause category, who flagged it.
  function _buildReworkRecord(frame, qcStore, opLog) {
    var rec = { frame:frame, source:null, category:null, notes:'', flaggedAt:frame.reworkFlaggedAt || null, flaggedBy:null };

    // Source 1: QC failure (Stage 1)
    var qcEntry = qcStore[frame.id];
    if (qcEntry && qcEntry.failures && qcEntry.failures.length) {
      var lastFail = qcEntry.failures[qcEntry.failures.length - 1];
      rec.source   = 'qc';
      rec.category = lastFail.category || 'Unspecified';
      rec.notes    = lastFail.notes || '';
      if (lastFail.at) rec.flaggedAt = lastFail.at;
    }

    // Source 2: operator issue events (Stage 7). When an operator issue event
    // exists for this frame, we always treat it as the attribution source —
    // operator events come in pairs with the rework flag (the tablet logs the
    // event then immediately flags the frame), and naive timestamp comparison
    // would drop the attribution because frame.reworkFlaggedAt is set a few
    // milliseconds AFTER the log entry. We keep the QC category if QC also
    // contributed; otherwise mark as operator-flagged.
    var lastIssue = null;
    for (var i = opLog.length - 1; i >= 0; i--) {
      var e = opLog[i];
      if (e.frameId === frame.id && e.type === 'issue') { lastIssue = e; break; }
    }
    if (lastIssue) {
      rec.source    = 'operator';
      if (!rec.category) rec.category = 'Operator-flagged';
      rec.notes     = lastIssue.notes || rec.notes;
      rec.flaggedAt = lastIssue.at;
      rec.flaggedBy = lastIssue.operatorId;
    }

    return rec;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderServiceRework() {
    var items   = (typeof getFactoryItems === 'function')  ? getFactoryItems()  : [];
    var orders  = (typeof getFactoryOrders === 'function') ? getFactoryOrders() : [];
    var jobs    = (getState().jobs) || [];
    var qcStore = _getQCStore();
    var opLog   = _getOperatorLog();

    var reworkFrames = items.filter(function(i){return i.rework === true;});
    var serviceJobs  = jobs.filter(function(j){return j.isService === true || (j.tags || []).indexOf('service') >= 0 || j.serviceTicketId;});

    // Build full records
    var records = reworkFrames.map(function(f){return _buildReworkRecord(f, qcStore, opLog);});

    // Group by orderId (the original job — both the delivered original AND
    // the replacement live under the same orderId for the Two-Order Rule)
    var groups = {};
    records.forEach(function(r) {
      var key = r.frame.orderId || 'unknown';
      if (!groups[key]) groups[key] = {
        orderRef:r.frame.orderId,
        records:[],
        order:orders.find(function(o){return o.jid === r.frame.orderId;}),
      };
      groups[key].records.push(r);
    });

    // Failure category breakdown for the "Top Causes" panel
    var byCategory = {};
    records.forEach(function(r) {
      var cat = r.category || 'Unattributed';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    var topCauses = Object.keys(byCategory).map(function(k){return {category:k, count:byCategory[k]};}).sort(function(a, b){return b.count - a.count;});

    // Header
    var h = '<div style="margin-bottom:18px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">🔄 Service Rework</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Two-Order Rule: every rework frame consumes TWO production slots — original (shipped) + replacement (in production)</p></div>';

    // KPI strip
    var totalSlots = reworkFrames.length * 2;
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Rework Frames',         v:reworkFrames.length,        c:reworkFrames.length > 0 ? '#ef4444' : '#22c55e' },
      { l:'Slots Consumed (×2)',   v:totalSlots,                 c:'#f59e0b' },
      { l:'Distinct Orders',       v:Object.keys(groups).length, c:'#7c3aed' },
      { l:'Active Service Jobs',   v:serviceJobs.length,         c:'#3b82f6' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    if (!reworkFrames.length) {
      h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:40px;margin-bottom:10px">✅</div>'
        + '<div style="font-size:14px;font-weight:600;color:#374151">No rework in progress</div>'
        + '<div style="font-size:12px;margin-top:4px">Frames flagged via QC failure or operator "Flag Issue" appear here. The Two-Order Rule will then highlight the doubled production load.</div></div>';
      return '<div>' + h + '</div>';
    }

    // ── Two-Order Rule explainer ───────────────────────────────────────────
    h += '<div class="card" style="padding:14px 18px;margin-bottom:14px;border-left:4px solid #f59e0b;background:#fffbeb">'
      + '<div style="display:flex;align-items:flex-start;gap:10px">'
      + '<div style="font-size:22px;flex-shrink:0">⚖️</div>'
      + '<div style="flex:1">'
      + '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:4px">Two-Order Rule active</div>'
      + '<div style="font-size:12px;color:#78350f">Every rework frame counts as <strong>2 production slots</strong> in capacity planning — once for the original (already at the customer site, can\'t be reclaimed) and once for the replacement being remade. Smart Planner and Capacity Planner should both reflect this doubled load.</div>'
      + '</div></div></div>';

    // ── Top failure causes ─────────────────────────────────────────────────
    if (topCauses.length) {
      h += '<div class="card" style="padding:14px 18px;margin-bottom:14px">'
        + '<div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:10px">📊 Top Failure Causes</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">';
      var maxCount = topCauses[0].count;
      topCauses.forEach(function(tc) {
        var pct = Math.round(tc.count / Math.max(maxCount, 1) * 100);
        h += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
          + '<span style="font-size:12px;font-weight:600;color:#374151">' + tc.category + '</span>'
          + '<span style="font-size:13px;font-weight:800;color:#c41230;font-family:Syne,sans-serif">' + tc.count + '</span></div>'
          + '<div style="height:5px;background:#f0f0f0;border-radius:3px;overflow:hidden"><div style="height:100%;background:#c41230;width:' + pct + '%"></div></div>'
          + '</div>';
      });
      h += '</div></div>';
    }

    // ── Per-order grouping with Two-Order layout ───────────────────────────
    Object.keys(groups).forEach(function(k) {
      h += _renderReworkGroup(groups[k]);
    });

    // ── Service jobs (if any) ──────────────────────────────────────────────
    if (serviceJobs.length) {
      h += '<div class="card" style="padding:0;overflow:hidden;margin-top:14px;border-left:4px solid #3b82f6">'
        + '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;background:#eff6ff"><h4 style="font-size:13px;font-weight:700;margin:0;color:#1e3a8a">🛠️ Active Service Tickets (' + serviceJobs.length + ')</h4></div>';
      serviceJobs.forEach(function(j, i) {
        var contacts = (getState().contacts) || [];
        var c = contacts.find(function(ct){return ct.id === j.contactId;});
        h += '<div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<div><div style="font-weight:700;color:#c41230">' + (j.jobNumber || j.id) + '</div>'
          + '<div style="font-size:11px;color:#6b7280">' + (c ? c.fn + ' ' + c.ln : '—') + (j.suburb ? ' · ' + j.suburb : '') + (j.serviceTicketId ? ' · ticket ' + j.serviceTicketId : '') + '</div></div>'
          + '<button data-action="rework-open-job" data-job-id="' + j.id + '" class="btn-w" style="font-size:11px;padding:4px 12px">Open Job →</button>'
          + '</div>';
      });
      h += '</div>';
    }

    return '<div>' + h + '</div>';
  }

  function _renderReworkGroup(g) {
    var operators = (typeof getOperators === 'function') ? getOperators() : [];
    var orderInfo = g.order
      ? g.order.customer + (g.order.value ? ' · $' + Number(g.order.value).toLocaleString() : '')
      : '(original order not found in factory queue — likely already dispatched)';

    var h = '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px;border-left:4px solid #ef4444">'
      + '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;background:#fef2f2;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
      + '<div><h4 style="font-size:13px;font-weight:700;margin:0;color:#b91c1c">🔄 ' + (g.orderRef || '(no order ref)') + ' — ' + g.records.length + ' rework' + (g.records.length === 1 ? '' : 's') + '</h4>'
      + '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + orderInfo + '</div></div>'
      + '<div style="font-size:11px;font-weight:700;color:#b91c1c;background:#fff;padding:4px 10px;border-radius:14px;border:1px solid #fca5a5">' + (g.records.length * 2) + ' production slots</div>'
      + '</div>';

    // Per-frame Two-Order layout: each row shows TWO columns (Original / Replacement)
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">Frame</th><th class="th" style="background:#f9fafb">Slot 1: Original (shipped)</th><th class="th" style="background:#fef2f2">Slot 2: Replacement (in production)</th><th class="th">Reason</th></tr></thead><tbody>';

    g.records.forEach(function(r, i) {
      var f = r.frame;
      var flaggedByName = '';
      if (r.flaggedBy) {
        var op = operators.find(function(o){return o.id === r.flaggedBy;});
        flaggedByName = op ? op.name : r.flaggedBy;
      }
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td"><div style="font-weight:700;color:#c41230">' + (f.name || f.id) + '</div>'
        + '<div style="font-size:10px;color:#6b7280">' + formatProductType(f.productType) + ' · ' + (f.widthMm || f.width || '?') + '×' + (f.heightMm || f.height || '?') + '</div></td>'
        // Slot 1
        + '<td class="td" style="background:#f9fafb"><div style="font-size:11px;color:#6b7280">📦 Already at customer</div>'
        + '<div style="font-size:11px;color:#374151;margin-top:2px">' + (g.order && g.order.address ? '📍 ' + g.order.address : '') + '</div>'
        + (g.order && g.order.installDate ? '<div style="font-size:10px;color:#9ca3af">Installed ' + new Date(g.order.installDate).toLocaleDateString('en-AU') + '</div>' : '')
        + '</td>'
        // Slot 2
        + '<td class="td" style="background:#fef2f2">'
        + '<div style="font-size:11px;font-weight:600;color:#b91c1c">⚙️ ' + ((f.station || 'cutting').replace(/_/g, ' ')) + '</div>'
        + (f.qcPassedAt ? '<div style="font-size:10px;color:#22c55e;margin-top:2px">QC passed ' + new Date(f.qcPassedAt).toLocaleDateString('en-AU') + '</div>' : '')
        + '<div style="font-size:10px;color:#6b7280;margin-top:2px">Flagged ' + (r.flaggedAt ? new Date(r.flaggedAt).toLocaleDateString('en-AU') : '—') + '</div>'
        + '</td>'
        // Reason
        + '<td class="td">'
        + '<div style="font-size:11px;font-weight:600;color:#374151">' + (r.category || 'Unattributed') + '</div>'
        + (r.notes ? '<div style="font-size:10px;color:#6b7280;margin-top:2px;font-style:italic">"' + r.notes + '"</div>' : '')
        + (flaggedByName ? '<div style="font-size:10px;color:#9ca3af;margin-top:2px">By ' + flaggedByName + '</div>' : '')
        + (r.source ? '<div style="font-size:9px;color:#9ca3af;margin-top:2px;text-transform:uppercase">Source: ' + r.source + '</div>' : '')
        + '</td>'
        + '</tr>';
    });

    h += '</tbody></table>'
      // Footer: link back to the original order if we have one
      + (g.order ? '<div style="padding:10px 16px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:11px;color:#6b7280;text-align:right">'
          + '<button data-action="rework-clear-group" data-order-ref="' + g.orderRef + '" style="padding:4px 12px;font-size:10px;background:none;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-family:inherit;color:#6b7280">Clear all rework flags for this order</button>'
        + '</div>' : '')
      + '</div>';
    return h;
  }

  // Clear rework flags for an entire order — useful once the replacement
  // frames have been redone and re-shipped. Doesn't delete the QC failure
  // history, just unsets the rework flag on each frame.
  function clearReworkGroup(orderRef) {
    if (!confirm('Clear rework flags for all frames under ' + orderRef + '?\n\nThis is for after the replacement frames have been redone and re-shipped.')) return;
    if (typeof getFactoryItems !== 'function' || typeof saveFactoryItems !== 'function') return;
    var items = getFactoryItems();
    var changed = 0;
    var updated = items.map(function(it) {
      if (it.orderId === orderRef && it.rework) {
        changed++;
        return Object.assign({}, it, { rework:false, reworkClearedAt:new Date().toISOString() });
      }
      return it;
    });
    saveFactoryItems(updated);
    addToast('Cleared rework flag on ' + changed + ' frame(s)', 'success');
    renderPage();
  }
  window.clearReworkGroup = clearReworkGroup;

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION + SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.servicerework = function() { return renderServiceRework(); };

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

  if (typeof window.renderSidebar === 'function' && !window._STAGE8_SIDEBAR_WRAPPED) {
    window._STAGE8_SIDEBAR_WRAPPED = true;
    var _origRenderSidebar = window.renderSidebar;
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      if (html.indexOf("setState({page:'servicerework'") >= 0) return html;
      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      var on = st.page === 'servicerework';
      var entry = '<div class="nav-item' + (on ? ' on' : '') + '" '
        + 'data-action="rework-nav-costreports" '
        + 'title="' + (!sidebarOpen ? 'Service Rework' : '') + '">'
        + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">🔄</span>'
        + (sidebarOpen ? '<span style="flex:1">Service Rework</span>' : '')
        + '</div>';
      // Insert after factoryaudit if present (red-tag/audit grouping); else
      // after factorydispatch
      var anchors = ["setState({page:'factoryaudit'", "setState({page:'factorydispatch'", "setState({page:'tabletoperator'"];
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

  window.renderServiceRework = renderServiceRework;

  console.log('[48-factory-stage8-service-rework] /servicerework registered.');
})();
