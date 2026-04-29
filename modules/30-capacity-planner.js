// ============================================================================
// 30-capacity-planner.js — Capacity Planner (Phoenix's spec §6)
// ----------------------------------------------------------------------------
// Answers one question: "Can we hit our scheduled install dates with the
// staff we have?" Per-week bars showing demand (sum of effective install
// minutes for jobs scheduled in that week) vs capacity (sum of available
// installer minutes adjusted for productivity %), with overload colouring.
//
// Distinct from Smart Planner ('capacity' slug) which is the auto-scheduler.
// This page slug is 'capplan'.
// ============================================================================

(function(){
  'use strict';

  // Default work assumptions when an installer doesn't have explicit fields.
  var DEFAULT_WORK_DAYS = ['mon','tue','wed','thu','fri'];
  var DEFAULT_WORK_START = '07:00';
  var DEFAULT_WORK_END   = '15:30';
  var DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];

  function minutesBetween(start, end) {
    var s = (start||'').split(':'); var e = (end||'').split(':');
    var sm = (+s[0]||0)*60 + (+s[1]||0);
    var em = (+e[0]||0)*60 + (+e[1]||0);
    return Math.max(0, em - sm);
  }

  function installerWorkDays(ins) {
    if (Array.isArray(ins.workDays) && ins.workDays.length > 0) return ins.workDays.map(function(s){return (s||'').toLowerCase().slice(0,3);});
    return DEFAULT_WORK_DAYS.slice();
  }

  function installerMinutesPerDay(ins) {
    var ws = ins.workStart, we = ins.workEnd;
    if (ws && we) {
      var m = minutesBetween(ws, we);
      if (m > 0) return m;
    }
    var hours = +ins.maxHoursPerDay;
    if (!hours || hours <= 0) hours = 8;
    return Math.round(hours * 60);
  }

  function installerProductivity(ins) {
    var p = +ins.productivityPercent;
    if (!p && ins.id && typeof getInstallerEfficiency === 'function') p = getInstallerEfficiency(ins.id);
    if (!p || p <= 0) p = 100;
    return p;
  }

  // Sum of availability fractions across this installer's working days in the
  // week. A 5-day worker with no exceptions returns 5; one day off → 4; one
  // half-day → 4.5. Replaces a plain count so leave/sick reduces capacity.
  function workingDayFraction(ins, weekDates) {
    var days = installerWorkDays(ins);
    var sum = 0;
    weekDates.forEach(function(d){
      var key = DAY_KEYS[d.getDay()];
      if (days.indexOf(key) < 0) return;
      var ds = (typeof isoDate === 'function') ? isoDate(d) : d.toISOString().slice(0,10);
      var frac = (typeof availabilityFraction === 'function') ? availabilityFraction(ins.id, ds) : 1;
      sum += (typeof frac === 'number' ? frac : 1);
    });
    return sum;
  }

  // Capacity in minutes for one installer over the given week.
  function installerCapacityMinutes(ins, weekDates) {
    var raw = workingDayFraction(ins, weekDates) * installerMinutesPerDay(ins);
    return Math.round(raw * (installerProductivity(ins) / 100));
  }

  // Bucket: green/amber/red/dark by utilisation per spec §6.3.
  function utilisationBand(util) {
    if (util > 1.00) return {key:'overload', col:'#7f1d1d', bg:'#fef2f2', label:'Overloaded'};
    if (util > 0.95) return {key:'red',      col:'#dc2626', bg:'#fef2f2', label:'Critical'};
    if (util > 0.80) return {key:'amber',    col:'#d97706', bg:'#fffbeb', label:'Tight'};
    return                  {key:'green',    col:'#16a34a', bg:'#f0fdf4', label:'Healthy'};
  }

  function fmtHM(min) { var h = Math.floor(min/60); var m = min % 60; return h + 'h ' + (m<10?'0'+m:m) + 'm'; }

  function renderCapacityPlanner() {
    var jobs = (getState().jobs || []);
    var contacts = getState().contacts || [];
    var branch = getState().branch || 'all';
    if (branch !== 'all') jobs = jobs.filter(function(j){ return j.branch === branch; });
    var installers = (typeof getInstallers === 'function' ? getInstallers() : []).filter(function(i){return i.active;});
    if (branch !== 'all') installers = installers.filter(function(i){ return !i.branch || i.branch === branch; });

    var weekCount = +(getState().capPlanWeeks) || 8;
    var startOffset = +(getState().capPlanOffset) || 0;
    // Don't use `|| null` — week offset 0 is a valid value and would collapse to null.
    var expandedWeek = getState().capPlanExpandedWeek;
    if (expandedWeek === undefined) expandedWeek = null;

    var weeks = [];
    for (var w = 0; w < weekCount; w++) {
      var dates = getWeekDates(startOffset + w);
      var ws = isoDate(dates[0]);
      var we = isoDate(dates[6]);
      var weekJobs = jobs.filter(function(j){ return j.installDate && j.installDate >= ws && j.installDate <= we; });
      var demand = weekJobs.reduce(function(s,j){ return s + (typeof readJobInstallMinutes === 'function' ? readJobInstallMinutes(j) : 0); }, 0);
      var capacity = installers.reduce(function(s,ins){ return s + installerCapacityMinutes(ins, dates); }, 0);
      var util = capacity > 0 ? demand / capacity : (demand > 0 ? 99 : 0);
      weeks.push({offset: startOffset + w, dates:dates, weekStart:ws, weekEnd:we, jobs:weekJobs, demand:demand, capacity:capacity, util:util});
    }

    // ── Header / week-window nav ─────────────────────────────────────────────
    var header = '<div class="card" style="padding:18px 22px;margin-bottom:14px">'
      +'<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
      +'<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">📊 Capacity Planner</h2>'
      +'<div style="font-size:12px;color:#6b7280;margin-top:2px">Demand vs capacity per week — can we hit our scheduled install dates?</div></div>'
      +'<div style="margin-left:auto;display:flex;align-items:center;gap:6px">'
      +'<button onclick="setState({capPlanOffset:(getState().capPlanOffset||0)-'+weekCount+'})" class="btn-w" style="padding:6px 12px;font-size:12px">← Prev '+weekCount+'w</button>'
      +'<button onclick="setState({capPlanOffset:0,capPlanExpandedWeek:null})" class="btn-'+(startOffset===0?'r':'w')+'" style="padding:6px 14px;font-size:12px;font-weight:700">Reset</button>'
      +'<button onclick="setState({capPlanOffset:(getState().capPlanOffset||0)+'+weekCount+'})" class="btn-w" style="padding:6px 12px;font-size:12px">Next '+weekCount+'w →</button>'
      +'<select class="sel" style="font-size:12px;padding:6px 10px" onchange="setState({capPlanWeeks:+this.value,capPlanExpandedWeek:null})">'
      +[4,8,12,16].map(function(n){return '<option value="'+n+'"'+(weekCount===n?' selected':'')+'>'+n+' weeks</option>';}).join('')
      +'</select>'
      +'</div></div></div>';

    // ── Summary tiles (overall picture) ──────────────────────────────────────
    var totalDemand = weeks.reduce(function(s,w){return s+w.demand;}, 0);
    var totalCapacity = weeks.reduce(function(s,w){return s+w.capacity;}, 0);
    var overallUtil = totalCapacity > 0 ? totalDemand/totalCapacity : 0;
    var overloadedWeeks = weeks.filter(function(w){return w.util > 1.0;}).length;
    var tightWeeks = weeks.filter(function(w){return w.util > 0.80 && w.util <= 1.0;}).length;
    var bandOverall = utilisationBand(overallUtil);

    var tiles = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">'
      +'<div class="card" style="padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Window Demand</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px">'+fmtHM(totalDemand)+'</div><div style="font-size:10px;color:#9ca3af;margin-top:2px">across '+weekCount+' weeks · '+weeks.reduce(function(s,w){return s+w.jobs.length;},0)+' jobs</div></div>'
      +'<div class="card" style="padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Window Capacity</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px">'+fmtHM(totalCapacity)+'</div><div style="font-size:10px;color:#9ca3af;margin-top:2px">'+installers.length+' active installer'+(installers.length!==1?'s':'')+' · productivity-adj.</div></div>'
      +'<div class="card" style="padding:14px 18px;border:1px solid '+bandOverall.col+'33;background:'+bandOverall.bg+'"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Overall Utilisation</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px;color:'+bandOverall.col+'">'+Math.round(overallUtil*100)+'%</div><div style="font-size:10px;color:'+bandOverall.col+';margin-top:2px;font-weight:600">'+bandOverall.label+'</div></div>'
      +'<div class="card" style="padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Hot Weeks</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px"><span style="color:#7f1d1d">'+overloadedWeeks+'</span> <span style="color:#9ca3af;font-size:14px">over</span> · <span style="color:#d97706">'+tightWeeks+'</span> <span style="color:#9ca3af;font-size:14px">tight</span></div><div style="font-size:10px;color:#9ca3af;margin-top:2px">>100% / 80–100%</div></div>'
      +'</div>';

    // ── Bars per week ────────────────────────────────────────────────────────
    var bars = '<div class="card" style="padding:18px 22px">';
    bars += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="font-family:Syne,sans-serif;font-size:15px;font-weight:800;margin:0">Weekly Utilisation</h3>'
      +'<div style="display:flex;gap:10px;font-size:11px;color:#6b7280;align-items:center">'
      +'<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#16a34a;border-radius:2px"></span>≤80%</span>'
      +'<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#d97706;border-radius:2px"></span>80–95%</span>'
      +'<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#dc2626;border-radius:2px"></span>95–100%</span>'
      +'<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#7f1d1d;border-radius:2px"></span>>100%</span>'
      +'</div></div>';

    if (installers.length === 0) {
      bars += '<div style="padding:30px;text-align:center;color:#92400e;font-size:13px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">⚠️ No active installers in this branch — capacity is zero. Add installers in Settings.</div>';
    }

    weeks.forEach(function(wk){
      var band = utilisationBand(wk.util);
      var fillPct = Math.min(100, Math.round(wk.util*100));
      var overflowPct = wk.util > 1 ? Math.min(100, Math.round((wk.util-1)*100)) : 0;
      var label = fmtShortDate(wk.dates[0]) + ' – ' + fmtShortDate(wk.dates[6]);
      var isExpanded = expandedWeek === wk.offset;
      var todayInWeek = wk.dates.some(function(d){return isToday(d);});

      bars += '<div style="border-top:1px solid #f3f4f6;padding:10px 0">'
        +'<div onclick="setState({capPlanExpandedWeek:'+(isExpanded?'null':wk.offset)+'})" style="cursor:pointer;display:flex;align-items:center;gap:14px">'
        +'<div style="min-width:160px;font-size:12px;font-weight:'+(todayInWeek?'700':'600')+';color:'+(todayInWeek?'#c41230':'#374151')+'">'+(todayInWeek?'👉 ':'')+label+'</div>'
        +'<div style="flex:1;min-width:200px"><div style="height:18px;background:#f3f4f6;border-radius:9px;overflow:hidden;position:relative">'
        +'<div style="height:100%;background:'+band.col+';width:'+fillPct+'%;border-radius:9px 0 0 9px;transition:width .2s"></div>'
        +(overflowPct>0?'<div style="position:absolute;top:0;right:0;height:100%;width:'+overflowPct+'%;background:repeating-linear-gradient(45deg,#7f1d1d,#7f1d1d 4px,#a31515 4px,#a31515 8px);border-radius:0 9px 9px 0"></div>':'')
        +'</div></div>'
        +'<div style="min-width:80px;text-align:right;font-size:13px;font-weight:700;color:'+band.col+'">'+Math.round(wk.util*100)+'%</div>'
        +'<div style="min-width:140px;font-size:11px;color:#6b7280;text-align:right">'+fmtHM(wk.demand)+' / '+fmtHM(wk.capacity)+'</div>'
        +'<div style="min-width:60px;text-align:right;font-size:11px;color:#9ca3af">'+wk.jobs.length+' job'+(wk.jobs.length!==1?'s':'')+'</div>'
        +'<div style="min-width:18px;text-align:right;color:#9ca3af;font-size:12px">'+(isExpanded?'▾':'▸')+'</div>'
        +'</div>';

      // Expanded: stacked breakdown by job
      if (isExpanded) {
        bars += '<div style="margin-top:10px;padding:12px;background:'+band.bg+';border-radius:8px;border:1px solid '+band.col+'33">';
        if (wk.jobs.length === 0) {
          bars += '<div style="font-size:12px;color:#6b7280;font-style:italic">No jobs scheduled this week.</div>';
        } else {
          // Build stacked bar: each segment = one job's minutes
          var segCol = ['#3b82f6','#a855f7','#ec4899','#06b6d4','#10b981','#f59e0b','#6366f1','#ef4444'];
          bars += '<div style="height:24px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;display:flex;margin-bottom:10px">';
          var sumSoFar = 0;
          wk.jobs.forEach(function(j, idx){
            var m = readJobInstallMinutes(j) || 0;
            if (m <= 0) return;
            var pctOfCap = wk.capacity > 0 ? (m / wk.capacity * 100) : 0;
            var c = contacts.find(function(ct){return ct.id===j.contactId;});
            var cn = c ? c.fn+' '+c.ln : '—';
            var col = segCol[idx % segCol.length];
            bars += '<div title="'+(j.jobNumber||j.id)+' · '+cn+' · '+fmtHM(m)+'" style="background:'+col+';width:'+pctOfCap+'%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600;overflow:hidden;white-space:nowrap;cursor:pointer" onclick="event.stopPropagation();setState({page:\'jobs\',jobDetailId:\''+j.id+'\'})">'+(pctOfCap>6?(j.jobNumber||''):'')+'</div>';
            sumSoFar += m;
          });
          if (wk.capacity > sumSoFar) {
            var headroomPct = (wk.capacity - sumSoFar) / wk.capacity * 100;
            bars += '<div style="background:#f3f4f6;flex:1" title="Headroom · '+fmtHM(wk.capacity-sumSoFar)+'"></div>';
          }
          bars += '</div>';

          // Job table
          bars += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
            +'<th class="th" style="text-align:left">Job</th>'
            +'<th class="th" style="text-align:left">Customer</th>'
            +'<th class="th" style="text-align:left">Date</th>'
            +'<th class="th" style="text-align:left">Crew</th>'
            +'<th class="th" style="text-align:right">Baseline</th>'
            +'<th class="th" style="text-align:right">Effective</th>'
            +'</tr></thead><tbody>';
          wk.jobs.slice().sort(function(a,b){ return (a.installDate||'').localeCompare(b.installDate||''); }).forEach(function(j, idx){
            var c = contacts.find(function(ct){return ct.id===j.contactId;});
            var cn = c ? c.fn+' '+c.ln : '—';
            var base = readJobInstallMinutes(j) || 0;
            var crewIds = j.installCrew || [];
            var effective = (typeof crewEffectiveMinutes === 'function' && crewIds.length>0) ? crewEffectiveMinutes(crewIds, base) : base;
            var col = segCol[idx % segCol.length];
            bars += '<tr style="border-top:1px solid #fff">'
              +'<td class="td"><span style="display:inline-block;width:8px;height:8px;background:'+col+';border-radius:2px;margin-right:6px"></span><a href="#" onclick="event.preventDefault();setState({page:\'jobs\',jobDetailId:\''+j.id+'\'})" style="color:#3b82f6;font-weight:600">'+(j.jobNumber||j.id)+'</a></td>'
              +'<td class="td">'+cn+'</td>'
              +'<td class="td">'+(j.installDate||'—')+(j.installTime?' '+j.installTime:'')+'</td>'
              +'<td class="td">'+(crewIds.length===0?'<span style="color:#9ca3af">unassigned</span>':crewIds.length+' assigned')+'</td>'
              +'<td class="td" style="text-align:right">'+fmtHM(base)+'</td>'
              +'<td class="td" style="text-align:right;font-weight:600">'+fmtHM(effective)+(effective!==base?' <span style="color:#9ca3af;font-size:10px">('+(effective>base?'+':'')+(effective-base)+'m)</span>':'')+'</td>'
              +'</tr>';
          });
          bars += '</tbody></table>';

          // Overload suggestion
          if (wk.util > 1.0) {
            var over = wk.demand - wk.capacity;
            bars += '<div style="margin-top:10px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:12px;color:#7f1d1d">⚠️ <strong>Over capacity by '+fmtHM(over)+'.</strong> Consider moving the latest-scheduled or lowest-priority job to a week with headroom.</div>';
          } else if (wk.util > 0.95) {
            bars += '<div style="margin-top:10px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e">⚠️ <strong>Tight week — '+Math.round(wk.util*100)+'% utilised.</strong> No room for unplanned work or sick days.</div>';
          }
        }
        bars += '</div>';
      }
      bars += '</div>';
    });
    bars += '</div>';

    return header + tiles + bars;
  }

  window.renderCapacityPlanner = renderCapacityPlanner;
})();
