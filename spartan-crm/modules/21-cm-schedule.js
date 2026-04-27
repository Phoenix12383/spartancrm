// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 21-cm-schedule.js
// Extracted from original index.html lines 14203-14449
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// CM SCHEDULE MAP — Check Measure proximity booking
// ══════════════════════════════════════════════════════════════════════════════
var cmMapDate = new Date().toISOString().slice(0,10);
var cmMapInstaller = 'all';

// (Previous OSM-iframe mount helper removed — this page now uses real Google
//  Maps via mountCMGoogleMap in 14a-google-maps-real.js.)

function renderCMMapPage() {
  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var branch = getState().branch || 'all';
  var installers = getInstallers().filter(function(i){return i.active;});

  if (branch !== 'all') jobs = jobs.filter(function(j){ return j.branch === branch; });

  // CM jobs: status = a_check_measure AND not completed
  var cmJobs = jobs.filter(function(j){ return j.status === 'a_check_measure' && !j.cmCompletedAt; });
  var unbooked = cmJobs.filter(function(j){ return !j.cmBookedDate; });
  var booked = cmJobs.filter(function(j){ return j.cmBookedDate; });
  var bookedToday = booked.filter(function(j){ return j.cmBookedDate === cmMapDate; });
  var bookedFiltered = cmMapInstaller === 'all' ? bookedToday : bookedToday.filter(function(j){ return j.cmAssignedTo === cmMapInstaller; });

  // Map centre + plotting handled by mountCMGoogleMap in 14a-google-maps-real.js.

  // Group unbooked by suburb for proximity clusters
  var subGroups = {};
  unbooked.forEach(function(j){
    var key = (j.suburb||'Unknown').trim();
    if (!subGroups[key]) subGroups[key] = [];
    subGroups[key].push(j);
  });
  var sortedSubs = Object.keys(subGroups).sort(function(a,b){ return subGroups[b].length - subGroups[a].length; });

  // KPI
  var kpi = '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<div class="card" style="flex:1;min-width:120px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Awaiting CM</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+cmJobs.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Unbooked</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#f59e0b;margin-top:2px">'+unbooked.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Booked Today</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:2px">'+bookedToday.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Areas</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+sortedSubs.length+'</div></div>'
    +'</div>';

  // Filters
  var filters = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">'
    +'<input type="date" value="'+cmMapDate+'" oninput="cmMapDate=this.value;renderPage()" class="inp" style="font-size:13px;padding:7px 10px">'
    +'<select onchange="cmMapInstaller=this.value;renderPage()" class="sel" style="font-size:13px;padding:7px 10px">'
    +'<option value="all">All Installers</option>'
    +installers.map(function(inst){ return '<option value="'+inst.id+'"'+(cmMapInstaller===inst.id?' selected':'')+'>'+inst.name+'</option>'; }).join('')
    +'</select></div>';

  // ── Left: Map + daily schedule ────────────────────────────────────────────
  var left = '<div style="display:flex;flex-direction:column;gap:14px">';
  // Map
  left += '<div class="card" style="overflow:hidden;position:relative">'
    +'<div id="cmMapSlot" style="width:100%;height:400px;background:#f3f4f6"></div>'
    +'<div style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.96);border-radius:10px;padding:10px 14px;box-shadow:0 2px 12px rgba(0,0,0,.15)">'
    +'<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.06em;margin-bottom:6px">Check Measures Today</div>'
    +installers.map(function(inst){
      var cnt = bookedToday.filter(function(j){return j.cmAssignedTo===inst.id;}).length;
      return cnt > 0 ? '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><div style="width:10px;height:10px;border-radius:50%;background:'+inst.colour+'"></div><span style="font-size:11px">'+inst.name.split(' ')[0]+'</span><span style="font-size:10px;color:#9ca3af">'+cnt+' CM'+(cnt!==1?'s':'')+'</span></div>' : '';
    }).join('')
    +'</div></div>';

  // Daily schedule
  left += '<div class="card" style="overflow:hidden">'
    +'<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +'<div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">Daily CM Schedule \u2014 '+new Date(cmMapDate+'T12:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})+'</div>'
    +(bookedFiltered.length>1?'<a href="https://www.google.com/maps/dir/'+bookedFiltered.map(function(j){return encodeURIComponent((j.suburb||'Melbourne')+' Australia');}).join('/')+'" target="_blank" class="btn-r" style="font-size:11px;text-decoration:none;gap:4px">'+Icon({n:'map',size:12})+' Route</a>':'')
    +'</div>';
  if (bookedFiltered.length === 0) {
    left += '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">No check measures booked for this date</div>';
  } else {
    bookedFiltered.sort(function(a,b){return (a.cmBookedTime||'99').localeCompare(b.cmBookedTime||'99');}).forEach(function(j,i){
      var c = contacts.find(function(ct){return ct.id===j.contactId;}); var cn = c?c.fn+' '+c.ln:'\u2014';
      var inst = installers.find(function(x){return x.id===j.cmAssignedTo;});
      left += '<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;'+(i<bookedFiltered.length-1?'border-bottom:1px solid #f9fafb':'')+'" onclick="setState({crmMode:\'jobs\',page:\'jobs\',jobDetailId:\''+j.id+'\'})" style="cursor:pointer" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">'
        +'<div style="min-width:45px;font-size:13px;font-weight:700;color:#374151">'+(j.cmBookedTime?formatTime12(j.cmBookedTime):'\u2014')+'</div>'
        +(inst?'<div style="width:10px;height:10px;border-radius:50%;background:'+inst.colour+';flex-shrink:0"></div>':'')
        +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600">'+(j.jobNumber||'')+' \u2014 '+cn+'</div>'
        +'<div style="font-size:11px;color:#6b7280">\ud83d\udccd '+(j.suburb||'')+(j.street?', '+j.street:'')+'</div></div>'
        +'<span style="background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:600">'+(j.windows||[]).length+' fr</span>'
        +'<a href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent([j.street,j.suburb,j.state].filter(Boolean).join(', ')+' Australia')+'" target="_blank" style="font-size:10px;color:#3b82f6;text-decoration:none" onclick="event.stopPropagation()">Directions</a>'
        +'</div>';
    });
  }
  left += '</div></div>';

  // ── Right: Unbooked + proximity clusters + booking ────────────────────────
  var right = '<div style="display:flex;flex-direction:column;gap:14px">';

  // Smart booking clusters
  right += '<div class="card" style="overflow:hidden">'
    +'<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">'
    +'<div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">\ud83d\udccd Smart Booking by Area <span style="font-weight:400;color:#9ca3af">('+unbooked.length+' unbooked)</span></div>'
    +'<div style="font-size:11px;color:#6b7280;margin-top:2px">Jobs grouped by suburb \u2014 book clusters together for efficient routes</div></div>';

  if (sortedSubs.length === 0) {
    right += '<div style="padding:20px;text-align:center;color:#22c55e;font-size:12px">\u2705 All check measures are booked</div>';
  } else {
    right += '<div style="max-height:500px;overflow-y:auto">';
    sortedSubs.forEach(function(sub){
      var grp = subGroups[sub];
      var grpVal = grp.reduce(function(s,j){return s+(j.val||0);},0);
      var grpFr = grp.reduce(function(s,j){return s+(j.windows||[]).length;},0);
      var oldest = grp.reduce(function(o,j){return !o||j.created<o?j.created:o;},'');
      var age = oldest ? Math.floor((new Date() - new Date(oldest))/86400000) : 0;

      right += '<div style="border-bottom:1px solid #f3f4f6">'
        +'<div style="padding:10px 16px;background:#f9fafb;display:flex;justify-content:space-between;align-items:center">'
        +'<div><span style="font-size:12px;font-weight:700;color:#374151">\ud83d\udccd '+sub+'</span>'
        +'<span style="font-size:10px;color:#6b7280;margin-left:6px">'+grp.length+' job'+(grp.length!==1?'s':'')+' \u00b7 '+grpFr+' frames \u00b7 $'+Math.round(grpVal/1000)+'k</span></div>'
        +(age>14?'<span style="font-size:9px;background:#fef2f2;color:#b91c1c;padding:1px 6px;border-radius:4px;font-weight:600">'+age+'d oldest</span>':'')
        +'</div>';

      grp.forEach(function(j){
        var c = contacts.find(function(ct){return ct.id===j.contactId;});var cn=c?c.fn+' '+c.ln:'\u2014';
        var jobAge = j.created ? Math.floor((new Date()-new Date(j.created))/86400000) : 0;
        right += '<div style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid #fafafa">'
          +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:11px"><span style="font-weight:700;color:#c41230">'+(j.jobNumber||'')+'</span> '+cn+' <span style="color:#9ca3af;font-size:10px">'+jobAge+'d</span></div>'
          +'<div style="font-size:10px;color:#6b7280">'+(j.street||'')+' \u00b7 '+(j.windows||[]).length+' frames \u00b7 $'+Math.round((j.val||0)/1000)+'k</div></div>'
          +'<div style="display:flex;gap:3px;flex-shrink:0">'
          +'<select class="sel" style="font-size:9px;padding:2px 3px;width:70px" id="cmb_inst_'+j.id+'">'
          +'<option value="">Installer</option>'
          +installers.map(function(inst){return '<option value="'+inst.id+'">'+inst.name.split(' ')[0]+'</option>';}).join('')
          +'</select>'
          +'<input type="date" class="inp" style="font-size:9px;padding:2px 3px;width:105px" id="cmb_date_'+j.id+'" value="'+cmMapDate+'">'
          +'<select class="sel" style="font-size:9px;padding:2px 3px;width:55px" id="cmb_time_'+j.id+'">'
          +'<option value="AM">AM</option><option value="PM">PM</option>'
          +['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','13:00','14:00','15:00'].map(function(t){return '<option value="'+t+'">'+formatTime12(t)+'</option>';}).join('')
          +'</select>'
          +'<button onclick="var d=document.getElementById(\'cmb_date_'+j.id+'\').value;var t=document.getElementById(\'cmb_time_'+j.id+'\').value;var inst=document.getElementById(\'cmb_inst_'+j.id+'\').value;if(!d){addToast(\'Pick a date\',\'error\');return;}updateJobField(\''+j.id+'\',\'cmBookedDate\',d);updateJobField(\''+j.id+'\',\'cmBookedTime\',t);if(inst)updateJobField(\''+j.id+'\',\'cmAssignedTo\',inst);addToast(\''+(j.jobNumber||'Job')+' CM booked\',\'success\');renderPage();" class="btn-r" style="font-size:9px;padding:2px 8px;white-space:nowrap">Book</button>'
          +'</div></div>';
      });

      // Batch book button for the cluster
      if (grp.length >= 2) {
        right += '<div style="padding:6px 16px;background:#eff6ff;border-top:1px solid #bfdbfe">'
          +'<button onclick="var inst=prompt(\'Installer ID for batch (or leave blank):\',\'\');'
          +grp.map(function(j){return 'updateJobField(\''+j.id+'\',\'cmBookedDate\',\''+cmMapDate+'\');updateJobField(\''+j.id+'\',\'cmBookedTime\',\'AM\');if(inst)updateJobField(\''+j.id+'\',\'cmAssignedTo\',inst);';}).join('')
          +'addToast(\''+grp.length+' CMs batch-booked for '+sub+'\',\'success\');renderPage();" class="btn-w" style="font-size:10px;padding:4px 12px;width:100%;justify-content:center;color:#1d4ed8;border-color:#93c5fd">\ud83d\ude80 Batch book all '+grp.length+' in '+sub+' for '+cmMapDate+'</button></div>';
      }
      right += '</div>';
    });
    right += '</div>';
  }
  right += '</div>';

  // Per-installer CM load
  right += '<div class="card" style="padding:14px">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:8px">Installer CM Load</div>';
  installers.forEach(function(inst){
    var instCMs = booked.filter(function(j){return j.cmAssignedTo===inst.id;});
    var todayCMs = bookedToday.filter(function(j){return j.cmAssignedTo===inst.id;});
    right += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f9fafb">'
      +'<div style="width:20px;height:20px;border-radius:50%;background:'+inst.colour+';color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(inst.name||'?')[0]+'</div>'
      +'<div style="flex:1"><div style="font-size:11px;font-weight:600">'+inst.name+'</div>'
      +'<div style="font-size:9px;color:#9ca3af">Today: '+todayCMs.length+' \u00b7 Total booked: '+instCMs.length+'</div></div></div>';
  });
  right += '</div></div>';

  // ── Weekly CM Revenue Chart ───────────────────────────────────────────────
  var weekDates = getWeekDates(0);
  var weekStart = isoDate(weekDates[0]);
  var weekEnd = isoDate(weekDates[6]);
  var weekCMs = booked.filter(function(j){ return j.cmBookedDate && j.cmBookedDate >= weekStart && j.cmBookedDate <= weekEnd; });
  var weekCMRevenue = weekCMs.reduce(function(s,j){ return s + Math.round((j.val||0) * 0.45); }, 0); // 45% claim on CM
  var weekCMTotal = weekCMs.reduce(function(s,j){ return s + (j.val||0); }, 0);
  var weekCMFrames = weekCMs.reduce(function(s,j){ return s + (j.windows||[]).length; }, 0);

  // Day-by-day breakdown
  var dayData = [];
  var maxDayRev = 1;
  weekDates.forEach(function(d){
    var ds = isoDate(d);
    var dayCMs = weekCMs.filter(function(j){ return j.cmBookedDate === ds; });
    var dayRev = dayCMs.reduce(function(s,j){ return s + Math.round((j.val||0) * 0.45); }, 0);
    var dayTotal = dayCMs.reduce(function(s,j){ return s + (j.val||0); }, 0);
    var dayFrames = dayCMs.reduce(function(s,j){ return s + (j.windows||[]).length; }, 0);
    if (dayRev > maxDayRev) maxDayRev = dayRev;
    dayData.push({date:d, ds:ds, cms:dayCMs, rev:dayRev, total:dayTotal, frames:dayFrames, count:dayCMs.length});
  });

  var chart = '<div class="card" style="padding:16px;margin-top:16px">';
  chart += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">'
    +'<div><div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif">\ud83d\udcb0 Check Measure Revenue This Week</div>'
    +'<div style="font-size:12px;color:#6b7280;margin-top:2px">45% progress claim value from CMs booked '+fmtShortDate(weekDates[0])+' \u2014 '+fmtShortDate(weekDates[6])+'</div></div>'
    +'<div style="text-align:right"><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230">$'+Math.round(weekCMRevenue).toLocaleString()+'</div>'
    +'<div style="font-size:11px;color:#6b7280">from '+weekCMs.length+' CMs \u00b7 '+weekCMFrames+' frames \u00b7 $'+Math.round(weekCMTotal).toLocaleString()+' total job value</div></div></div>';

  // Bar chart
  chart += '<div style="display:flex;gap:6px;align-items:flex-end;height:160px;padding:0 4px;border-bottom:2px solid #e5e7eb">';
  dayData.forEach(function(dd){
    var barH = maxDayRev > 0 ? Math.max(4, Math.round(dd.rev / maxDayRev * 140)) : 4;
    var td = isToday(dd.date);
    var wk = dd.date.getDay()===0||dd.date.getDay()===6;
    chart += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">'
      +'<div style="font-size:9px;font-weight:700;color:'+(dd.rev>0?'#c41230':'#d1d5db')+'">'+dd.count+'</div>'
      +'<div style="width:100%;max-width:60px;height:'+barH+'px;background:'+(td?'#c41230':wk?'#e5e7eb':'#f87171')+';border-radius:4px 4px 0 0;position:relative;cursor:pointer" title="$'+Math.round(dd.rev).toLocaleString()+' from '+dd.count+' CMs">'
      +(dd.rev>0?'<div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:700;color:#c41230;white-space:nowrap">$'+Math.round(dd.rev/1000)+'k</div>':'')
      +'</div></div>';
  });
  chart += '</div>';

  // Day labels
  chart += '<div style="display:flex;gap:6px;padding:6px 4px 0">';
  dayData.forEach(function(dd){
    var td = isToday(dd.date);
    chart += '<div style="flex:1;text-align:center;font-size:10px;font-weight:'+(td?'700':'500')+';color:'+(td?'#c41230':'#6b7280')+'">'+fmtShortDate(dd.date)+'</div>';
  });
  chart += '</div>';

  // Daily breakdown table
  chart += '<div style="margin-top:14px">';
  dayData.filter(function(dd){return dd.count>0;}).forEach(function(dd){
    var td = isToday(dd.date);
    chart += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f9fafb;font-size:11px">'
      +'<span style="width:65px;font-weight:700;'+(td?'color:#c41230':'color:#374151')+'">'+fmtShortDate(dd.date)+'</span>'
      +'<span style="color:#6b7280">'+dd.count+' CM'+(dd.count!==1?'s':'')+'</span>'
      +'<span style="color:#6b7280">'+dd.frames+' frames</span>'
      +'<span style="flex:1"></span>'
      +'<span style="font-weight:700;color:#374151">$'+Math.round(dd.total).toLocaleString()+' job value</span>'
      +'<span style="font-weight:800;color:#c41230;font-family:Syne,sans-serif">$'+Math.round(dd.rev).toLocaleString()+' claim</span></div>';
    dd.cms.forEach(function(j){
      var c = contacts.find(function(ct){return ct.id===j.contactId;});
      chart += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0 3px 75px;font-size:10px;color:#9ca3af">'
        +'<span style="font-weight:600;color:#c41230">'+(j.jobNumber||'')+'</span>'
        +'<span>'+(c?c.fn+' '+c.ln:'')+'</span>'
        +'<span>'+(j.suburb||'')+'</span>'
        +'<span style="margin-left:auto;font-weight:600;color:#374151">$'+Math.round((j.val||0)*0.45).toLocaleString()+'</span></div>';
    });
  });
  chart += '</div></div>';

  return '<div>'
    +'<div style="margin-bottom:14px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">\ud83d\udccd Check Measure Schedule Map</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Book check measures by proximity \u2014 cluster by area for efficient routes</p></div>'
    +kpi+filters
    +'<div style="display:grid;grid-template-columns:1fr 380px;gap:16px;align-items:start">'
    +left+right
    +'</div>'
    +chart
    +'</div>';
}

