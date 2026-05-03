// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 47-factory-stage7-tablet-operator.js
// Stage 7 — Tablet Operator Interface + Operator concept
//
//   renderTabletOperator()  → /tabletoperator
//
// Three-state full-screen UI optimised for tablet/phone form factors used on
// the production floor:
//
//   1. LOCKED      — 4-digit PIN keypad. Validates against spartan_operators.
//   2. STATION_PICK— After login, the operator picks which station they're at
//                    (defaults to operator.defaultStation as the highlighted
//                    option). One-tap selection.
//   3. ACTIVE      — Shows the queue of frames at this station + a single
//                    "current frame" panel with big Start / Done / Pause /
//                    Flag-Issue buttons. Each tap appends a typed entry to
//                    spartan_operator_log so Stages 8 and 9 can attribute
//                    rework + compute efficiency.
//
// All log entries: { id, operatorId, stationId, frameId, type, at, notes,
//                    durationMs (computed at 'done' if a 'start' exists) }
//
// Operator data model (spartan_operators):
//   { id, name, pin, defaultStation, hourlyRate, active }
//
// Page registration via SPARTAN_EXTRA_PAGES; sidebar entry as 📱 Operator Tablet.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
  defineAction('tablet-nav-costreports', function(target, ev) {
    var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
    var patch = {page:'tabletoperator', dealDetailId:null, leadDetailId:null, contactDetailId:null, jobDetailId:null};
    if (native) patch.sidebarOpen = false;
    setState(patch);
  });
  defineAction('tablet-pinkey', function(target, ev) {
    var d = target.dataset.pinKey;
    window._opTabletErr = '';
    if (d === 'clr') { window._opTabletPin = ''; renderPage(); return; }
    if (d === 'del') { window._opTabletPin = window._opTabletPin.slice(0, -1); renderPage(); return; }
    if (window._opTabletPin.length >= 4) return;
    window._opTabletPin += d;
    if (window._opTabletPin.length === 4) {
      var op = getOperators().find(function(o){return o.pin === window._opTabletPin && o.active !== false;});
      if (!op) {
        window._opTabletErr = 'PIN not recognised';
        window._opTabletPin = '';
      } else {
        window._opTabletOpId    = op.id;
        window._opTabletStation = null;
        window._opTabletPin     = '';
        addToast('Welcome ' + op.name, 'success');
      }
    }
    renderPage();
  });

  defineAction('tablet-logout', function(target, ev) {
    window._opTabletOpId = null;
    window._opTabletStation = null;
    window._opTabletPin = '';
    addToast('Logged out', 'success');
    renderPage();
  });

  defineAction('tablet-pick-station', function(target, ev) {
    var stationId = target.dataset.stationId;
    window._opTabletStation = stationId;
    addToast('Station selected', 'success');
    renderPage();
  });

  defineAction('tablet-change-station', function(target, ev) {
    window._opTabletStation = null;
    renderPage();
  });

  defineAction('tablet-start', function(target, ev) {
    if (!window._opTabletOpId || !window._opTabletStation) return;
    var frameId = target.dataset.frameId;
    logOpEvent(window._opTabletOpId, window._opTabletStation, frameId, 'start');
    addToast('Started', 'success');
    renderPage();
  });

  defineAction('tablet-done', function(target, ev) {
    if (!window._opTabletOpId || !window._opTabletStation) return;
    var frameId = target.dataset.frameId;
    var entry = logOpEvent(window._opTabletOpId, window._opTabletStation, frameId, 'done');
    var msg = 'Done';
    if (entry.durationMs) msg += ' (' + Math.round(entry.durationMs / 60000) + ' min)';
    addToast(msg, 'success');
    renderPage();
  });

  defineAction('tablet-pause', function(target, ev) {
    if (!window._opTabletOpId || !window._opTabletStation) return;
    var frameId = target.dataset.frameId;
    var notes = prompt('Pause reason (optional):') || '';
    logOpEvent(window._opTabletOpId, window._opTabletStation, frameId, 'pause', notes);
    addToast('Paused', 'warning');
    renderPage();
  });

  defineAction('tablet-issue', function(target, ev) {
    if (!window._opTabletOpId || !window._opTabletStation) return;
    var frameId = target.dataset.frameId;
    var notes = prompt('Describe the issue:');
    if (!notes) return;
    logOpEvent(window._opTabletOpId, window._opTabletStation, frameId, 'issue', notes);
    if (typeof getFactoryItems === 'function' && typeof saveFactoryItems === 'function') {
      saveFactoryItems(getFactoryItems().map(function(it) {
        return it.id === frameId ? Object.assign({}, it, { rework:true, reworkFlaggedAt:new Date().toISOString() }) : it;
      }));
    }
    addToast('Issue logged + frame flagged for rework', 'warning');
    renderPage();
  });

  // ── State (hoisted) ────────────────────────────────────────────────────────
  window._opTabletPin       = window._opTabletPin       || '';
  window._opTabletOpId      = window._opTabletOpId      || null;
  window._opTabletStation   = window._opTabletStation   || null;
  window._opTabletActiveFid = window._opTabletActiveFid || null;
  window._opTabletErr       = window._opTabletErr       || '';

  // ── Persistence ────────────────────────────────────────────────────────────
  function getOperators() {
    try { return JSON.parse(localStorage.getItem('spartan_operators') || '[]'); }
    catch(e) { return []; }
  }
  function saveOperators(o) { localStorage.setItem('spartan_operators', JSON.stringify(o)); }
  function getOperatorLog() {
    try { return JSON.parse(localStorage.getItem('spartan_operator_log') || '[]'); }
    catch(e) { return []; }
  }
  function saveOperatorLog(l) { localStorage.setItem('spartan_operator_log', JSON.stringify(l)); }

  // Append a typed event to the log; returns the entry. If it's a 'done' event
  // and there's a matching open 'start' for the same operator/frame/station,
  // we compute durationMs from start.at to now.
  function logOpEvent(operatorId, stationId, frameId, type, notes) {
    var log = getOperatorLog();
    var now = new Date();
    var entry = {
      id:        'ev_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 7),
      operatorId:operatorId || null,
      stationId: stationId  || null,
      frameId:   frameId    || null,
      type:      type,
      at:        now.toISOString(),
      notes:     notes || '',
    };
    if (type === 'done' && operatorId && stationId && frameId) {
      // Find the most recent 'start' for this triple that has no 'done' yet
      var startEv = null;
      for (var i = log.length - 1; i >= 0; i--) {
        var e = log[i];
        if (e.frameId === frameId && e.stationId === stationId && e.operatorId === operatorId) {
          if (e.type === 'start') { startEv = e; break; }
          if (e.type === 'done')  break; // already closed
        }
      }
      if (startEv) entry.durationMs = now.getTime() - new Date(startEv.at).getTime();
    }
    saveOperatorLog(log.concat([entry]));
    return entry;
  }
  window.logOpEvent = logOpEvent;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderTabletOperator() {
    if (!window._opTabletOpId) return _renderLocked();
    if (!window._opTabletStation) return _renderStationPicker();
    return _renderActive();
  }

  // ── State 1: LOCKED ────────────────────────────────────────────────────────
  function _renderLocked() {
    var pin = window._opTabletPin || '';
    var err = window._opTabletErr || '';
    return '<div style="max-width:400px;margin:40px auto;text-align:center">'
      + '<h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:28px;margin:0 0 6px">📱 Operator Tablet</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:0 0 24px">Enter your 4-digit PIN to log in</p>'
      + '<div style="background:#f9fafb;border-radius:16px;padding:24px;border:1px solid #e5e7eb">'
      + '<div style="height:50px;font-size:36px;font-weight:800;letter-spacing:0.4em;font-family:Syne,sans-serif;color:#374151;display:flex;align-items:center;justify-content:center;margin-bottom:8px">'
      + (pin.length ? pin.replace(/./g, '●') : '<span style="color:#d1d5db">····</span>') + '</div>'
      + (err ? '<div style="font-size:12px;color:#ef4444;font-weight:600;margin-bottom:8px">' + err + '</div>' : '<div style="height:18px"></div>')
      // Numeric keypad
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'
      + ['1','2','3','4','5','6','7','8','9','clr','0','del'].map(function(d) {
        var label = d === 'clr' ? '✕' : d === 'del' ? '←' : d;
        var isAct = d === 'clr' || d === 'del';
        return '<button data-action="tablet-pinkey" data-pin-key="' + d + '" style="padding:18px;font-size:22px;font-weight:700;background:' + (isAct ? '#fee2e2' : '#fff') + ';border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;color:' + (isAct ? '#b91c1c' : '#374151') + ';font-family:inherit;transition:transform .05s" onmousedown="this.style.transform=\'scale(0.95)\'" onmouseup="this.style.transform=\'\'" onmouseleave="this.style.transform=\'\'">' + label + '</button>';
      }).join('')
      + '</div></div>'
      + '<div style="margin-top:14px;font-size:11px;color:#9ca3af">PIN automatically validates at 4 digits</div>'
      + '</div>';
  }

  // ── State 2: STATION PICKER ───────────────────────────────────────────────
  function _renderStationPicker() {
    var op = getOperators().find(function(o){return o.id === window._opTabletOpId;});
    if (!op) { window._opTabletOpId = null; return _renderLocked(); }
    var stns = (typeof FACTORY_STATIONS_TIMES !== 'undefined') ? FACTORY_STATIONS_TIMES : [];

    var h = '<div style="max-width:560px;margin:40px auto">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
      + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">📱 Pick your station</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Logged in as <strong>' + op.name + '</strong></p></div>'
      + '<button data-action="tablet-logout" class="btn-w" style="font-size:11px">Log out</button>'
      + '</div>';

    if (!stns.length) {
      h += '<div class="card" style="padding:30px;text-align:center;color:#ef4444">FACTORY_STATIONS_TIMES not loaded.</div></div>';
      return h;
    }

    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">';
    stns.forEach(function(s) {
      var isDefault = s.id === op.defaultStation;
      h += '<button data-action="tablet-pick-station" data-station-id="' + s.id + '" '
        + 'style="padding:18px 14px;text-align:left;background:#fff;border:2px solid ' + (isDefault ? s.col : '#e5e7eb') + ';border-radius:10px;cursor:pointer;font-family:inherit;transition:transform .05s,box-shadow .15s" '
        + 'onmouseenter="this.style.boxShadow=\'0 4px 14px #0000001a\'" onmouseleave="this.style.boxShadow=\'\'">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        + '<div style="font-size:14px;font-weight:700;color:' + s.col + '">' + s.name + '</div>'
        + (isDefault ? '<span style="font-size:9px;background:' + s.col + ';color:#fff;padding:2px 6px;border-radius:8px;font-weight:700">DEFAULT</span>' : '')
        + '</div>'
        + '<div style="font-size:11px;color:#9ca3af">cap ' + (typeof formatMinutesAsHours === 'function' ? formatMinutesAsHours(s.cap || 480, 'integer') : Math.round((s.cap || 480) / 60) + 'h') + '/day · ' + (s.staff || 1) + ' operator' + ((s.staff || 1) === 1 ? '' : 's') + '</div>'
        + '</button>';
    });
    h += '</div></div>';
    return h;
  }

  // ── State 3: ACTIVE ───────────────────────────────────────────────────────
  function _renderActive() {
    var op = getOperators().find(function(o){return o.id === window._opTabletOpId;});
    if (!op) { window._opTabletOpId = null; return _renderLocked(); }
    var sid = window._opTabletStation;
    var station = (typeof FACTORY_STATIONS_TIMES !== 'undefined')
      ? FACTORY_STATIONS_TIMES.find(function(s){return s.id === sid;})
      : null;
    if (!station) { window._opTabletStation = null; return _renderStationPicker(); }

    var allItems = (typeof getFactoryItems === 'function') ? getFactoryItems() : [];
    var log = getOperatorLog();

    // Frames currently at this station (using Stage 5's helper if available)
    var currentFn = window.frameCurrentStation11;
    var queue;
    if (typeof currentFn === 'function') {
      queue = allItems.filter(function(it) {
        if (it.qcPassedAt && it.station === 'dispatch') return false;
        if (it.station === 'complete') return false;
        return currentFn(it, log) === sid;
      });
    } else {
      // Fallback: filter by stationTimes presence + not 'done' in log
      var doneSet = {};
      log.forEach(function(e){if (e.type === 'done') doneSet[e.frameId + ':' + e.stationId] = true;});
      queue = allItems.filter(function(it) {
        if (it.qcPassedAt && it.station === 'dispatch') return false;
        var t = (it.stationTimes || {})[sid] || 0;
        return t > 0 && !doneSet[it.id + ':' + sid];
      });
    }

    // Sort: rework first, then by orderId for visual grouping
    queue.sort(function(a, b) {
      if (!!a.rework !== !!b.rework) return a.rework ? -1 : 1;
      return (a.orderId || '').localeCompare(b.orderId || '');
    });

    // Find any "started but not done" frame for this op/station — that's the
    // active frame. If none, suggest the top of queue as the next pickup.
    var activeFrame = null;
    for (var i = log.length - 1; i >= 0; i--) {
      var e = log[i];
      if (e.operatorId === op.id && e.stationId === sid && e.type === 'start') {
        // Check there's no later 'done' / 'pause' for the same frame
        var closed = log.slice(i + 1).find(function(x){return x.frameId === e.frameId && x.stationId === sid && (x.type === 'done' || x.type === 'pause');});
        if (!closed) { activeFrame = allItems.find(function(it){return it.id === e.frameId;}); break; }
      }
    }
    var nextFrame = activeFrame ? null : queue[0];

    // Today's session stats for this operator
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var myToday = log.filter(function(e) {
      return e.operatorId === op.id && new Date(e.at) >= todayStart;
    });
    var doneToday   = myToday.filter(function(e){return e.type === 'done';}).length;
    var issuesToday = myToday.filter(function(e){return e.type === 'issue';}).length;
    var minsToday   = myToday.filter(function(e){return e.type === 'done' && e.durationMs;}).reduce(function(s, e){return s + (e.durationMs / 60000);}, 0);

    var h = '<div style="max-width:680px;margin:14px auto">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 16px">'
      + '<div><div style="font-size:13px;color:#6b7280">Logged in as</div>'
      + '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:18px">' + op.name + '</div></div>'
      + '<div style="text-align:right"><div style="font-size:11px;color:#6b7280">Station</div>'
      + '<div style="font-weight:700;color:' + station.col + ';font-size:15px">' + station.name + '</div></div>'
      + '<div style="display:flex;gap:6px"><button data-action="tablet-change-station" class="btn-w" style="font-size:11px">↺ Station</button>'
      + '<button data-action="tablet-logout" class="btn-w" style="font-size:11px">Log out</button></div>'
      + '</div>'

      // Today's stats
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:14px">'
      + _statTile('Done Today',   doneToday,                           '#22c55e')
      + _statTile('Time Booked',  Math.round(minsToday) + ' min',      '#3b82f6')
      + _statTile('Issues Today', issuesToday,                          issuesToday > 0 ? '#ef4444' : '#22c55e')
      + '</div>';

    // ── Active frame card (or "next up" if nothing is active) ───────────────
    if (activeFrame) h += _renderActiveFrameCard(activeFrame, op, station, log);
    else if (nextFrame) h += _renderNextUpCard(nextFrame, op, station);
    else h += '<div class="card" style="padding:30px;text-align:center;color:#9ca3af;margin-bottom:14px"><div style="font-size:36px;margin-bottom:6px">🛌</div><div style="font-size:14px;font-weight:600;color:#374151">No frames waiting at ' + station.name + '</div><div style="font-size:12px;margin-top:4px">Take a break or change station</div></div>';

    // ── Queue ───────────────────────────────────────────────────────────────
    if (queue.length > (activeFrame ? 1 : 0)) {
      var rest = queue.filter(function(f){return !activeFrame || f.id !== activeFrame.id;}).slice(activeFrame ? 0 : 1);
      if (rest.length) {
        h += '<div class="card" style="padding:0;overflow:hidden">'
          + '<div style="padding:10px 14px;border-bottom:1px solid #f0f0f0;background:#fafafa"><h4 style="font-size:13px;font-weight:700;margin:0">Queue at ' + station.name + ' (' + rest.length + ' more)</h4></div>'
          + '<div style="max-height:340px;overflow-y:auto">';
        rest.slice(0, 20).forEach(function(it, idx) {
          var mins = Number((it.stationTimes || {})[sid]) || 0;
          h += '<div style="padding:10px 14px;border-bottom:1px solid #f9fafb;display:flex;justify-content:space-between;align-items:center;gap:10px;' + (idx % 2 ? 'background:#fafafa' : '') + '">'
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-weight:700;color:#c41230;font-size:13px">' + (it.name || it.id) + (it.rework ? ' <span style="font-size:9px;background:#ef4444;color:#fff;padding:1px 5px;border-radius:6px;font-weight:700">REWORK</span>' : '') + '</div>'
            + '<div style="font-size:11px;color:#6b7280">' + (it.jobRef || it.orderId || '—') + ' · ' + formatProductType(it.productType) + ' · ' + (it.widthMm || it.width || '?') + '×' + (it.heightMm || it.height || '?') + ' · ' + mins + 'm</div>'
            + '</div>'
            + '<button data-action="tablet-start" data-frame-id="' + it.id + '" class="btn-r" style="padding:8px 16px;font-size:12px;font-weight:700;flex-shrink:0">▶ Start</button>'
            + '</div>';
        });
        if (rest.length > 20) h += '<div style="padding:10px;text-align:center;color:#9ca3af;font-size:11px">+' + (rest.length - 20) + ' more</div>';
        h += '</div></div>';
      }
    }

    h += '</div>';
    return h;
  }

  function _statTile(label, value, color) {
    return '<div style="background:#fff;border:1px solid #e5e7eb;border-left:4px solid ' + color + ';border-radius:10px;padding:10px 14px">'
      + '<div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase">' + label + '</div>'
      + '<div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:' + color + ';margin-top:2px">' + value + '</div></div>';
  }

  function _renderActiveFrameCard(frame, op, station, log) {
    // Find when work started + how long ago
    var startEntry;
    for (var i = log.length - 1; i >= 0; i--) {
      var e = log[i];
      if (e.frameId === frame.id && e.stationId === station.id && e.type === 'start' && e.operatorId === op.id) {
        startEntry = e; break;
      }
    }
    var elapsedMin = startEntry ? Math.round((Date.now() - new Date(startEntry.at).getTime()) / 60000) : 0;
    var planned = Number((frame.stationTimes || {})[station.id]) || 0;
    var pct = planned > 0 ? Math.min(150, Math.round(elapsedMin / planned * 100)) : 0;
    var pctCol = pct < 75 ? '#22c55e' : pct < 100 ? '#f59e0b' : '#ef4444';

    return '<div class="card" style="padding:0;overflow:hidden;margin-bottom:14px;border:2px solid ' + station.col + '">'
      + '<div style="padding:14px 18px;background:' + station.col + '10;border-bottom:1px solid ' + station.col + '40">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'
      + '<div><span style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700">Currently working on</span>'
      + '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;color:#c41230;margin-top:2px">' + (frame.name || frame.id) + (frame.rework ? ' <span style="font-size:11px;background:#ef4444;color:#fff;padding:2px 8px;border-radius:8px;font-weight:700;vertical-align:middle">REWORK</span>' : '') + '</div></div>'
      + '<div style="text-align:right"><div style="font-size:11px;color:#6b7280">Elapsed / Planned</div>'
      + '<div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:' + pctCol + '">' + elapsedMin + ' / ' + planned + ' min</div></div>'
      + '</div></div>'
      + '<div style="padding:14px 18px">'
      + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:13px;color:#374151;margin-bottom:14px">'
      + '<div><span style="color:#9ca3af">Job</span> <strong>' + (frame.jobRef || frame.orderId || '—') + '</strong></div>'
      + '<div><span style="color:#9ca3af">Product</span> ' + formatProductType(frame.productType, '—') + '</div>'
      + '<div><span style="color:#9ca3af">Dimensions</span> <strong>' + (frame.widthMm || frame.width || '?') + ' × ' + (frame.heightMm || frame.height || '?') + ' mm</strong></div>'
      + '<div><span style="color:#9ca3af">Colour</span> ' + (frame.colour || '—') + '</div>'
      + '</div>'
      // Big action buttons
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'
      + '<button data-action="tablet-done" data-frame-id="' + frame.id + '" style="padding:18px;background:#22c55e;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;transition:transform .05s" onmousedown="this.style.transform=\'scale(0.97)\'" onmouseup="this.style.transform=\'\'" onmouseleave="this.style.transform=\'\'">✓ Done</button>'
      + '<button data-action="tablet-pause" data-frame-id="' + frame.id + '" style="padding:18px;background:#f59e0b;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">⏸ Pause</button>'
      + '<button data-action="tablet-issue" data-frame-id="' + frame.id + '" style="padding:18px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">⚠ Flag Issue</button>'
      + '</div></div></div>';
  }

  function _renderNextUpCard(frame, op, station) {
    var planned = Number((frame.stationTimes || {})[station.id]) || 0;
    return '<div class="card" style="padding:14px 18px;margin-bottom:14px;background:#f9fafb;border:1px dashed #cbd5e1">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '<div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700">Next up</div>'
      + '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;color:#c41230;margin-top:2px">' + (frame.name || frame.id) + (frame.rework ? ' <span style="font-size:9px;background:#ef4444;color:#fff;padding:1px 6px;border-radius:6px;font-weight:700;vertical-align:middle">REWORK</span>' : '') + '</div>'
      + '<div style="font-size:12px;color:#6b7280;margin-top:2px">' + (frame.jobRef || frame.orderId || '—') + ' · ' + (frame.widthMm || frame.width || '?') + '×' + (frame.heightMm || frame.height || '?') + ' · planned ' + planned + ' min</div></div>'
      + '<button data-action="tablet-start" data-frame-id="' + frame.id + '" class="btn-r" style="padding:14px 24px;font-size:14px;font-weight:800">▶ Start</button>'
      + '</div></div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS (now delegated via defineAction above)
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION + SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.tabletoperator = function() { return renderTabletOperator(); };

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

  // ── Sidebar nav entry: DISABLED 2026-05-02 (Graham — hide Operator Tablet) ─
  // The renderSidebar wrapper that used to inject a 📱 Operator Tablet nav item
  // is currently disabled. The page itself (renderTabletOperator) is still
  // registered via SPARTAN_EXTRA_PAGES and reachable by URL/state if needed,
  // but it's not surfaced in the sidebar. To re-enable, restore the wrapper
  // block from git history.

  // ── Window exports ─────────────────────────────────────────────────────────
  window.renderTabletOperator = renderTabletOperator;
  window.getOperators         = getOperators;
  window.saveOperators        = saveOperators;
  window.getOperatorLog       = getOperatorLog;
  window.saveOperatorLog      = saveOperatorLog;

  console.log('[47-factory-stage7-tablet-operator] /tabletoperator registered.');
})();
