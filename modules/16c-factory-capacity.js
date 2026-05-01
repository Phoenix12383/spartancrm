// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 16c-factory-capacity.js
// Factory capacity engine + Capacity Planner page (split out of 16-factory-crm.js).
// Owns FACTORY_STATIONS_TIMES, estimateFrameMinutes, estimateOrderMinutes,
// _factoryCapWeek, renderFactoryCapacity. Co-locates the math with its only consumer.
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── Factory Capacity Planner ─────────────────────────────────────────────────
// Production times per frame from Spartan CAD PRICING_DEFAULTS (minutes).
// NOTE: Glazing intentionally excluded — Spartan site-glazes, so glass is fitted
// on-site at installation, not in the factory.
var FACTORY_STATIONS_TIMES = [
  {id:'S1_saw',name:'Profile Saw',rate:42,cap:480,staff:2,col:'#ef4444'},
  {id:'S2_steel',name:'Steel Saw',rate:38,cap:480,staff:2,col:'#f97316'},
  {id:'S4A_cnc',name:'CNC Mill',rate:45,cap:480,staff:1,col:'#eab308'},
  {id:'S4B_screw',name:'Steel Screw',rate:38,cap:480,staff:1,col:'#84cc16'},
  {id:'S_weld',name:'Welder',rate:45,cap:480,staff:2,col:'#22c55e'},
  {id:'S_clean',name:'Corner Clean',rate:40,cap:480,staff:1,col:'#14b8a6'},
  {id:'S5_hw',name:'Hardware',rate:42,cap:480,staff:2,col:'#06b6d4'},
  {id:'S6_reveal',name:'Reveals',rate:38,cap:480,staff:1,col:'#8b5cf6'},
  {id:'S7_fly',name:'Fly Screen',rate:36,cap:480,staff:1,col:'#a855f7'},
  {id:'S_qc',name:'QC',rate:45,cap:480,staff:1,col:'#ec4899'},
  {id:'S_disp',name:'Dispatch',rate:35,cap:480,staff:2,col:'#6b7280'},
];

// Estimate production minutes per frame at each station (from CAD engine)
function estimateFrameMinutes(frame) {
  var type = frame.productType || 'awning_window';
  var panels = frame.panelCount || frame.apertures || 1;
  var isDoor = type.indexOf('door') >= 0;
  var isFixed = type === 'fixed_window';
  var numSashes = isFixed ? 0 : panels;
  var numRects = 1 + numSashes;
  var numMullions = panels > 1 ? panels - 1 : 0;
  var profileBars = numRects * 4 + numMullions;
  var totalCorners = numRects * 4 + numMullions * 2;
  var hwPerSash = {awning_window:12,casement_window:12,tilt_turn_window:18,fixed_window:2,sliding_window:8,french_door:20,hinged_door:16,bifold_door:14,lift_slide_door:25,smart_slide_door:14,stacker_door:12,double_hung_window:10};

  return {
    S1_saw: 1 + profileBars * 1.3 + numMullions * 0.8 + panels * 1.2,
    S2_steel: profileBars * 1.4,
    S4A_cnc: numRects * 0.4 + (2 + numSashes * 2) * 0.5 + numSashes * (0.6 + 0.8 + 1.2 + 1.4 + 0.3 + 1.0) + (type === 'tilt_turn_window' ? numSashes * 1.5 : 0) + (isDoor ? 1.8 : 0),
    S4B_screw: profileBars * (0.3 + 4 * 0.25),
    S_weld: numRects * (0.5 + 1.0 + 2.5 + 0.8 + 2.5) + numMullions * 2.0,
    S_clean: totalCorners * 1.2 + numRects * 0.5,
    S5_hw: (hwPerSash[type] || 10) * Math.max(1, numSashes),
    S6_reveal: 3 * (0.5 + 0.8) + 6.0 + 1.0 + 2.0,
    S7_fly: frame.showFlyScreen !== false ? (4 * 0.6 + 1.5 + 3.0 + 4 * 0.5 + 0.5 + 0.3) : 0,
    S_qc: 2.0 + 1.0 + 1.0 + Math.max(1, numSashes) * 1.5,
    S_disp: 3.0 + 1.0 + 2.0,
  };
}

function estimateOrderMinutes(order) {
  var items = [];
  // Get frames from the CRM job's CAD data. Step 5 §6: prefer cadFinalData
  // (the signed design) over cadSurveyData (measured) over cadData (original).
  var crmJob = (getState().jobs || []).find(function(j) { return j.factoryOrderId === order.id || j.jobNumber === order.jid; });
  var cadData = crmJob ? (crmJob.cadFinalData || crmJob.cadSurveyData || crmJob.cadData) : null;
  var frames = cadData && cadData.projectItems ? cadData.projectItems : [];

  // Step 5 §6 / spec §8.2: prefer CAD-supplied station times when present.
  // CAD v2.0+ sends totals.stationTimes on every save; we persist them on the
  // job as job.stationTimes. If the job has them, use them verbatim — that's
  // CAD's authoritative number, not a heuristic guess. Legacy jobs (CAD v1.x,
  // or pre-Step-5 jobs) fall back to the per-frame heuristic formula below.
  //
  // Path A (preferred, since 26-cad-timing-contract.js): route through
  // CadTimingContract.getJobStationTimes — it knows the 11-key contract,
  // zero-fills missing keys, and falls back through cadFinalData/cadSurvey
  // Data/cadData snapshots if job.stationTimes itself isn't populated.
  // Path B: legacy direct-read (kept as a fallback for cases where the
  // contract module hasn't loaded yet, e.g. boot ordering bugs or unit tests).
  if (typeof CadTimingContract !== 'undefined' && crmJob) {
    var contractTimes = CadTimingContract.getJobStationTimes(crmJob);
    var hasAny = false;
    Object.keys(contractTimes).forEach(function(k) { if (contractTimes[k] > 0) hasAny = true; });
    if (hasAny) {
      var stTotalsC = {};
      var stBottleneckC = null; var stBottleneckMinsC = -1;
      FACTORY_STATIONS_TIMES.forEach(function(s) {
        var mins = Number(contractTimes[s.id]) || 0;
        stTotalsC[s.id] = mins;
        if (mins > stBottleneckMinsC) { stBottleneckC = s.id; stBottleneckMinsC = mins; }
      });
      return {
        totals: stTotalsC,
        frameCount: frames.length || (order.frameCount || 0),
        bottleneck: stBottleneckC
      };
    }
  }
  if (crmJob && crmJob.stationTimes && typeof crmJob.stationTimes === 'object') {
    var stTotals = {};
    var stBottleneck = null; var stBottleneckMins = -1;
    FACTORY_STATIONS_TIMES.forEach(function(s) {
      var mins = Number(crmJob.stationTimes[s.id]) || 0;
      stTotals[s.id] = mins;
      if (mins > stBottleneckMins) { stBottleneck = s.id; stBottleneckMins = mins; }
    });
    return {
      totals: stTotals,
      frameCount: frames.length || (order.frameCount || 0),
      bottleneck: stBottleneck
    };
  }

  // Heuristic fallback — existing logic, unchanged.
  if (frames.length === 0) {
    // Fallback: estimate from frame count and assume mixed window types
    for (var i = 0; i < (order.frameCount || 1); i++) {
      frames.push({ productType: 'casement_window', panelCount: 2, showFlyScreen: true });
    }
  }
  // Sum minutes across all frames
  var totals = {};
  FACTORY_STATIONS_TIMES.forEach(function(s) { totals[s.id] = 0; });
  frames.forEach(function(f) {
    var mins = estimateFrameMinutes(f);
    Object.keys(mins).forEach(function(k) { if (totals[k] !== undefined) totals[k] += mins[k]; });
  });
  return { totals: totals, frameCount: frames.length, bottleneck: Object.keys(totals).reduce(function(a, b) { return totals[a] > totals[b] ? a : b; }) };
}

var _factoryCapWeek = 0;

function renderFactoryCapacity() {
  var orders = getFactoryOrders().filter(function(o) { return o.status !== 'dispatched'; });
  var branch = getState().branch || 'all';
  if (branch !== 'all') orders = orders.filter(function(o) { return o.branch === branch; });
  var DAILY_MINS = 480;

  function getDateStr(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function isWeekend(d) { var day = d.getDay(); return day === 0 || day === 6; }
  function nextWorkday(d) { var r = new Date(d); while (isWeekend(r)) r = addDays(r, 1); return r; }
  function addWorkdays(d, n) { var r = new Date(d); var added = 0; while (added < n) { r.setDate(r.getDate() + 1); if (!isWeekend(r)) added++; } return r; }
  function fmtDate(d) { return d.toLocaleDateString('en-AU', {day:'numeric',month:'short'}); }

  // Calculate estimates for each order
  var estimates = orders.map(function(o) {
    var est = estimateOrderMinutes(o);
    var totalMins = 0;
    Object.keys(est.totals).forEach(function(k) { totalMins += est.totals[k]; });
    var bottleneckStation = FACTORY_STATIONS_TIMES.find(function(s) { return s.id === est.bottleneck; });
    var bottleneckMins = est.totals[est.bottleneck] || 0;
    var prodDays = Math.ceil(bottleneckMins / DAILY_MINS) || 1;
    return Object.assign({}, o, { est: est, totalMins: totalMins, bottleneckMins: bottleneckMins, bottleneckName: bottleneckStation ? bottleneckStation.name : '', prodDays: prodDays });
  });

  // Auto-schedule: production starts on material delivery date (or today if not set)
  var today = new Date(); today.setHours(0,0,0,0);
  var scheduled = [];
  // Track station availability: stationId → next available date
  var stationAvail = {};
  FACTORY_STATIONS_TIMES.forEach(function(s) { stationAvail[s.id] = new Date(today); });

  // Sort by material delivery date (earliest first), then by creation
  estimates.sort(function(a, b) {
    var aDate = a.materialDeliveryDate || '9999';
    var bDate = b.materialDeliveryDate || '9999';
    return aDate.localeCompare(bDate);
  });

  estimates.forEach(function(o) {
    // Earliest start = material delivery date or today
    var matDate = o.materialDeliveryDate ? nextWorkday(new Date(o.materialDeliveryDate)) : nextWorkday(new Date(today));
    // Also can't start before the bottleneck station is free
    var bnAvail = stationAvail[o.est.bottleneck] || today;
    var startDate = matDate > bnAvail ? matDate : bnAvail;
    startDate = nextWorkday(startDate);
    var endDate = addWorkdays(startDate, Math.max(0, o.prodDays - 1));
    // Update station availability
    FACTORY_STATIONS_TIMES.forEach(function(s) {
      var stMins = o.est.totals[s.id] || 0;
      var stDays = Math.ceil(stMins / DAILY_MINS) || 0;
      if (stDays > 0) {
        var stEnd = addWorkdays(startDate, stDays);
        if (stEnd > (stationAvail[s.id] || today)) stationAvail[s.id] = stEnd;
      }
    });
    scheduled.push(Object.assign({}, o, {
      schedStart: getDateStr(startDate), schedEnd: getDateStr(endDate),
      estCompleteDate: endDate, materialsReady: !!o.materialDeliveryDate
    }));
  });

  // Week view
  var weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 + _factoryCapWeek * 7);
  var weekDays = [];
  for (var wd = 0; wd < 5; wd++) {
    var day = addDays(weekStart, wd);
    weekDays.push({ date: getDateStr(day), label: ['Mon','Tue','Wed','Thu','Fri'][wd] + ' ' + day.getDate() + '/' + (day.getMonth()+1), dateObj: day });
  }

  // Station load this week
  var stationLoad = {};
  FACTORY_STATIONS_TIMES.forEach(function(s) { stationLoad[s.id] = 0; });
  var weekEndStr = getDateStr(addDays(weekStart, 4));
  var weekStartStr = getDateStr(weekStart);
  scheduled.forEach(function(o) {
    if (o.schedStart > weekEndStr || o.schedEnd < weekStartStr) return;
    Object.keys(o.est.totals).forEach(function(k) { stationLoad[k] = (stationLoad[k] || 0) + o.est.totals[k]; });
  });

  // KPIs
  var totalFrames = estimates.reduce(function(s, o) { return s + o.est.frameCount; }, 0);
  var totalHrs = Math.round(estimates.reduce(function(s, o) { return s + o.totalMins; }, 0) / 60);
  var avgDays = estimates.length > 0 ? Math.round(estimates.reduce(function(s, o) { return s + o.prodDays; }, 0) / estimates.length * 10) / 10 : 0;
  var noMaterialDate = estimates.filter(function(o) { return !o.materialDeliveryDate; }).length;
  var bottleneckStn = FACTORY_STATIONS_TIMES.reduce(function(a, b) { return (stationLoad[a.id] || 0) > (stationLoad[b.id] || 0) ? a : b; });

  var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'
    + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">\ud83d\udcc8 Capacity Planner</h2>'
    + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Auto-schedule based on material delivery + Spartan CAD station times</p></div>'
    + '<div style="display:flex;gap:6px"><button onclick="_factoryCapWeek--;renderPage()" class="btn-w" style="font-size:12px;padding:5px 10px">\u2190 Prev</button>'
    + '<button onclick="_factoryCapWeek=0;renderPage()" class="btn-w" style="font-size:12px;padding:5px 10px">This Week</button>'
    + '<button onclick="_factoryCapWeek++;renderPage()" class="btn-w" style="font-size:12px;padding:5px 10px">Next \u2192</button></div></div>';

  // KPI strip
  h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">'
    + '<div class="card" style="padding:14px 16px;border-left:4px solid #c41230"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">In Queue</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:4px">' + orders.length + '</div></div>'
    + '<div class="card" style="padding:14px 16px;border-left:4px solid #3b82f6"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Total Frames</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#3b82f6;margin-top:4px">' + totalFrames + '</div></div>'
    + '<div class="card" style="padding:14px 16px;border-left:4px solid #f59e0b"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Labour Hours</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#f59e0b;margin-top:4px">' + totalHrs + 'h</div></div>'
    + '<div class="card" style="padding:14px 16px;border-left:4px solid #a855f7"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Avg Lead Time</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#a855f7;margin-top:4px">' + avgDays + 'd</div></div>'
    + '<div class="card" style="padding:14px 16px;border-left:4px solid ' + (noMaterialDate > 0 ? '#ef4444' : '#22c55e') + '"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Missing Mat. Date</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + (noMaterialDate > 0 ? '#ef4444' : '#22c55e') + ';margin-top:4px">' + noMaterialDate + '</div></div></div>';

  // Warning if missing material dates
  if (noMaterialDate > 0) {
    h += '<div style="padding:10px 16px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;gap:8px;font-size:12px;color:#92400e"><strong>\u26a0\ufe0f ' + noMaterialDate + ' job' + (noMaterialDate > 1 ? 's' : '') + ' missing material delivery date</strong> \u2014 set dates in the Job Queue to get accurate completion estimates.</div>';
  }

  // Station utilisation bars
  var weeklyCapMins = DAILY_MINS * 5;
  h += '<div class="card" style="padding:16px;margin-bottom:16px"><h4 style="font-size:14px;font-weight:700;margin:0 0 12px;font-family:Syne,sans-serif">Station Utilisation <span style="font-weight:400;color:#9ca3af;font-size:12px">' + weekDays[0].label + ' \u2013 ' + weekDays[4].label + '</span></h4><div style="display:grid;gap:6px">';
  FACTORY_STATIONS_TIMES.forEach(function(s) {
    var used = Math.round(stationLoad[s.id] || 0);
    var cap = weeklyCapMins * (s.staff || 1);
    var pct = cap > 0 ? Math.min(100, Math.round(used / cap * 100)) : 0;
    var barCol = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
    var isBottleneck = s.id === bottleneckStn.id && orders.length > 0;
    h += '<div style="display:flex;align-items:center;gap:8px"><div style="width:100px;font-size:11px;font-weight:' + (isBottleneck ? '700' : '500') + ';color:' + (isBottleneck ? '#ef4444' : '#374151') + '">' + (isBottleneck ? '\u26a0 ' : '') + s.name + '</div>'
      + '<div style="flex:1;height:16px;background:#f3f4f6;border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barCol + ';border-radius:3px"></div></div>'
      + '<div style="width:40px;font-size:10px;font-weight:700;text-align:right;color:' + barCol + '">' + pct + '%</div></div>';
  });
  h += '</div></div>';

  // Gantt timeline
  h += '<div class="card" style="padding:16px;margin-bottom:16px"><h4 style="font-size:14px;font-weight:700;margin:0 0 12px;font-family:Syne,sans-serif">Production Schedule</h4>';
  if (scheduled.length === 0) {
    h += '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">No jobs to schedule.</div>';
  } else {
    var COL_W = 110;
    h += '<div style="overflow-x:auto"><div style="display:flex;min-width:' + (240 + weekDays.length * COL_W) + 'px">'
      + '<div style="width:240px;flex-shrink:0;padding:8px 12px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb">Job</div>';
    weekDays.forEach(function(wd) {
      var isToday = wd.date === getDateStr(today);
      h += '<div style="width:' + COL_W + 'px;flex-shrink:0;padding:8px 4px;font-size:10px;font-weight:700;text-align:center;color:' + (isToday ? '#c41230' : '#6b7280') + ';border-bottom:2px solid ' + (isToday ? '#c41230' : '#e5e7eb') + '">' + wd.label + '</div>';
    });
    h += '</div>';

    scheduled.forEach(function(o, idx) {
      var ps = getFactoryStatusObj(o.status);
      h += '<div style="display:flex;min-width:' + (240 + weekDays.length * COL_W) + 'px;border-bottom:1px solid #f3f4f6;' + (idx % 2 ? 'background:#fafafa' : '') + '">'
        + '<div style="width:240px;flex-shrink:0;padding:8px 12px;display:flex;flex-direction:column;gap:1px">'
        + '<div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;font-weight:700;color:#c41230">' + o.jid + '</span>'
        + (o.materialsReady ? '<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#f0fdf4;color:#22c55e;border:1px solid #86efac">\u2705 Mat</span>' : '<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#fef3c7;color:#92400e;border:1px solid #fde68a">\u23f3 Mat</span>') + '</div>'
        + '<div style="font-size:10px;color:#6b7280">' + o.customer + ' \u00b7 ' + o.est.frameCount + ' frames</div>'
        + '<div style="font-size:10px;color:#3b82f6;font-weight:600">Ready: ' + fmtDate(o.estCompleteDate) + '</div></div>';

      weekDays.forEach(function(wd) {
        var inRange = wd.date >= o.schedStart && wd.date <= o.schedEnd;
        var isStart = wd.date === o.schedStart;
        var isEnd = wd.date === o.schedEnd;
        h += '<div style="width:' + COL_W + 'px;flex-shrink:0;padding:3px;display:flex;align-items:center">';
        if (inRange) {
          h += '<div style="width:100%;height:26px;background:' + ps.col + '25;border:1.5px solid ' + ps.col + ';'
            + 'border-radius:' + (isStart ? '6px' : '0') + ' ' + (isEnd ? '6px' : '0') + ' ' + (isEnd ? '6px' : '0') + ' ' + (isStart ? '6px' : '0') + ';'
            + 'display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:' + ps.col + '">'
            + (isStart ? o.est.frameCount + 'f' : '') + '</div>';
        }
        h += '</div>';
      });
      h += '</div>';
    });
    h += '</div>';
  }
  h += '</div>';

  // Per-job breakdown table with completion dates
  h += '<div class="card" style="padding:0;overflow:hidden"><div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">Job Estimates <span style="font-weight:400;color:#9ca3af;font-size:12px">(from Spartan CAD station times)</span></h4></div>';
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>'
    + '<th class="th" style="position:sticky;left:0;background:#f9fafb;z-index:1">Job</th>'
    + '<th class="th">Frames</th>'
    + '<th class="th">Materials</th>'
    + '<th class="th">Prod Start</th>'
    + '<th class="th" style="background:#f0fdf4;color:#15803d">\u2705 Ready By</th>'
    + '<th class="th">Install</th>'
    + '<th class="th" style="text-align:right">Total Min</th>'
    + '<th class="th" style="text-align:right">Days</th>'
    + '<th class="th">\u26a0 Bottleneck</th>'
    + '</tr></thead><tbody>';

  scheduled.forEach(function(o, i) {
    var installDate = o.installDate ? new Date(o.installDate) : null;
    var daysToInstall = installDate && o.estCompleteDate ? Math.round((installDate - o.estCompleteDate) / 86400000) : null;
    var installRisk = daysToInstall !== null && daysToInstall < 3;
    h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
      + '<td class="td" style="font-weight:700;color:#c41230;position:sticky;left:0;background:' + (i % 2 ? '#fafafa' : '#fff') + ';z-index:1">' + o.jid + '<div style="font-size:10px;font-weight:400;color:#6b7280">' + o.customer + '</div></td>'
      + '<td class="td">' + o.est.frameCount + '</td>'
      + '<td class="td">' + (o.materialDeliveryDate ? '<span style="color:#22c55e;font-weight:600">' + new Date(o.materialDeliveryDate).toLocaleDateString('en-AU') + '</span>' : '<span style="color:#ef4444">\u26a0 Not set</span>') + '</td>'
      + '<td class="td" style="font-weight:600">' + new Date(o.schedStart).toLocaleDateString('en-AU') + '</td>'
      + '<td class="td" style="font-weight:700;color:#15803d;background:#f0fdf420">' + fmtDate(o.estCompleteDate) + '</td>'
      + '<td class="td">' + (installDate ? '<span style="' + (installRisk ? 'color:#ef4444;font-weight:700' : 'color:#6b7280') + '">' + installDate.toLocaleDateString('en-AU') + (daysToInstall !== null ? ' <span style="font-size:9px">(' + (daysToInstall >= 0 ? daysToInstall + 'd buffer' : Math.abs(daysToInstall) + 'd LATE') + ')</span>' : '') + '</span>' : '\u2014') + '</td>'
      + '<td class="td" style="text-align:right;font-family:monospace">' + Math.round(o.totalMins) + '</td>'
      + '<td class="td" style="text-align:right;font-weight:700;color:#3b82f6">' + o.prodDays + '</td>'
      + '<td class="td"><span style="font-size:10px;font-weight:600;color:#ef4444">\u26a0 ' + o.bottleneckName + '</span></td></tr>';
  });
  h += '</tbody></table></div></div>';

  return '<div>' + h + '</div>';
}
