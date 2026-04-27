// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 15-jobs-crm.js
// Extracted from original index.html lines 10867-11083
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// JOB CRM DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

function renderJobDashboard() {
  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var branch = getState().branch || 'all';
  var installers = getInstallers().filter(function(i){return i.active;});
  var svcs = getServiceCalls();
  var invoices = typeof getInvoices === 'function' ? getInvoices() : [];
  var targets = getState().weeklyTargets || {};

  if (branch !== 'all') { jobs = jobs.filter(function(j){return j.branch===branch;}); svcs = svcs.filter(function(s){return s.branch===branch;}); }

  var now = new Date();
  var thisMonth = now.toISOString().slice(0,7);
  var weekDates = getWeekDates(0);
  var weekStart = isoDate(weekDates[0]);
  var weekEnd = isoDate(weekDates[6]);

  // Core metrics
  var activeJobs = jobs.filter(function(j){return j.status!=='h_completed_standard'&&j.status!=='h1_completed_service'&&j.status!=='i_cancelled';});
  var totalPipelineVal = activeJobs.reduce(function(s,j){return s+(j.val||0);},0);
  var completedThisMonth = jobs.filter(function(j){return j.installCompletedAt&&j.installCompletedAt.slice(0,7)===thisMonth;});
  var completedVal = completedThisMonth.reduce(function(s,j){return s+(j.val||0);},0);

  // Invoice metrics
  var jobInvoices = invoices.filter(function(inv){return inv.jobId;});
  var totalInvoiced = jobInvoices.reduce(function(s,i){return s+(i.total||0);},0);
  var totalPaid = jobInvoices.filter(function(i){return i.status==='paid';}).reduce(function(s,i){return s+(i.total||0);},0);
  var outstanding = totalInvoiced - totalPaid;

  // CM backlog
  var cmJobs = jobs.filter(function(j){return j.status==='a_check_measure'&&!j.cmCompletedAt;});
  var cmUnbooked = cmJobs.filter(function(j){return !j.cmBookedDate;});
  var cmOverdue = cmJobs.filter(function(j){return j.created&&Math.floor((now-new Date(j.created))/86400000)>14;});

  // This week
  var weekInstalls = jobs.filter(function(j){return j.installDate&&j.installDate>=weekStart&&j.installDate<=weekEnd;});
  var weekCMs = cmJobs.filter(function(j){return j.cmBookedDate&&j.cmBookedDate>=weekStart&&j.cmBookedDate<=weekEnd;});
  var weekRevenue = weekInstalls.reduce(function(s,j){return s+(j.val||0);},0);
  var weekFrames = weekInstalls.reduce(function(s,j){return s+(j.windows||[]).length;},0);
  var targetVal = branch!=='all'?(targets[branch]||175000):Object.values(targets).reduce(function(s,v){return s+v;},0);

  // Service
  var openSvcs = svcs.filter(function(s){return s.status!=='completed'&&s.status!=='closed';});
  var urgentSvcs = openSvcs.filter(function(s){return s.priority==='urgent';});

  // Held jobs
  var heldJobs = jobs.filter(function(j){return j.hold||j.status==='c4_date_change_hold';});

  // ── KPI Strip ─────────────────────────────────────────────────────────────
  var h = '<div style="margin-bottom:20px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">Job CRM Dashboard</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Installation pipeline overview'+(branch!=='all'?' \u2014 '+branch:'')+'</p></div>';

  h += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">';
  var kpis = [
    {label:'Active Jobs',val:activeJobs.length,col:'#374151',sub:Math.round(totalPipelineVal/1000)+'k pipeline'},
    {label:'This Week',val:weekInstalls.length+' installs',col:'#3b82f6',sub:weekFrames+' frames \u00b7 $'+Math.round(weekRevenue/1000)+'k'},
    {label:'CM Backlog',val:cmJobs.length,col:cmOverdue.length>0?'#ef4444':'#f59e0b',sub:cmUnbooked.length+' unbooked'+(cmOverdue.length>0?' \u00b7 '+cmOverdue.length+' overdue':'')},
    {label:'Completed (Month)',val:completedThisMonth.length,col:'#22c55e',sub:'$'+Math.round(completedVal/1000)+'k value'},
    {label:'Outstanding $',val:'$'+Math.round(outstanding/1000)+'k',col:outstanding>0?'#c41230':'#22c55e',sub:'$'+Math.round(totalPaid/1000)+'k paid of $'+Math.round(totalInvoiced/1000)+'k'},
    {label:'Service Calls',val:openSvcs.length,col:urgentSvcs.length>0?'#ef4444':'#6b7280',sub:urgentSvcs.length>0?urgentSvcs.length+' urgent':'All normal'},
  ];
  kpis.forEach(function(k){
    h += '<div class="card" style="padding:14px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">'+k.label+'</div>'
      +'<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:'+k.col+';margin-top:4px">'+k.val+'</div>'
      +'<div style="font-size:10px;color:#9ca3af;margin-top:2px">'+k.sub+'</div></div>';
  });
  h += '</div>';

  // ── Weekly Target Progress ────────────────────────────────────────────────
  var pctTarget = targetVal>0?Math.round(weekRevenue/targetVal*100):0;
  h += '<div class="card" style="padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:20px">'
    +'<div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px"><span style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">Weekly Installation Target</span><span style="font-size:13px;font-weight:700;color:'+(pctTarget>=100?'#22c55e':'#c41230')+'">'+pctTarget+'%</span></div>'
    +'<div style="height:10px;background:#f3f4f6;border-radius:5px;overflow:hidden"><div style="height:100%;background:'+(pctTarget>=100?'#22c55e':pctTarget>=70?'#f59e0b':'#c41230')+';border-radius:5px;width:'+Math.min(pctTarget,100)+'%;transition:width .3s"></div></div>'
    +'<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:#6b7280"><span>$'+Math.round(weekRevenue).toLocaleString()+' booked</span><span>Target: $'+Math.round(targetVal).toLocaleString()+'</span></div></div>'
    +'<a href="#" onclick="event.preventDefault();setState({page:\'schedule\'})" class="btn-r" style="flex-shrink:0;text-decoration:none;font-size:12px;padding:8px 16px;gap:6px">'+Icon({n:'schedule',size:14})+' Open Schedule</a>'
    +'</div>';

  // ── Two-column layout ─────────────────────────────────────────────────────
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';

  // Left: Status pipeline breakdown
  h += '<div class="card" style="padding:16px"><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:12px">Job Pipeline by Stage</div>';
  var groups = {};
  JOB_STATUS_GROUPS.forEach(function(g){groups[g.key]={label:g.label,col:g.col,count:0,val:0};});
  activeJobs.forEach(function(j){
    var st = JOB_STATUSES.find(function(s){return s.key===j.status;});
    if(st&&groups[st.group]){groups[st.group].count++;groups[st.group].val+=(j.val||0);}
  });
  var maxCount = Math.max.apply(null, Object.values(groups).map(function(g){return g.count;})) || 1;
  JOB_STATUS_GROUPS.forEach(function(g){
    var gd = groups[g.key];
    if(!gd) return;
    var pct = Math.round(gd.count/maxCount*100);
    h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">'
      +'<div style="width:90px;font-size:11px;font-weight:600;color:#374151;text-align:right;flex-shrink:0">'+gd.label+'</div>'
      +'<div style="flex:1;height:22px;background:#f3f4f6;border-radius:4px;overflow:hidden;position:relative">'
      +'<div style="height:100%;background:'+gd.col+';border-radius:4px;width:'+pct+'%;min-width:'+(gd.count>0?'2px':'0')+'"></div>'
      +'<span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:700;color:'+(pct>60?'#fff':'#374151')+'">'+gd.count+' ($'+Math.round(gd.val/1000)+'k)</span>'
      +'</div></div>';
  });
  h += '</div>';

  // Right: Installer utilisation this week
  h += '<div class="card" style="padding:16px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">Installer Utilisation (This Week)</span>'
    +'<a href="#" onclick="event.preventDefault();setState({page:\'schedule\'})" style="font-size:11px;color:#c41230;text-decoration:none">View Schedule \u2192</a></div>';
  if (installers.length === 0) {
    h += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:16px">No installers configured. <a href="#" onclick="event.preventDefault();setState({page:\'jobsettings\'})" style="color:#c41230">Add in Settings</a></div>';
  } else {
    installers.forEach(function(inst){
      var instJobs = weekInstalls.filter(function(j){return(j.installCrew||[]).indexOf(inst.id)>=0;});
      var instHrs = instJobs.reduce(function(s,j){return s+(j.installDurationHours||0);},0);
      var cap = (inst.maxHoursPerDay||8)*5;
      var pct = cap>0?Math.round(instHrs/cap*100):0;
      var capCol = pct>90?'#ef4444':pct>70?'#f59e0b':pct>30?'#22c55e':'#d1d5db';
      h += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f9fafb">'
        +'<div style="width:26px;height:26px;border-radius:50%;background:'+inst.colour+';color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(inst.name||'?')[0]+'</div>'
        +'<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between"><span style="font-size:12px;font-weight:600">'+inst.name+'</span><span style="font-size:11px;color:'+capCol+';font-weight:700">'+pct+'%</span></div>'
        +'<div style="height:4px;background:#f3f4f6;border-radius:2px;margin-top:3px"><div style="height:100%;background:'+capCol+';border-radius:2px;width:'+Math.min(pct,100)+'%"></div></div>'
        +'<div style="font-size:10px;color:#9ca3af;margin-top:1px">'+instJobs.length+' jobs \u00b7 '+instHrs+'/'+cap+'h</div></div></div>';
    });
  }
  h += '</div>';
  h += '</div>'; // end two-column

  // ── Three-column: Attention + This Week + Recent ──────────────────────────
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">';

  // Attention needed
  var attentionItems = [];
  cmOverdue.forEach(function(j){var c=contacts.find(function(ct){return ct.id===j.contactId;});attentionItems.push({icon:'\u26a0\ufe0f',text:(j.jobNumber||'')+' \u2014 CM overdue ('+Math.floor((now-new Date(j.created))/86400000)+'d)',col:'#ef4444',jobId:j.id});});
  heldJobs.forEach(function(j){attentionItems.push({icon:'\u23f8\ufe0f',text:(j.jobNumber||'')+' \u2014 On hold'+(j.holdReason?' ('+j.holdReason+')':''),col:'#f59e0b',jobId:j.id});});
  cmUnbooked.slice(0,3).forEach(function(j){attentionItems.push({icon:'\ud83d\udcc5',text:(j.jobNumber||'')+' \u2014 CM not booked yet',col:'#3b82f6',jobId:j.id});});
  weekInstalls.filter(function(j){return !j.installTime;}).slice(0,3).forEach(function(j){attentionItems.push({icon:'\u23f0',text:(j.jobNumber||'')+' \u2014 Install scheduled, no time set',col:'#a855f7',jobId:j.id});});
  urgentSvcs.forEach(function(s){attentionItems.push({icon:'\ud83d\udea8',text:s.serviceNumber+' \u2014 Urgent service call',col:'#ef4444',jobId:null});});

  h += '<div class="card" style="padding:16px;max-height:340px;overflow-y:auto"><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:10px">\u26a1 Needs Attention <span style="font-weight:400;color:#9ca3af">('+attentionItems.length+')</span></div>';
  if (attentionItems.length === 0) {
    h += '<div style="color:#22c55e;font-size:12px;text-align:center;padding:20px">\u2705 Nothing requires attention</div>';
  } else {
    attentionItems.slice(0,10).forEach(function(item){
      h += '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #f9fafb;cursor:pointer;font-size:12px" '
        +(item.jobId?'onclick="setState({page:\'jobs\',jobDetailId:\''+item.jobId+'\'})"':'')+'>'
        +'<span style="flex-shrink:0">'+item.icon+'</span>'
        +'<span style="color:'+item.col+'">'+item.text+'</span></div>';
    });
  }
  h += '</div>';

  // This week schedule preview
  h += '<div class="card" style="padding:16px;max-height:340px;overflow-y:auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">\ud83d\udcc5 This Week</span>'
    +'<a href="#" onclick="event.preventDefault();setState({page:\'schedule\'})" style="font-size:10px;color:#c41230;text-decoration:none">Full Schedule \u2192</a></div>';
  weekDates.filter(function(d){return d.getDay()!==0&&d.getDay()!==6;}).forEach(function(d){
    var ds = isoDate(d);
    var dayInstalls = weekInstalls.filter(function(j){return j.installDate===ds;});
    var dayCMs = weekCMs.filter(function(j){return j.cmBookedDate===ds;});
    var td = isToday(d);
    h += '<div style="padding:6px 0;border-bottom:1px solid #f9fafb;'+(td?'background:#fef2f2;margin:0 -16px;padding:6px 16px;border-radius:6px':'')+'">'
      +'<div style="font-size:11px;font-weight:700;'+(td?'color:#c41230':'color:#374151')+'">'+fmtShortDate(d)+(td?' \u00b7 Today':'')+'</div>'
      +'<div style="display:flex;gap:8px;margin-top:3px;font-size:10px;color:#6b7280">';
    if(dayInstalls.length>0) h+='<span style="color:#3b82f6;font-weight:600">'+dayInstalls.length+' install'+(dayInstalls.length!==1?'s':'')+'</span>';
    if(dayCMs.length>0) h+='<span style="color:#f59e0b;font-weight:600">'+dayCMs.length+' CM'+(dayCMs.length!==1?'s':'')+'</span>';
    if(dayInstalls.length===0&&dayCMs.length===0) h+='<span style="color:#d1d5db">No appointments</span>';
    h += '</div>';
    dayInstalls.slice(0,2).forEach(function(j){
      var c=contacts.find(function(ct){return ct.id===j.contactId;});
      h += '<div style="font-size:10px;color:#6b7280;margin-top:2px;padding-left:8px;border-left:2px solid #3b82f6;margin-left:2px">'
        +'<span style="font-weight:600;color:#c41230">'+(j.jobNumber||'')+'</span> '+(c?c.fn+' '+c.ln:'')+' \u00b7 '+(j.suburb||'')+'</div>';
    });
    h += '</div>';
  });
  h += '</div>';

  // Recent job movements
  h += '<div class="card" style="padding:16px;max-height:340px;overflow-y:auto"><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:10px">\ud83d\udcca Recent Activity</div>';
  var recentJobs = jobs.slice().sort(function(a,b){return(b.updated||'').localeCompare(a.updated||'');}).slice(0,10);
  recentJobs.forEach(function(j){
    var c=contacts.find(function(ct){return ct.id===j.contactId;});
    var st=JOB_STATUSES.find(function(s){return s.key===j.status;});
    var age = j.updated ? Math.floor((now-new Date(j.updated))/3600000) : 0;
    var ageLabel = age<1?'Just now':age<24?age+'h ago':Math.floor(age/24)+'d ago';
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f9fafb;cursor:pointer;font-size:11px" onclick="setState({page:\'jobs\',jobDetailId:\''+j.id+'\'})">'
      +'<div style="width:8px;height:8px;border-radius:50%;background:'+(st?st.col:'#9ca3af')+';flex-shrink:0"></div>'
      +'<div style="flex:1;min-width:0"><span style="font-weight:700;color:#c41230">'+(j.jobNumber||'')+'</span> '+(c?c.fn+' '+c.ln:'')+' <span style="color:#9ca3af">'+(j.suburb||'')+'</span></div>'
      +'<span style="font-size:10px;color:'+(st?st.col:'#9ca3af')+';font-weight:500;flex-shrink:0">'+(st?st.label:'')+'</span>'
      +'<span style="font-size:9px;color:#d1d5db;flex-shrink:0;width:50px;text-align:right">'+ageLabel+'</span></div>';
  });
  h += '</div>';

  h += '</div>'; // end three-column

  // ── Branch breakdown ──────────────────────────────────────────────────────
  if (branch === 'all') {
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px">';
    ['VIC','ACT','SA','TAS'].forEach(function(b){
      var bJobs = (getState().jobs||[]).filter(function(j){return j.branch===b&&j.status!=='h_completed_standard'&&j.status!=='i_cancelled';});
      var bVal = bJobs.reduce(function(s,j){return s+(j.val||0);},0);
      var bCm = bJobs.filter(function(j){return j.status==='a_check_measure'&&!j.cmCompletedAt;}).length;
      var bTarget = targets[b]||0;
      var bWeek = bJobs.filter(function(j){return j.installDate&&j.installDate>=weekStart&&j.installDate<=weekEnd;});
      var bWeekVal = bWeek.reduce(function(s,j){return s+(j.val||0);},0);
      var bPct = bTarget>0?Math.round(bWeekVal/bTarget*100):0;
      h += '<div class="card" style="padding:14px 16px"><div style="font-size:16px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-bottom:6px">'+b+'</div>'
        +'<div style="font-size:12px;color:#6b7280;line-height:1.8">'+bJobs.length+' active jobs<br>$'+Math.round(bVal/1000)+'k pipeline<br>'+bCm+' awaiting CM<br>'+bWeek.length+' installs this week</div>'
        +'<div style="margin-top:8px;height:5px;background:#f3f4f6;border-radius:3px;overflow:hidden"><div style="height:100%;background:'+(bPct>=100?'#22c55e':bPct>=60?'#f59e0b':'#c41230')+';border-radius:3px;width:'+Math.min(bPct,100)+'%"></div></div>'
        +'<div style="font-size:10px;color:#9ca3af;margin-top:2px">'+bPct+'% of $'+Math.round(bTarget).toLocaleString()+' target</div></div>';
    });
    h += '</div>';
  }

  return '<div>'+h+'</div>';
}


