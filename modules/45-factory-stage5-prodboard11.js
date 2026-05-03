// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 45-factory-stage5-prodboard11.js
// Stage 5 — 11-Station Production Board
//
//   renderProdBoard11()  → /prodboard11
//
// Visualises every frame on the floor as it moves through the 11-station
// model (FACTORY_STATIONS_TIMES from 16c-factory-capacity.js): Profile Saw,
// Steel Saw, CNC Mill, Steel Screw, Welder, Corner Clean, Hardware, Reveals,
// Fly Screen, QC, Dispatch. Each column shows a queue of frame cards and
// a load bar (mins booked vs station daily cap).
//
// "Current station" detection priority:
//   1. If the operator log (Stage 7) exists, find the first station in the
//      canonical FACTORY_STATIONS_TIMES order where this frame has time
//      allocated AND no 'done' event has been logged yet.
//   2. Otherwise fall back to mapping the legacy 6-stage frame.station
//      (cutting → milling → welding → hardware → reveals → dispatch) into
//      the corresponding 11-station bucket.
//
// Frame card click opens a quick-action menu (Mark Done / Pause / Flag Issue
// / Cancel) that writes operator log entries and — at milestone transitions
// — bumps the legacy frame.station so the existing 7-station board, QC
// page, and Bay Management views stay in sync.
//
// Page registration via SPARTAN_EXTRA_PAGES; sidebar entry as 🏭 11-Station.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  if (typeof FACTORY_STATIONS_TIMES === 'undefined') {
    console.warn('[45-factory-stage5-prodboard11] FACTORY_STATIONS_TIMES missing — check 16c-factory-capacity.js loaded.');
  }

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────
  defineAction('prodboard11-nav', function(target) {
    navigateTo(target.dataset.page);
  });
  defineAction('prodboard11-frame-actions', function(target) {
    showFrameQuickActions(target.dataset.frameId, target.dataset.stationId);
  });
  defineAction('prodboard11-nav-self', function(target) {
    var patch = { page: 'prodboard11', dealDetailId: null, leadDetailId: null,
                  contactDetailId: null, jobDetailId: null };
    if (target.dataset.closeSidebar === '1') patch.sidebarOpen = false;
    setState(patch);
  });

  // ── Mapping helpers ────────────────────────────────────────────────────────
  // Legacy 6-stage station → which 11-station to route an unmapped frame to
  var LEGACY_TO_S11 = {
    cutting:  'S1_saw',
    milling:  'S4A_cnc',
    welding:  'S_weld',
    hardware: 'S5_hw',
    reveals:  'S6_reveal',
    dispatch: 'S_disp',
  };
  // 11-station → which legacy bucket completing it should move the frame into
  var S11_TO_LEGACY_NEXT = {
    S1_saw:    'cutting',
    S2_steel:  'cutting',
    S4A_cnc:   'milling',
    S4B_screw: 'milling',
    S_weld:    'welding',
    S_clean:   'welding',
    S5_hw:     'hardware',
    S6_reveal: 'reveals',
    S7_fly:    'reveals',
    S_qc:      'reveals',
    S_disp:    'dispatch',
  };

  function _getOperatorLog() {
    try { return JSON.parse(localStorage.getItem('spartan_operator_log') || '[]'); }
    catch(e) { return []; }
  }
  function _saveOperatorLog(log) {
    localStorage.setItem('spartan_operator_log', JSON.stringify(log));
  }
  function _getOperators() {
    try { return JSON.parse(localStorage.getItem('spartan_operators') || '[]'); }
    catch(e) { return []; }
  }

  // Determine a frame's current 11-station. Returns null if the frame has no
  // station times allocated and the legacy fallback yields nothing.
  function frameCurrentStation11(frame, log) {
    if (typeof FACTORY_STATIONS_TIMES === 'undefined') return null;
    var times = frame.stationTimes || {};
    var doneAt = {};
    (log || []).forEach(function(e) {
      if (e.frameId === frame.id && e.type === 'done') doneAt[e.stationId] = true;
    });
    // Walk the canonical order and return the first station with time + not-done
    for (var i = 0; i < FACTORY_STATIONS_TIMES.length; i++) {
      var sid = FACTORY_STATIONS_TIMES[i].id;
      if (!doneAt[sid] && (Number(times[sid]) || 0) > 0) return sid;
    }
    // No times allocated or all done — try the legacy fallback
    return LEGACY_TO_S11[frame.station] || null;
  }
  window.frameCurrentStation11 = frameCurrentStation11;

  // Advance the legacy frame.station to reflect what the 11-station progress
  // implies. Called after a 'done' event so the legacy 7-station / QC / Bay
  // views stay coherent.
  function _syncLegacyStation(frameId, completedSid) {
    if (!frameId || !completedSid) return;
    var items = (typeof getFactoryItems === 'function') ? getFactoryItems() : [];
    var frame = items.find(function(i){return i.id === frameId;});
    if (!frame) return;

    // Determine the new "phase" by checking the operator log: if every 11-stn
    // belonging to a legacy phase is done, the frame moves to the NEXT phase.
    var log = _getOperatorLog();
    var doneAt = {};
    log.forEach(function(e){if (e.frameId===frame.id && e.type==='done') doneAt[e.stationId]=true;});

    var phaseStations = {
      cutting:  ['S1_saw','S2_steel','S4B_screw'],   // ← S4A_cnc moved to milling
      milling:  ['S4A_cnc'],
      welding:  ['S_weld','S_clean'],
      hardware: ['S5_hw'],
      reveals:  ['S6_reveal','S7_fly','S_qc'],
      dispatch: ['S_disp'],
    };
    var phaseOrder = ['cutting','milling','welding','hardware','reveals','dispatch'];

    function phaseDone(phase) {
      var sts = phaseStations[phase] || [];
      // A phase is "done" if every station in it that this frame has time
      // allocated for has been done. Stations with 0 minutes are skipped.
      return sts.every(function(sid) {
        var hasTime = (Number((frame.stationTimes||{})[sid]) || 0) > 0;
        return !hasTime || doneAt[sid];
      });
    }

    // Find the first phase that's not yet done — that's the current phase
    var newStation = frame.station;
    for (var i = 0; i < phaseOrder.length; i++) {
      if (!phaseDone(phaseOrder[i])) { newStation = phaseOrder[i]; break; }
    }
    // If everything is done, the frame is at dispatch
    if (phaseOrder.every(phaseDone)) newStation = 'dispatch';

    if (newStation !== frame.station) {
      var hist = (frame.stationHistory || []).concat([{station:newStation, at:new Date().toISOString()}]);
      var updated = items.map(function(it) {
        return it.id === frameId ? Object.assign({}, it, { station:newStation, stationHistory:hist }) : it;
      });
      if (typeof saveFactoryItems === 'function') saveFactoryItems(updated);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderProdBoard11() {
    if (typeof FACTORY_STATIONS_TIMES === 'undefined') {
      return '<div class="card" style="padding:40px;text-align:center;color:#ef4444">FACTORY_STATIONS_TIMES not loaded — check 16c-factory-capacity.js loaded successfully.</div>';
    }

    var items = (typeof getFactoryItems === 'function') ? getFactoryItems() : [];
    var log   = _getOperatorLog();

    // Bucket every active frame into its current 11-station
    var buckets = {};
    FACTORY_STATIONS_TIMES.forEach(function(s){ buckets[s.id] = []; });
    var unbucketed = 0;
    items.forEach(function(it) {
      if (it.qcPassedAt && it.station === 'dispatch') return;     // already past board
      if (it.station === 'complete') return;
      var sid = frameCurrentStation11(it, log);
      if (sid && buckets[sid]) buckets[sid].push(it);
      else unbucketed++;
    });

    // Header
    var h = '<div style="margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'
      + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">🏭 11-Station Production Board</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Live view of every frame at every station — Profile Saw → Dispatch. Click a frame card for quick actions.</p></div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button data-action="prodboard11-nav" data-page="prodboard" class="btn-w" style="font-size:11px">7-Station View</button>'
      // Operator Tablet cross-link removed 2026-05-02 (Graham — hide for now).
      + '</div></div>';

    // Top KPI strip
    var totalOnFloor = items.filter(function(i){return i.station !== 'complete' && !(i.qcPassedAt && i.station === 'dispatch');}).length;
    var totalDone   = log.filter(function(e){return e.type==='done';}).length;
    var totalIssues = log.filter(function(e){return e.type==='issue';}).length;
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Frames on Floor',  v:totalOnFloor, c:'#3b82f6' },
      { l:'Operator Events',  v:log.length,    c:'#6b7280' },
      { l:'Done Events',       v:totalDone,     c:'#22c55e' },
      { l:'Open Issues',       v:totalIssues,   c:totalIssues > 0 ? '#ef4444' : '#22c55e' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    // ── Station headers row (count + load bar) ──────────────────────────────
    h += '<div style="display:grid;grid-template-columns:repeat(11,1fr);gap:6px;margin-bottom:8px">';
    FACTORY_STATIONS_TIMES.forEach(function(s) {
      var bucket = buckets[s.id];
      var loadMin = bucket.reduce(function(t, it){return t + (Number((it.stationTimes||{})[s.id]) || 0);}, 0);
      var loadPct = Math.min(100, Math.round(loadMin / Math.max(s.cap || 480, 1) * 100));
      h += '<div style="padding:8px 6px;border-radius:8px;background:' + s.col + '15;border:1px solid ' + s.col + '40;text-align:center">'
        + '<div style="font-size:10px;color:' + s.col + ';font-weight:700;line-height:1.2">' + s.name + '</div>'
        + '<div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:' + s.col + ';margin:3px 0 1px">' + bucket.length + '</div>'
        + '<div style="font-size:8px;color:#6b7280">' + loadPct + '% / ' + (typeof formatMinutesAsHours === 'function' ? formatMinutesAsHours(s.cap || 480, 'integer') : Math.round((s.cap || 480) / 60) + 'h') + '</div>'
        + '<div style="height:3px;background:#fff;border-radius:2px;margin-top:3px;overflow:hidden">'
        + '<div style="height:100%;background:' + s.col + ';width:' + loadPct + '%"></div></div>'
        + '</div>';
    });
    h += '</div>';

    // ── Per-station columns with frame cards ───────────────────────────────
    h += '<div style="display:grid;grid-template-columns:repeat(11,1fr);gap:6px;align-items:start">';
    FACTORY_STATIONS_TIMES.forEach(function(s) {
      var bucket = buckets[s.id];
      h += '<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:6px;min-height:160px;max-height:540px;overflow-y:auto">';
      if (!bucket.length) {
        h += '<div style="font-size:10px;color:#d1d5db;text-align:center;padding:20px 0">empty</div>';
      } else {
        // Sort: rework first, then by oldest in this station
        bucket.sort(function(a, b) {
          if (!!a.rework !== !!b.rework) return a.rework ? -1 : 1;
          return 0;
        });
        bucket.slice(0, 25).forEach(function(it) {
          h += _renderFrameCard(it, s);
        });
        if (bucket.length > 25) {
          h += '<div style="font-size:10px;color:#9ca3af;text-align:center;padding:4px">+' + (bucket.length - 25) + ' more</div>';
        }
      }
      h += '</div>';
    });
    h += '</div>';

    // ── Unbucketed frames (rare — shouldn't happen in a healthy state) ──
    if (unbucketed > 0) {
      h += '<div class="card" style="padding:10px 14px;margin-top:12px;border-left:3px solid #f59e0b;font-size:11px;color:#92400e;background:#fffbeb">'
        + '⚠ ' + unbucketed + ' frame(s) couldn\'t be placed at any station — likely missing stationTimes data. They\'re still tracked under the legacy 7-station view.</div>';
    }

    return '<div>' + h + '</div>';
  }

  function _renderFrameCard(it, station) {
    var mins  = Number((it.stationTimes || {})[station.id]) || 0;
    var jobRef = it.jobRef || it.orderId || '';
    var prod  = formatProductType(it.productType);
    var dim   = (it.widthMm || it.width || '?') + '×' + (it.heightMm || it.height || '?');
    var rework = !!it.rework;
    return '<div data-action="prodboard11-frame-actions" data-frame-id="' + it.id + '" data-station-id="' + station.id + '" '
      + 'style="background:#fff;border:1px solid ' + (rework ? '#ef4444' : '#e5e7eb') + ';border-radius:6px;padding:6px 8px;margin-bottom:4px;cursor:pointer;transition:transform .1s" '
      + 'onmouseenter="this.style.transform=\'translateY(-1px)\';this.style.borderColor=\'' + station.col + '\'" '
      + 'onmouseleave="this.style.transform=\'\';this.style.borderColor=\'' + (rework ? '#ef4444' : '#e5e7eb') + '\'">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px">'
      + '<span style="font-size:11px;font-weight:700;color:#c41230">' + (it.name || it.id) + '</span>'
      + (rework ? '<span style="font-size:8px;background:#ef4444;color:#fff;padding:1px 4px;border-radius:6px;font-weight:700">REWORK</span>' : '')
      + '</div>'
      + '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + jobRef + ' · ' + mins + 'm</div>'
      + '<div style="font-size:9px;color:#9ca3af">' + prod + '</div>'
      + '<div style="font-size:9px;color:#9ca3af">' + dim + '</div>'
      + '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUICK-ACTION HANDLER
  // ═══════════════════════════════════════════════════════════════════════════
  function showFrameQuickActions(frameId, stationId) {
    var ops = _getOperators().filter(function(o){return o.active !== false;});
    var act = prompt(
      'Quick action for frame ' + frameId + ' at ' + stationId + ':\n\n'
      + '1. Mark Done\n'
      + '2. Pause\n'
      + '3. Flag Issue\n'
      + '4. Cancel\n\n'
      + 'Enter number:', '1');
    if (!act || act === '4') return;
    var typeMap = { '1':'done', '2':'pause', '3':'issue' };
    var type = typeMap[String(act)];
    if (!type) return;

    // Operator selection
    var operatorId = '';
    if (ops.length) {
      var opIdx = prompt(
        'Which operator?\n\n' + ops.map(function(o, i){return (i+1) + '. ' + o.name;}).join('\n') + '\n\nEnter number:',
        '1');
      var op = ops[parseInt(opIdx, 10) - 1];
      operatorId = op ? op.id : '';
    }
    var notes = type === 'issue' ? (prompt('Issue description:') || '') : '';

    var entry = {
      id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      operatorId: operatorId,
      stationId: stationId,
      frameId: frameId,
      type: type,
      at: new Date().toISOString(),
      notes: notes,
    };
    _saveOperatorLog(_getOperatorLog().concat([entry]));

    if (type === 'done') _syncLegacyStation(frameId, stationId);
    if (type === 'issue') _flagFrameForRework(frameId);

    addToast(type.toUpperCase() + ' logged at ' + stationId, type === 'issue' ? 'warning' : 'success');
    renderPage();
  }

  function _flagFrameForRework(frameId) {
    if (typeof getFactoryItems !== 'function' || typeof saveFactoryItems !== 'function') return;
    var items = getFactoryItems().map(function(it) {
      return it.id === frameId ? Object.assign({}, it, { rework:true, reworkFlaggedAt:new Date().toISOString() }) : it;
    });
    saveFactoryItems(items);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.prodboard11 = function() { return renderProdBoard11(); };

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

  if (typeof window.renderSidebar === 'function' && !window._STAGE5_SIDEBAR_WRAPPED) {
    window._STAGE5_SIDEBAR_WRAPPED = true;
    var _origRenderSidebar = window.renderSidebar;
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      if (html.indexOf("setState({page:'prodboard11'") >= 0) return html;
      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      var on = st.page === 'prodboard11';
      var entry = '<div class="nav-item' + (on ? ' on' : '') + '" '
        + 'data-action="prodboard11-nav-self" data-close-sidebar="' + (native ? '1' : '0') + '" '
        + 'title="' + (!sidebarOpen ? '11-Station Board' : '') + '">'
        + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">🏭</span>'
        + (sidebarOpen ? '<span style="flex:1">11-Station Board</span>' : '')
        + '</div>';

      // Anchor: insert after the legacy prodboard entry if present (same group)
      var anchor = "setState({page:'prodboard'";
      var idx = html.indexOf(anchor);
      if (idx < 0) {
        // Fallback: insert before the first nav-item
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
  window.renderProdBoard11        = renderProdBoard11;
  window.showFrameQuickActions    = showFrameQuickActions;

  console.log('[45-factory-stage5-prodboard11] /prodboard11 registered.');
})();
