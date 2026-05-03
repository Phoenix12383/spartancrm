// ============================================================================
// 31-fleet-page.js — Fleet & Delivery (Phoenix's spec §7 + §8)
// ----------------------------------------------------------------------------
// Dispatcher's overview answering: "Do we have enough trucks this week, and
// which truck should each job use?" Pairs scheduled jobs with their
// recommended vehicle (via Slice 5 helpers in 17-install-schedule.js),
// surfaces conflicts when one vehicle is recommended for two jobs same day,
// and flags jobs that don't fit any vehicle.
// ============================================================================

(function(){
  'use strict';

  // ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────
  // Pilot for the inline-handler retirement. Each action is registered once at
  // module-load time; the body-level listener in 07-shared-ui dispatches click
  // / change events here based on data-action / data-on-change attributes.
  defineAction('fleet-week-prev', function(target) {
    var step = +(target.dataset.step || 0);
    setState({ fleetPlanOffset: (getState().fleetPlanOffset || 0) - step });
  });
  defineAction('fleet-week-next', function(target) {
    var step = +(target.dataset.step || 0);
    setState({ fleetPlanOffset: (getState().fleetPlanOffset || 0) + step });
  });
  defineAction('fleet-week-reset', function() {
    setState({ fleetPlanOffset: 0, fleetExpandedWeek: 0 });
  });
  defineAction('fleet-set-weeks', function(target) {
    setState({ fleetPlanWeeks: +target.value, fleetExpandedWeek: null });
  });
  defineAction('fleet-toggle-week', function(target) {
    var offset = +target.dataset.weekOffset;
    var current = getState().fleetExpandedWeek;
    setState({ fleetExpandedWeek: current === offset ? null : offset });
  });
  defineAction('fleet-nav-job-detail', function(target, ev) {
    ev.preventDefault();
    setState({ page: 'jobs', jobDetailId: target.dataset.jobId });
  });

  // Was a local "Xh YYm" formatter; now delegates to the canonical contract
  // helper (modules/17b-cad-timing-contract.js, spec §5.2). Display tightens
  // slightly: "0h 30m"→"30m", "1h 00m"→"1h", "1h 05m"→"1h 5m". Falls back to
  // the original padded format if the contract didn't load.
  function fmtHM(min) {
    if (typeof formatMinutesAsHours === 'function') return formatMinutesAsHours(min);
    var h = Math.floor(min/60), m = min % 60;
    return h + 'h ' + (m<10?'0'+m:m) + 'm';
  }

  function renderFleetPage() {
    var jobs = (getState().jobs || []);
    var contacts = getState().contacts || [];
    var branch = getState().branch || 'all';
    if (branch !== 'all') jobs = jobs.filter(function(j){ return j.branch === branch; });
    var vehicles = (typeof getVehicles === 'function' ? getVehicles() : []).filter(function(v){return v.active!==false;});

    var weekCount = +(getState().fleetPlanWeeks) || 4;
    var startOffset = +(getState().fleetPlanOffset) || 0;
    var expandedWeek = getState().fleetExpandedWeek;
    if (expandedWeek === undefined) expandedWeek = startOffset; // default: show current week expanded

    var weeks = [];
    for (var w = 0; w < weekCount; w++) {
      var dates = getWeekDates(startOffset + w);
      var ws = isoDate(dates[0]);
      var we = isoDate(dates[6]);
      var weekJobs = jobs.filter(function(j){ return j.installDate && j.installDate >= ws && j.installDate <= we; })
                         .sort(function(a,b){
                           var d = (a.installDate||'').localeCompare(b.installDate||'');
                           if (d !== 0) return d;
                           return (a.installTime||'').localeCompare(b.installTime||'');
                         });
      // Map each job to its recommendation. Cache results so we don't
      // recompute when rendering both summary tiles and the table.
      var rows = weekJobs.map(function(j){
        var rec = (typeof recommendVehicleForJob === 'function') ? recommendVehicleForJob(j) : { recommended: null, evaluated: [], frames: [] };
        return { job: j, rec: rec };
      });
      // Detect conflicts: same vehicle recommended for 2+ jobs on same date.
      var conflictKey = {};
      rows.forEach(function(r){
        if (!r.rec.recommended) return;
        var key = r.job.installDate + '|' + r.rec.recommended.id;
        conflictKey[key] = (conflictKey[key] || 0) + 1;
      });
      rows.forEach(function(r){
        if (!r.rec.recommended) return;
        var key = r.job.installDate + '|' + r.rec.recommended.id;
        r.conflict = conflictKey[key] > 1;
      });
      // Tag each row's status. Distinguish "no CAD survey on file" from
      // "vehicles in fleet don't fit the surveyed frames" — they look the same
      // on the surface but mean very different things to the dispatcher.
      // 'split' means no single truck fits but a multi-vehicle split is viable.
      rows.forEach(function(r){
        var hasFrames = r.rec.frames && r.rec.frames.length > 0;
        if (!hasFrames) r.statusKind = 'not_surveyed';
        else if (!r.rec.recommended && r.rec.split && r.rec.split.ok) r.statusKind = 'split';
        else if (!r.rec.recommended) r.statusKind = 'no_fit';
        else if (r.conflict) r.statusKind = 'conflict';
        else if (r.rec.fit && r.rec.fit.borderline) r.statusKind = 'tight';
        else r.statusKind = 'ok';
      });
      var noFit  = rows.filter(function(r){ return r.statusKind === 'no_fit'; }).length;
      var notSurveyed = rows.filter(function(r){ return r.statusKind === 'not_surveyed'; }).length;
      var conflicts = rows.filter(function(r){ return r.statusKind === 'conflict'; }).length;
      weeks.push({offset: startOffset + w, dates:dates, weekStart:ws, weekEnd:we, rows:rows, noFit:noFit, notSurveyed:notSurveyed, conflicts:conflicts});
    }

    // ── Header / window nav ──────────────────────────────────────────────────
    var header = '<div class="card" style="padding:18px 22px;margin-bottom:14px">'
      +'<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
      +'<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">🚚 Fleet & Delivery</h2>'
      +'<div style="font-size:12px;color:#6b7280;margin-top:2px">Recommended vehicle per scheduled job — flags conflicts and won\'t-fit cases.</div></div>'
      +'<div style="margin-left:auto;display:flex;align-items:center;gap:6px">'
      +'<button data-action="fleet-week-prev" data-step="'+weekCount+'" class="btn-w" style="padding:6px 12px;font-size:12px">← Prev '+weekCount+'w</button>'
      +'<button data-action="fleet-week-reset" class="btn-'+(startOffset===0?'r':'w')+'" style="padding:6px 14px;font-size:12px;font-weight:700">Reset</button>'
      +'<button data-action="fleet-week-next" data-step="'+weekCount+'" class="btn-w" style="padding:6px 12px;font-size:12px">Next '+weekCount+'w →</button>'
      +'<select class="sel" style="font-size:12px;padding:6px 10px" data-on-change="fleet-set-weeks">'
      +[2,4,8,12].map(function(n){return '<option value="'+n+'"'+(weekCount===n?' selected':'')+'>'+n+' weeks</option>';}).join('')
      +'</select>'
      +'</div></div></div>';

    // ── Summary tiles ────────────────────────────────────────────────────────
    var totalJobs = weeks.reduce(function(s,w){return s+w.rows.length;}, 0);
    var totalNoFit = weeks.reduce(function(s,w){return s+w.noFit;}, 0);
    var totalNotSurveyed = weeks.reduce(function(s,w){return s+w.notSurveyed;}, 0);
    var totalConflicts = weeks.reduce(function(s,w){return s+w.conflicts;}, 0);

    var tiles = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">'
      +'<div class="card" style="padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Active Fleet</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px">'+vehicles.length+'</div><div style="font-size:10px;color:#9ca3af;margin-top:2px">vehicle'+(vehicles.length!==1?'s':'')+' available</div></div>'
      +'<div class="card" style="padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Scheduled Jobs</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px">'+totalJobs+'</div><div style="font-size:10px;color:#9ca3af;margin-top:2px">across '+weekCount+' week'+(weekCount!==1?'s':'')+(totalNotSurveyed>0?' · '+totalNotSurveyed+' not surveyed':'')+'</div></div>'
      +'<div class="card" style="padding:14px 18px;border:1px solid '+(totalConflicts>0?'#dc2626':'#e5e7eb')+'33;background:'+(totalConflicts>0?'#fef2f2':'#fff')+'"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Vehicle Conflicts</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px;color:'+(totalConflicts>0?'#dc2626':'#374151')+'">'+totalConflicts+'</div><div style="font-size:10px;color:'+(totalConflicts>0?'#dc2626':'#9ca3af')+';margin-top:2px;font-weight:'+(totalConflicts>0?'600':'400')+'">'+(totalConflicts>0?'same truck recommended twice':'no double-booked trucks')+'</div></div>'
      +'<div class="card" style="padding:14px 18px;border:1px solid '+(totalNoFit>0?'#7f1d1d':'#e5e7eb')+'33;background:'+(totalNoFit>0?'#fef2f2':'#fff')+'"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Won\'t Fit</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px;color:'+(totalNoFit>0?'#7f1d1d':'#374151')+'">'+totalNoFit+'</div><div style="font-size:10px;color:'+(totalNoFit>0?'#7f1d1d':'#9ca3af')+';margin-top:2px;font-weight:'+(totalNoFit>0?'600':'400')+'">'+(totalNoFit>0?'surveyed jobs with no vehicle fit':'every surveyed job has a fit')+'</div></div>'
      +'</div>';

    // ── No vehicles state ────────────────────────────────────────────────────
    if (vehicles.length === 0) {
      var emptyMsg = '<div class="card" style="padding:30px;text-align:center;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:13px">⚠️ No active vehicles in fleet — add one in Settings → Vehicles before this page becomes useful.</div>';
      return header + tiles + emptyMsg;
    }

    // ── Per-week sections ────────────────────────────────────────────────────
    var weekHtml = '<div class="card" style="padding:18px 22px">';
    weekHtml += '<div style="display:flex;align-items:baseline;justify-content:space-between;margin:0 0 14px">'
      +'<h3 style="font-family:Syne,sans-serif;font-size:15px;font-weight:800;margin:0">Weekly Plan</h3>'
      +'<span style="font-size:11px;color:#9ca3af">click a week to expand</span>'
      +'</div>';

    weeks.forEach(function(wk, wIdx){
      var isExpanded = expandedWeek === wk.offset;
      var todayInWeek = wk.dates.some(function(d){return isToday(d);});
      var label = fmtShortDate(wk.dates[0]) + ' – ' + fmtShortDate(wk.dates[6]);

      // Week-level status pill (right side of header).
      var pillBg = '#f0fdf4', pillBorder = '#bbf7d0', pillFg = '#15803d', pillText = 'All clear';
      if (wk.noFit > 0) { pillBg = '#fef2f2'; pillBorder = '#fecaca'; pillFg = '#7f1d1d'; pillText = wk.noFit + ' won\'t fit'; }
      else if (wk.conflicts > 0) { pillBg = '#fef2f2'; pillBorder = '#fecaca'; pillFg = '#dc2626'; pillText = wk.conflicts + ' conflict' + (wk.conflicts!==1?'s':''); }
      else if (wk.rows.length === 0) { pillBg = '#f9fafb'; pillBorder = '#e5e7eb'; pillFg = '#9ca3af'; pillText = 'No jobs'; }
      else if (wk.notSurveyed > 0 && wk.notSurveyed === wk.rows.length) { pillBg = '#f9fafb'; pillBorder = '#e5e7eb'; pillFg = '#6b7280'; pillText = wk.notSurveyed + ' not surveyed'; }
      else if (wk.notSurveyed > 0) { pillText = 'All clear · ' + wk.notSurveyed + ' not surveyed'; }

      var rowBgHover = todayInWeek ? '#fff7f7' : '#fafafa';
      var leftBar = todayInWeek ? '3px solid #c41230' : '3px solid transparent';

      weekHtml += '<div style="border-top:1px solid #f3f4f6">'
        +'<div data-action="fleet-toggle-week" data-week-offset="'+wk.offset+'" '
        +'onmouseover="this.style.background=\''+rowBgHover+'\'" onmouseout="this.style.background=\'transparent\'" '
        +'style="cursor:pointer;display:flex;align-items:center;gap:14px;padding:14px 12px;border-left:'+leftBar+';transition:background 0.12s">'
        +'<div style="color:#9ca3af;font-size:11px;width:14px">'+(isExpanded?'▾':'▸')+'</div>'
        +'<div style="min-width:170px;font-size:13px;font-weight:'+(todayInWeek?'700':'600')+';color:'+(todayInWeek?'#c41230':'#111827')+'">'+(todayInWeek?'This week · ':'')+label+'</div>'
        +'<div style="flex:1;font-size:12px;color:#6b7280">'+wk.rows.length+' job'+(wk.rows.length!==1?'s':'')+'</div>'
        +'<span style="display:inline-flex;align-items:center;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;background:'+pillBg+';border:1px solid '+pillBorder+';color:'+pillFg+'">'+pillText+'</span>'
        +'</div>';

      if (isExpanded) {
        if (wk.rows.length === 0) {
          weekHtml += '<div style="margin:0 12px 14px;padding:18px;background:#f9fafb;border:1px dashed #e5e7eb;border-radius:8px;font-size:12px;color:#9ca3af;text-align:center">No jobs scheduled this week.</div>';
        } else {
          // Group rows by date for a cleaner per-day view.
          var byDate = {};
          wk.rows.forEach(function(r){ if(!byDate[r.job.installDate]) byDate[r.job.installDate]=[]; byDate[r.job.installDate].push(r); });

          weekHtml += '<div style="margin:0 12px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">';
          weekHtml += '<table style="width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed">'
            +'<colgroup>'
            +'<col style="width:14%"><col style="width:24%"><col style="width:9%"><col style="width:9%"><col style="width:26%"><col style="width:18%">'
            +'</colgroup>'
            +'<thead><tr style="background:#fafafa;border-bottom:1px solid #e5e7eb">'
            +'<th style="text-align:left;padding:9px 14px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Job</th>'
            +'<th style="text-align:left;padding:9px 14px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Customer</th>'
            +'<th style="text-align:left;padding:9px 14px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Time</th>'
            +'<th style="text-align:left;padding:9px 14px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Frames</th>'
            +'<th style="text-align:left;padding:9px 14px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Recommended Vehicle</th>'
            +'<th style="text-align:left;padding:9px 14px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Status</th>'
            +'</tr></thead><tbody>';

          Object.keys(byDate).sort().forEach(function(ds, dIdx){
            var dayRows = byDate[ds];
            var d = new Date(ds + 'T12:00:00');
            var dayLabel = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
            var dateLabel = d.getDate() + '/' + (d.getMonth()+1);
            var isDayToday = isToday(d);
            // Vehicles tied up this day (recommended).
            var vehicleSet = {};
            dayRows.forEach(function(r){ if (r.rec.recommended) vehicleSet[r.rec.recommended.id] = r.rec.recommended; });
            var vehiclesUsed = Object.keys(vehicleSet).length;
            var dayConflicts = dayRows.filter(function(r){return r.statusKind==='conflict';}).length;

            // Day separator row spanning the table.
            weekHtml += '<tr><td colspan="6" style="padding:0">'
              +'<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:'+(isDayToday?'#fff7f7':'#f9fafb')+';border-top:'+(dIdx>0?'1px solid #e5e7eb':'none')+';border-bottom:1px solid #f3f4f6">'
              +'<span style="font-size:11px;font-weight:800;color:'+(isDayToday?'#c41230':'#374151')+';text-transform:uppercase;letter-spacing:0.06em">'+(isDayToday?'Today · ':'')+dayLabel+'</span>'
              +'<span style="font-size:11px;color:#9ca3af">'+dateLabel+'</span>'
              +'<span style="margin-left:auto;font-size:10.5px;color:#6b7280">'
              +dayRows.length+' job'+(dayRows.length!==1?'s':'')+' · '+vehiclesUsed+' vehicle'+(vehiclesUsed!==1?'s':'')
              +(dayConflicts>0 ? ' · <span style="color:#dc2626;font-weight:700">'+dayConflicts+' conflict'+(dayConflicts!==1?'s':'')+'</span>' : '')
              +'</span>'
              +'</div>'
              +'</td></tr>';

            dayRows.forEach(function(r){
              var j = r.job;
              var c = contacts.find(function(ct){return ct.id===j.contactId;});
              var cn = c ? (c.fn+' '+c.ln) : '—';
              var frames = r.rec.frames ? r.rec.frames.length : 0;
              var v = r.rec.recommended;
              // Status badge (pill) + accent stripe.
              var badgeBg, badgeBorder, badgeFg, badgeText, accent, vehicleCell;
              if (r.statusKind === 'not_surveyed') {
                badgeBg='#f3f4f6'; badgeBorder='#e5e7eb'; badgeFg='#6b7280'; badgeText='Not surveyed'; accent='transparent';
                vehicleCell = '<span style="color:#9ca3af;font-style:italic">awaiting CAD survey</span>';
              } else if (r.statusKind === 'split') {
                var n = r.rec.split.plan.length;
                badgeBg='#fffbeb'; badgeBorder='#fde68a'; badgeFg='#92400e'; badgeText='Split · '+n+' vehicles'; accent='#f59e0b';
                vehicleCell = '<span style="color:#92400e;font-weight:600">'+r.rec.split.plan.map(function(s){return s.vehicle.name;}).join(' + ')+'</span>';
              } else if (r.statusKind === 'no_fit') {
                badgeBg='#fef2f2'; badgeBorder='#fecaca'; badgeFg='#7f1d1d'; badgeText='No fit'; accent='#7f1d1d';
                vehicleCell = '<span style="color:#7f1d1d;font-style:italic">none fits</span>';
              } else if (r.statusKind === 'conflict') {
                badgeBg='#fef2f2'; badgeBorder='#fecaca'; badgeFg='#dc2626'; badgeText='Conflict'; accent='#dc2626';
                vehicleCell = '<span style="display:inline-flex;align-items:center;gap:6px"><span style="font-weight:700;color:#111827">'+v.name+'</span>'+(v.rego?'<span style="font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#6b7280;background:#f3f4f6;padding:1px 6px;border-radius:4px">'+v.rego+'</span>':'')+'</span>';
              } else if (r.statusKind === 'tight') {
                badgeBg='#fffbeb'; badgeBorder='#fde68a'; badgeFg='#b45309'; badgeText='Tight fit'; accent='#f59e0b';
                vehicleCell = '<span style="display:inline-flex;align-items:center;gap:6px"><span style="font-weight:700;color:#111827">'+v.name+'</span>'+(v.rego?'<span style="font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#6b7280;background:#f3f4f6;padding:1px 6px;border-radius:4px">'+v.rego+'</span>':'')+'</span>';
              } else {
                badgeBg='#f0fdf4'; badgeBorder='#bbf7d0'; badgeFg='#15803d'; badgeText='OK'; accent='transparent';
                vehicleCell = '<span style="display:inline-flex;align-items:center;gap:6px"><span style="font-weight:700;color:#111827">'+v.name+'</span>'+(v.rego?'<span style="font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#6b7280;background:#f3f4f6;padding:1px 6px;border-radius:4px">'+v.rego+'</span>':'')+'</span>';
              }
              weekHtml += '<tr style="border-top:1px solid #f3f4f6">'
                +'<td style="padding:10px 14px;border-left:3px solid '+accent+'"><a href="#" data-action="fleet-nav-job-detail" data-job-id="'+j.id+'" style="color:#2563eb;font-weight:700;text-decoration:none">'+(j.jobNumber||j.id)+'</a></td>'
                +'<td style="padding:10px 14px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cn+'</td>'
                +'<td style="padding:10px 14px;color:'+(j.installTime?'#374151':'#9ca3af')+';font-variant-numeric:tabular-nums">'+(j.installTime||'—')+'</td>'
                +'<td style="padding:10px 14px;color:#374151;font-variant-numeric:tabular-nums">'+frames+'</td>'
                +'<td style="padding:10px 14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+vehicleCell+'</td>'
                +'<td style="padding:10px 14px"><span style="display:inline-flex;align-items:center;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:'+badgeBg+';border:1px solid '+badgeBorder+';color:'+badgeFg+'">'+badgeText+'</span></td>'
                +'</tr>';
            });
          });
          weekHtml += '</tbody></table></div>';
        }
      }
      weekHtml += '</div>';
    });
    weekHtml += '</div>';

    return header + tiles + weekHtml;
  }

  window.renderFleetPage = renderFleetPage;
})();
