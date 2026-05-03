// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 46-factory-stage6-smartplanner.js
// Stage 6 — Smart Planner (5-factor scoring + weekly release recommendations)
//
//   renderSmartPlanner()  → /smartplanner
//
// Scoring factors (each normalised 0–1, then weighted; weights configurable
// in Stage 10 Factory Settings, sum to 100):
//
//   leadSlack  (default 30%) — production days needed vs days until install
//   proximity  (default 25%) — closer install date = higher score
//   priority   (default 15%) — VIP / commercial / regular / low flag on order
//   capacity   (default 15%) — bottleneck station headroom this week
//   stock      (default 15%) — % BOM coverage from current stock
//
// Override learning: when the PM moves a job between weekly buckets, we log
// the override in spartan_planner_overrides AND bump the order's `priority`
// field (vip if moved up, low if moved down). Future scoring then naturally
// reflects the override because priority is one of the factors. The history
// is browseable from the page so the Smart Planner becomes auditable rather
// than mysterious.
//
// Page registration via SPARTAN_EXTRA_PAGES; sidebar entry as 🧠 Smart Planner.
// ═════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  window._planTab = window._planTab || 'recommended';

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────
  defineAction('planner-set-tab', function(target) {
    window._planTab = target.dataset.tab;
    renderPage();
  });
  defineAction('planner-explain', function(target) {
    showPlannerExplain(target.dataset.kind, target.dataset.id);
  });
  defineAction('planner-override', function(target) {
    plannerOverride(target.dataset.kind, target.dataset.id, +target.dataset.weekIdx);
  });
  defineAction('planner-nav-self', function(target) {
    var patch = { page: 'smartplanner', dealDetailId: null, leadDetailId: null,
                  contactDetailId: null, jobDetailId: null };
    if (target.dataset.closeSidebar === '1') patch.sidebarOpen = false;
    setState(patch);
  });

  var DEFAULT_WEIGHTS = { leadSlack:30, proximity:25, priority:15, capacity:15, stock:15 };

  function _getSettings() {
    try {
      var s = JSON.parse(localStorage.getItem('spartan_factory_settings') || 'null');
      return Object.assign({ workHours:8, workDays:5, weights:DEFAULT_WEIGHTS }, s || {});
    } catch(e) { return { workHours:8, workDays:5, weights:DEFAULT_WEIGHTS }; }
  }
  function _getOverrides() {
    try { return JSON.parse(localStorage.getItem('spartan_planner_overrides') || '[]'); }
    catch(e) { return []; }
  }
  function _saveOverrides(o) { localStorage.setItem('spartan_planner_overrides', JSON.stringify(o)); }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCORING — input: { installDate, priority }, frames[]
  // Returns { total: 0..100, breakdown: { factor: { score, weight, label, detail } } }
  // ═══════════════════════════════════════════════════════════════════════════
  function smartPlanScore(target, frames) {
    var settings = _getSettings();
    var w = settings.weights || DEFAULT_WEIGHTS;

    var now = new Date();
    var installD = target.installDate ? new Date(target.installDate) : null;
    var daysUntilInstall = installD ? Math.max(0, Math.round((installD - now) / 86400000)) : 30;

    // 1. Lead-time slack
    var totalMin = (frames || []).reduce(function(s, f) {
      var t = f.stationTimes || {};
      return s + Object.keys(t).reduce(function(a, k){return a + (Number(t[k]) || 0);}, 0);
    }, 0);
    var dailyCapMin  = (settings.workHours || 8) * 60 * 5;
    var prodDaysReq  = totalMin > 0 ? totalMin / dailyCapMin : 1;
    var slack        = daysUntilInstall - prodDaysReq;
    // Map slack [-15..+15] → [1..0] linearly, clamped
    var slackScore = Math.max(0, Math.min(1, (15 - slack) / 30 + 0.5));

    // 2. Install proximity — 0d→1, 60d→0
    var proximityScore = Math.max(0, Math.min(1, (60 - daysUntilInstall) / 60));

    // 3. Customer priority
    var priorityScore = 0.5;
    if (target.priority === 'vip') priorityScore = 1.0;
    else if (target.priority === 'commercial') priorityScore = 0.75;
    else if (target.priority === 'regular') priorityScore = 0.5;
    else if (target.priority === 'low') priorityScore = 0.25;

    // 4. Capacity headroom — 1 - (max station load / week capacity)
    var headroomScore = 0.5;
    if (typeof FACTORY_STATIONS_TIMES !== 'undefined') {
      var allItems = (typeof getFactoryItems === 'function') ? getFactoryItems() : [];
      var perStation = {};
      FACTORY_STATIONS_TIMES.forEach(function(s){perStation[s.id] = 0;});
      allItems.forEach(function(it) {
        var t = it.stationTimes || {};
        Object.keys(t).forEach(function(k){if (perStation[k] !== undefined) perStation[k] += Number(t[k]) || 0;});
      });
      var weekCapMin = (settings.workHours || 8) * 60 * (settings.workDays || 5);
      var maxLoad = Math.max.apply(null, Object.keys(perStation).map(function(k){return perStation[k];})) || 0;
      headroomScore = Math.max(0, 1 - (maxLoad / Math.max(weekCapMin, 1)));
    }

    // 5. Stock readiness — average coverage across categories
    var stockScore = 0.7;
    if (typeof predictShortfall === 'function') {
      try {
        var f = predictShortfall();
        if (f.length) {
          var avg = f.reduce(function(s, r){return s + r.coverage;}, 0) / f.length;
          stockScore = Math.max(0, Math.min(1, avg / 100));
        }
      } catch(e) {}
    }

    var total = (slackScore     * (w.leadSlack || 30))
              + (proximityScore * (w.proximity || 25))
              + (priorityScore  * (w.priority  || 15))
              + (headroomScore  * (w.capacity  || 15))
              + (stockScore     * (w.stock     || 15));

    return {
      total: Math.round(total),
      breakdown: {
        slack:     { score:Math.round(slackScore*100),     weight:w.leadSlack||30, label:'Lead-time slack',   detail:slack.toFixed(1)+'d slack ('+prodDaysReq.toFixed(1)+'d req, '+daysUntilInstall+'d to install)' },
        proximity: { score:Math.round(proximityScore*100), weight:w.proximity||25, label:'Install proximity', detail:daysUntilInstall+' day(s) to install' },
        priority:  { score:Math.round(priorityScore*100),  weight:w.priority||15,  label:'Customer priority', detail:target.priority || 'regular' },
        capacity:  { score:Math.round(headroomScore*100),  weight:w.capacity||15,  label:'Capacity headroom', detail:Math.round(headroomScore*100)+'% bottleneck-free' },
        stock:     { score:Math.round(stockScore*100),     weight:w.stock||15,     label:'Stock readiness',   detail:Math.round(stockScore*100)+'% average coverage' },
      }
    };
  }
  window.smartPlanScore = smartPlanScore;

  // ═══════════════════════════════════════════════════════════════════════════
  // CANDIDATE COLLECTION
  // ═══════════════════════════════════════════════════════════════════════════
  // Two sources:
  //   • Jobs awaiting production (signed final + no productionStatus + not held)
  //   • Factory orders in early statuses (received / bom_generated / mat_ordered)
  function _collectCandidates() {
    var jobs    = (getState().jobs)     || [];
    var contacts= (getState().contacts) || [];
    var orders  = (typeof getFactoryOrders === 'function') ? getFactoryOrders() : [];
    var allFrames = (typeof getFactoryItems === 'function') ? getFactoryItems() : [];
    var out = [];

    jobs.filter(function(j) {
      return j.finalSignedAt && !j.productionStatus && !j.factoryHold
        && j.status !== 'h_completed_standard' && j.status !== 'i_cancelled';
    }).forEach(function(j) {
      var cad    = j.cadFinalData || j.cadSurveyData || j.cadData || {};
      var frames = cad.projectItems || [];
      var c      = contacts.find(function(ct){return ct.id === j.contactId;});
      out.push({
        kind:'job', id:j.id, ref:j.jobNumber || j.id, name:c ? c.fn + ' ' + c.ln : '—',
        installDate:j.installDate, value:j.val || 0, frameCount:frames.length, priority:j.priority || 'regular',
        score: smartPlanScore({installDate:j.installDate, priority:j.priority||'regular'}, frames),
      });
    });

    orders.filter(function(o) {
      return ['received','bom_generated','materials_ordered'].indexOf(o.status) >= 0;
    }).forEach(function(o) {
      var jobFrames = allFrames.filter(function(i){return i.orderId === o.jid;});
      out.push({
        kind:'order', id:o.id, ref:o.jid, name:o.customer, installDate:o.installDate,
        value:o.value || 0, frameCount:o.frameCount, priority:o.priority || 'regular',
        score: smartPlanScore({installDate:o.installDate, priority:o.priority||'regular'}, jobFrames),
      });
    });

    out.sort(function(a, b){return b.score.total - a.score.total;});
    return out;
  }

  // Allocate candidates into 3 weekly buckets by capacity-fit (greedy)
  function _allocateToWeeks(candidates, weekCapMin) {
    var weeks = [[], [], []];
    var totals = [0, 0, 0];
    var perFrameMin = 60; // crude average — refined when CAD station times are present
    candidates.forEach(function(c) {
      var thisMin = (c.frameCount || 0) * perFrameMin;
      var placed = false;
      for (var w = 0; w < 3; w++) {
        if (totals[w] + thisMin <= weekCapMin) {
          weeks[w].push(c); totals[w] += thisMin; placed = true; break;
        }
      }
      if (!placed) { weeks[2].push(c); totals[2] += thisMin; }   // overflow into week 3
    });
    return { weeks:weeks, totals:totals };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderSmartPlanner() {
    var settings = _getSettings();
    var weekCapMin = (settings.workHours || 8) * 60 * (settings.workDays || 5) * 5; // ~5 stations
    var cands = _collectCandidates();
    var alloc = _allocateToWeeks(cands, weekCapMin);
    var ovs = _getOverrides();

    var h = '<div style="margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'
      + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">🧠 Smart Planner</h2>'
      + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">5-factor scoring with weekly release recommendations — overrides feed back into the model</p></div>'
      + '<div style="display:flex;gap:6px">'
      + '<button data-action="planner-set-tab" data-tab="recommended" style="padding:6px 14px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid ' + (window._planTab === 'recommended' ? '#c41230' : '#e5e7eb') + ';background:' + (window._planTab === 'recommended' ? '#c41230' : '#fff') + ';color:' + (window._planTab === 'recommended' ? '#fff' : '#374151') + ';cursor:pointer;font-family:inherit">Recommended</button>'
      + '<button data-action="planner-set-tab" data-tab="overrides" style="padding:6px 14px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid ' + (window._planTab === 'overrides' ? '#c41230' : '#e5e7eb') + ';background:' + (window._planTab === 'overrides' ? '#c41230' : '#fff') + ';color:' + (window._planTab === 'overrides' ? '#fff' : '#374151') + ';cursor:pointer;font-family:inherit">Overrides (' + ovs.length + ')</button>'
      + '</div></div>';

    if (window._planTab === 'overrides') return '<div>' + h + _renderOverridesTab(ovs) + '</div>';

    // KPI strip
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">';
    [
      { l:'Candidates',          v:cands.length, c:'#3b82f6' },
      { l:'Wk 1 Capacity Used',  v:Math.round(alloc.totals[0] / Math.max(1, weekCapMin) * 100) + '%', c:alloc.totals[0]/weekCapMin > 0.9 ? '#ef4444' : '#22c55e' },
      { l:'Wk 2 Capacity Used',  v:Math.round(alloc.totals[1] / Math.max(1, weekCapMin) * 100) + '%', c:alloc.totals[1]/weekCapMin > 0.9 ? '#ef4444' : '#f59e0b' },
      { l:'Overrides Logged',    v:ovs.length,    c:'#a855f7' },
    ].forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '">'
        + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
    h += '</div>';

    if (!cands.length) {
      h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">'
        + '<div style="font-size:40px;margin-bottom:10px">🎯</div>'
        + '<div style="font-size:14px;font-weight:600;color:#374151">No release candidates right now</div>'
        + '<div style="font-size:12px;margin-top:4px">Jobs appear here once Final Sign Off is recorded.</div></div>';
      return '<div>' + h + '</div>';
    }

    // Weekly buckets
    alloc.weeks.forEach(function(wk, wIdx) {
      var pct = Math.round(alloc.totals[wIdx] / Math.max(1, weekCapMin) * 100);
      var col = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
      h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px;border-left:4px solid ' + col + '">'
        + '<div style="padding:12px 18px;background:' + col + '08;border-bottom:1px solid ' + col + '20;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
        + '<div><h4 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">Week ' + (wIdx + 1) + ' Release (' + wk.length + ' job' + (wk.length === 1 ? '' : 's') + ' · ' + pct + '% capacity)</h4>'
        + '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + _formatWeekRange(wIdx) + '</div></div>'
        + '<div style="height:8px;width:160px;background:#fff;border-radius:4px;overflow:hidden;border:1px solid #e5e7eb">'
        + '<div style="height:100%;background:' + col + ';width:' + Math.min(100, pct) + '%;transition:width .3s"></div></div>'
        + '</div>';

      if (!wk.length) {
        h += '<div style="padding:18px;text-align:center;color:#9ca3af;font-size:12px">No jobs allocated to this week.</div></div>';
        return;
      }
      h += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead><tr><th class="th" style="width:60px">Score</th><th class="th">Job</th><th class="th">Customer</th><th class="th">Frames</th><th class="th">Install</th><th class="th">Value</th><th class="th">Top Factor</th><th class="th">Priority</th><th class="th"></th></tr></thead><tbody>';
      wk.forEach(function(c, i) {
        var sCol = c.score.total >= 70 ? '#22c55e' : c.score.total >= 50 ? '#f59e0b' : '#ef4444';
        var bd = c.score.breakdown;
        var topFactor = Object.keys(bd).reduce(function(max, k) {
          var v  = bd[k].score * bd[k].weight;
          var mv = bd[max] ? bd[max].score * bd[max].weight : 0;
          return v > mv ? k : max;
        }, 'slack');
        var prCol = c.priority === 'vip' ? '#7c3aed' : c.priority === 'commercial' ? '#3b82f6' : c.priority === 'low' ? '#9ca3af' : '#6b7280';
        h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          + '<td class="td"><span style="display:inline-block;width:42px;text-align:center;font-weight:800;background:' + sCol + ';color:#fff;border-radius:6px;padding:4px 0;font-family:Syne,sans-serif">' + c.score.total + '</span></td>'
          + '<td class="td" style="font-weight:700;color:#c41230">' + c.ref + '</td>'
          + '<td class="td">' + c.name + '</td>'
          + '<td class="td">' + (c.frameCount || 0) + '</td>'
          + '<td class="td">' + (c.installDate ? new Date(c.installDate).toLocaleDateString('en-AU') : '—') + '</td>'
          + '<td class="td" style="font-weight:600">$' + Number(c.value || 0).toLocaleString() + '</td>'
          + '<td class="td"><span style="font-size:10px;color:#6b7280" title="' + bd[topFactor].label + ': ' + bd[topFactor].detail + '">' + bd[topFactor].label + '</span></td>'
          + '<td class="td"><span style="font-size:9px;background:' + prCol + '20;color:' + prCol + ';border:1px solid ' + prCol + '40;padding:2px 7px;border-radius:10px;font-weight:700;text-transform:uppercase">' + (c.priority || 'regular') + '</span></td>'
          + '<td class="td" style="white-space:nowrap">'
          + '<button data-action="planner-explain" data-kind="' + c.kind + '" data-id="' + c.id + '" style="padding:3px 8px;font-size:10px;background:none;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-family:inherit;color:#374151">Explain</button>'
          + ' <button data-action="planner-override" data-kind="' + c.kind + '" data-id="' + c.id + '" data-week-idx="' + wIdx + '" style="padding:3px 8px;font-size:10px;background:none;border:1px solid #c41230;color:#c41230;border-radius:6px;cursor:pointer;font-family:inherit">Override</button>'
          + '</td></tr>';
      });
      h += '</tbody></table></div>';
    });

    // Footer note explaining the weights
    var w = settings.weights || DEFAULT_WEIGHTS;
    h += '<div class="card" style="padding:10px 16px;margin-top:12px;font-size:11px;color:#6b7280;background:#f9fafb">'
      + '<strong>Current weights:</strong> Lead slack ' + (w.leadSlack||30) + '% · Proximity ' + (w.proximity||25) + '% · Priority ' + (w.priority||15) + '% · Capacity ' + (w.capacity||15) + '% · Stock ' + (w.stock||15) + '%. Configurable in Stage 10 Factory Settings.'
      + '</div>';
    return '<div>' + h + '</div>';
  }

  function _renderOverridesTab(ovs) {
    if (!ovs.length) {
      return '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">'
        + '<div style="font-size:40px;margin-bottom:10px">📜</div>'
        + '<div style="font-size:14px;font-weight:600;color:#374151">No overrides logged yet</div>'
        + '<div style="font-size:12px;margin-top:4px">When you move a job between weekly buckets, it\'s recorded here and the affected order\'s priority is bumped.</div></div>';
    }
    var sorted = ovs.slice().sort(function(a, b){return new Date(b.at) - new Date(a.at);});
    var h = '<div class="card" style="padding:0;overflow:hidden">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr><th class="th">When</th><th class="th">Kind</th><th class="th">Reference</th><th class="th">From Wk</th><th class="th">To Wk</th><th class="th">By</th><th class="th">Reason</th></tr></thead><tbody>';
    sorted.forEach(function(o, i) {
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="color:#6b7280;font-size:11px">' + new Date(o.at).toLocaleString('en-AU') + '</td>'
        + '<td class="td">' + (o.kind || '—') + '</td>'
        + '<td class="td" style="font-family:monospace">' + (o.refId || '—') + '</td>'
        + '<td class="td">Wk ' + (o.fromWeek || '—') + '</td>'
        + '<td class="td" style="font-weight:600">' + (o.toWeek === 'skip' ? 'Skip' : 'Wk ' + o.toWeek) + '</td>'
        + '<td class="td">' + (o.by || 'system') + '</td>'
        + '<td class="td" style="color:#6b7280">' + (o.reason || '—') + '</td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function _formatWeekRange(weeksAhead) {
    var s = new Date(); s.setDate(s.getDate() + weeksAhead * 7);
    var e = new Date(s); e.setDate(e.getDate() + 6);
    return s.toLocaleDateString('en-AU', {day:'numeric', month:'short'}) + ' – ' + e.toLocaleDateString('en-AU', {day:'numeric', month:'short'});
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  function showPlannerExplain(kind, id) {
    var orders = (typeof getFactoryOrders === 'function') ? getFactoryOrders() : [];
    var jobs   = (getState().jobs) || [];
    var target = kind === 'job' ? jobs.find(function(j){return j.id === id;}) : orders.find(function(o){return o.id === id;});
    if (!target) return;
    var cad    = kind === 'job' ? (target.cadFinalData || target.cadSurveyData || target.cadData || {}) : null;
    var frames = kind === 'job'
      ? (cad.projectItems || [])
      : ((typeof getFactoryItems === 'function') ? getFactoryItems().filter(function(i){return i.orderId === target.jid;}) : []);
    var sc = smartPlanScore({installDate:target.installDate, priority:target.priority || 'regular'}, frames);
    var lines = ['Smart Planner score breakdown:', '', 'Total: ' + sc.total + ' / 100', ''];
    Object.keys(sc.breakdown).forEach(function(k) {
      var b = sc.breakdown[k];
      var contrib = Math.round(b.score / 100 * b.weight);
      lines.push('• ' + b.label + ' (' + b.weight + '% wt): ' + b.score + '/100 → contributes ' + contrib + ' pts');
      lines.push('    ' + b.detail);
    });
    alert(lines.join('\n'));
  }

  function plannerOverride(kind, id, fromWeek) {
    var newWeek = prompt('Move to which week? (1, 2, or 3 — or "skip" to defer past 3 weeks):', '1');
    if (!newWeek) return;
    if (['1','2','3','skip'].indexOf(String(newWeek).toLowerCase()) < 0) {
      addToast('Enter 1, 2, 3, or "skip"', 'error'); return;
    }
    var reason = prompt('Reason (optional — helps the model learn):') || '';

    var ovs = _getOverrides();
    ovs.push({
      id:'pov_' + Date.now(),
      kind:kind, refId:id,
      fromWeek:(fromWeek + 1),
      toWeek:String(newWeek).toLowerCase(),
      reason:reason,
      at:new Date().toISOString(),
      by:(typeof getCurrentUser === 'function' && getCurrentUser() ? (getCurrentUser().name || '') : ''),
    });
    _saveOverrides(ovs);

    // Bump priority on the underlying entity
    var newPriority;
    if (newWeek === '1' || newWeek === 1) newPriority = 'vip';
    else if (newWeek === '3' || newWeek === 3) newPriority = 'low';
    else if (String(newWeek).toLowerCase() === 'skip') newPriority = 'low';
    else newPriority = 'regular';

    if (kind === 'job') {
      var jobs = (getState().jobs || []).map(function(j) {
        return j.id === id ? Object.assign({}, j, { priority:newPriority }) : j;
      });
      setState({ jobs:jobs });
    } else if (kind === 'order' && typeof getFactoryOrders === 'function' && typeof saveFactoryOrders === 'function') {
      var os = getFactoryOrders().map(function(o) {
        return o.id === id ? Object.assign({}, o, { priority:newPriority }) : o;
      });
      saveFactoryOrders(os);
    }
    addToast('Override logged — priority set to ' + newPriority, 'success');
    renderPage();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION + SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════
  window.SPARTAN_EXTRA_PAGES = window.SPARTAN_EXTRA_PAGES || {};
  window.SPARTAN_EXTRA_PAGES.smartplanner = function() { return renderSmartPlanner(); };

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

  if (typeof window.renderSidebar === 'function' && !window._STAGE6_SIDEBAR_WRAPPED) {
    window._STAGE6_SIDEBAR_WRAPPED = true;
    var _origRenderSidebar = window.renderSidebar;
    window.renderSidebar = function() {
      var html = _origRenderSidebar.apply(this, arguments);
      var st = (typeof getState === 'function') ? getState() : {};
      if (st.crmMode !== 'factory') return html;
      if (html.indexOf("setState({page:'smartplanner'") >= 0) return html;
      var sidebarOpen = st.sidebarOpen;
      var native = (typeof isNativeWrapper === 'function' && isNativeWrapper());
      var on = st.page === 'smartplanner';
      var entry = '<div class="nav-item' + (on ? ' on' : '') + '" '
        + 'data-action="planner-nav-self" data-close-sidebar="' + (native ? '1' : '0') + '" '
        + 'title="' + (!sidebarOpen ? 'Smart Planner' : '') + '">'
        + '<span style="display:inline-flex;width:18px;justify-content:center;font-size:14px">🧠</span>'
        + (sidebarOpen ? '<span style="flex:1">Smart Planner</span>' : '')
        + '</div>';

      // Insert after the Capacity Planner entry (factorycap) if present
      var anchor = "setState({page:'factorycap'";
      var idx = html.indexOf(anchor);
      if (idx < 0) {
        // Fallback to insertion after prodboard11 or prodboard
        anchor = "setState({page:'prodboard11'";
        idx = html.indexOf(anchor);
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

  window.renderSmartPlanner = renderSmartPlanner;
  window.showPlannerExplain = showPlannerExplain;
  window.plannerOverride    = plannerOverride;

  console.log('[46-factory-stage6-smartplanner] /smartplanner registered.');
})();
