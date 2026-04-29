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

  function fmtHM(min) { var h = Math.floor(min/60); var m = min % 60; return h + 'h ' + (m<10?'0'+m:m) + 'm'; }

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
      +'<button onclick="setState({fleetPlanOffset:(getState().fleetPlanOffset||0)-'+weekCount+'})" class="btn-w" style="padding:6px 12px;font-size:12px">← Prev '+weekCount+'w</button>'
      +'<button onclick="setState({fleetPlanOffset:0,fleetExpandedWeek:0})" class="btn-'+(startOffset===0?'r':'w')+'" style="padding:6px 14px;font-size:12px;font-weight:700">Reset</button>'
      +'<button onclick="setState({fleetPlanOffset:(getState().fleetPlanOffset||0)+'+weekCount+'})" class="btn-w" style="padding:6px 12px;font-size:12px">Next '+weekCount+'w →</button>'
      +'<select class="sel" style="font-size:12px;padding:6px 10px" onchange="setState({fleetPlanWeeks:+this.value,fleetExpandedWeek:null})">'
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
    weekHtml += '<h3 style="font-family:Syne,sans-serif;font-size:15px;font-weight:800;margin:0 0 12px">Weekly Plan</h3>';

    weeks.forEach(function(wk){
      var isExpanded = expandedWeek === wk.offset;
      var todayInWeek = wk.dates.some(function(d){return isToday(d);});
      var label = fmtShortDate(wk.dates[0]) + ' – ' + fmtShortDate(wk.dates[6]);
      var statusCol = '#16a34a';
      var statusText = 'All clear';
      if (wk.noFit > 0) { statusCol = '#7f1d1d'; statusText = wk.noFit + ' won\'t fit'; }
      else if (wk.conflicts > 0) { statusCol = '#dc2626'; statusText = wk.conflicts + ' conflict' + (wk.conflicts!==1?'s':''); }
      else if (wk.notSurveyed > 0 && wk.notSurveyed === wk.rows.length) { statusCol = '#9ca3af'; statusText = wk.notSurveyed + ' not surveyed'; }
      else if (wk.notSurveyed > 0) { statusCol = '#16a34a'; statusText = 'All clear · ' + wk.notSurveyed + ' not surveyed'; }
      else if (wk.rows.length === 0) { statusCol = '#9ca3af'; statusText = 'No jobs'; }

      weekHtml += '<div style="border-top:1px solid #f3f4f6;padding:10px 0">'
        +'<div onclick="setState({fleetExpandedWeek:'+(isExpanded?'null':wk.offset)+'})" style="cursor:pointer;display:flex;align-items:center;gap:14px">'
        +'<div style="min-width:160px;font-size:12px;font-weight:'+(todayInWeek?'700':'600')+';color:'+(todayInWeek?'#c41230':'#374151')+'">'+(todayInWeek?'👉 ':'')+label+'</div>'
        +'<div style="flex:1;font-size:11px;color:#6b7280">'+wk.rows.length+' job'+(wk.rows.length!==1?'s':'')+'</div>'
        +'<div style="min-width:140px;text-align:right;font-size:12px;font-weight:700;color:'+statusCol+'">'+statusText+'</div>'
        +'<div style="min-width:18px;text-align:right;color:#9ca3af;font-size:12px">'+(isExpanded?'▾':'▸')+'</div>'
        +'</div>';

      if (isExpanded) {
        if (wk.rows.length === 0) {
          weekHtml += '<div style="margin-top:10px;padding:14px;background:#f9fafb;border-radius:6px;font-size:12px;color:#9ca3af;font-style:italic">No jobs scheduled this week.</div>';
        } else {
          // Group rows by date for a cleaner per-day view.
          var byDate = {};
          wk.rows.forEach(function(r){ if(!byDate[r.job.installDate]) byDate[r.job.installDate]=[]; byDate[r.job.installDate].push(r); });
          weekHtml += '<div style="margin-top:10px;padding:12px;background:#f9fafb;border-radius:6px">';
          Object.keys(byDate).sort().forEach(function(ds){
            var dayRows = byDate[ds];
            var d = new Date(ds + 'T12:00:00');
            var dayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth()+1);
            // Vehicles tied up this day (recommended).
            var vehicleSet = {};
            dayRows.forEach(function(r){ if (r.rec.recommended) vehicleSet[r.rec.recommended.id] = r.rec.recommended; });
            var vehiclesUsed = Object.keys(vehicleSet).length;
            weekHtml += '<div style="margin-bottom:10px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span style="font-size:12px;font-weight:700;color:#374151">'+dayLabel+'</span><span style="font-size:10px;color:#9ca3af">'+dayRows.length+' job'+(dayRows.length!==1?'s':'')+' · '+vehiclesUsed+' vehicle'+(vehiclesUsed!==1?'s':'')+'</span></div>';
            weekHtml += '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:6px;overflow:hidden">'
              +'<thead><tr><th class="th" style="text-align:left;padding:6px 10px">Job</th><th class="th" style="text-align:left">Customer</th><th class="th" style="text-align:left">Time</th><th class="th" style="text-align:left">Frames</th><th class="th" style="text-align:left">Recommended Vehicle</th><th class="th" style="text-align:left">Status</th></tr></thead><tbody>';
            dayRows.forEach(function(r){
              var j = r.job;
              var c = contacts.find(function(ct){return ct.id===j.contactId;});
              var cn = c ? (c.fn+' '+c.ln) : '—';
              var frames = r.rec.frames ? r.rec.frames.length : 0;
              var v = r.rec.recommended;
              var statusLabel, statusCol2, rowBg, vehicleCell;
              if (r.statusKind === 'not_surveyed') {
                statusLabel = '— Not Surveyed'; statusCol2 = '#9ca3af'; rowBg = '#fff';
                vehicleCell = '<span style="color:#9ca3af;font-style:italic">awaiting CAD survey</span>';
              } else if (r.statusKind === 'split') {
                var n = r.rec.split.plan.length;
                statusLabel = '↗ Split ('+n+' vehicles)'; statusCol2 = '#92400e'; rowBg = '#fffbeb';
                vehicleCell = '<span style="color:#92400e;font-weight:600">'+r.rec.split.plan.map(function(s){return s.vehicle.name;}).join(' + ')+'</span>';
              } else if (r.statusKind === 'no_fit') {
                statusLabel = '✕ No fit'; statusCol2 = '#7f1d1d'; rowBg = '#fef2f2';
                vehicleCell = '<span style="color:#7f1d1d;font-style:italic">none fits</span>';
              } else if (r.statusKind === 'conflict') {
                statusLabel = '⚠ Conflict'; statusCol2 = '#dc2626'; rowBg = '#fef2f2';
                vehicleCell = '<strong>'+v.name+'</strong>'+(v.rego?' <span style="font-family:monospace;font-size:10px;color:#6b7280">'+v.rego+'</span>':'');
              } else if (r.statusKind === 'tight') {
                statusLabel = '⚠ Tight'; statusCol2 = '#d97706'; rowBg = '#fff';
                vehicleCell = '<strong>'+v.name+'</strong>'+(v.rego?' <span style="font-family:monospace;font-size:10px;color:#6b7280">'+v.rego+'</span>':'');
              } else {
                statusLabel = '✓ OK'; statusCol2 = '#16a34a'; rowBg = '#fff';
                vehicleCell = '<strong>'+v.name+'</strong>'+(v.rego?' <span style="font-family:monospace;font-size:10px;color:#6b7280">'+v.rego+'</span>':'');
              }
              weekHtml += '<tr style="border-top:1px solid #f3f4f6;background:'+rowBg+'">'
                +'<td class="td" style="padding:6px 10px"><a href="#" onclick="event.preventDefault();setState({page:\'jobs\',jobDetailId:\''+j.id+'\'})" style="color:#3b82f6;font-weight:600;text-decoration:none">'+(j.jobNumber||j.id)+'</a></td>'
                +'<td class="td">'+cn+'</td>'
                +'<td class="td">'+(j.installTime||'—')+'</td>'
                +'<td class="td">'+frames+'</td>'
                +'<td class="td">'+vehicleCell+'</td>'
                +'<td class="td"><span style="color:'+statusCol2+';font-weight:600">'+statusLabel+'</span></td>'
                +'</tr>';
            });
            weekHtml += '</tbody></table></div>';
          });
          weekHtml += '</div>';
        }
      }
      weekHtml += '</div>';
    });
    weekHtml += '</div>';

    return header + tiles + weekHtml;
  }

  window.renderFleetPage = renderFleetPage;
})();
