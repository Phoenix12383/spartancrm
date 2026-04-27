// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 19-service-crm.js
// Extracted from original index.html lines 13503-13913
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// SERVICE CRM — Service Calls linked to Job CRM
// ══════════════════════════════════════════════════════════════════════════════
var SERVICE_TYPES = {warranty:'Warranty',callback:'Callback',repair:'Repair',adjustment:'Adjustment',complaint:'Complaint',leak:'Leak',hardware:'Hardware Issue',glass:'Glass Issue'};
var SERVICE_PRIORITIES = {low:{label:'Low',col:'#6b7280',bg:'#f3f4f6'},medium:{label:'Medium',col:'#f59e0b',bg:'#fef9c3'},high:{label:'High',col:'#ef4444',bg:'#fee2e2'},urgent:{label:'Urgent',col:'#fff',bg:'#c41230'}};
var SERVICE_STATUSES = [
  {key:'new',label:'New',col:'#3b82f6'},{key:'assigned',label:'Assigned',col:'#a855f7'},
  {key:'scheduled',label:'Scheduled',col:'#06b6d4'},{key:'in_progress',label:'In Progress',col:'#f59e0b'},
  {key:'completed',label:'Completed',col:'#22c55e'},{key:'closed',label:'Closed',col:'#6b7280'}
];
var svcMapDate = new Date().toISOString().slice(0,10);

function getServiceCalls() { return getState().serviceCalls || []; }
function saveServiceCalls(list) { localStorage.setItem('spartan_service_calls', JSON.stringify(list)); setState({serviceCalls:list}); if(_sb)list.forEach(function(x){dbUpsert('service_calls',x);}); }
function addServiceCall(jobId, type, priority, description) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){return j.id===jobId;});
  if (!job) { addToast('Job not found','error'); return null; }
  var contacts = getState().contacts || [];
  var c = contacts.find(function(ct){return ct.id===job.contactId;});
  var num = 'SVC-'+(job.branch||'VIC')+'-'+(getServiceCalls().length+1).toString().padStart(4,'0');
  var svc = {id:'svc_'+Date.now(), serviceNumber:num, jobId:jobId, jobNumber:job.jobNumber||'',
    contactId:job.contactId, contactName:c?(c.fn+' '+c.ln):'', type:type||'callback',
    priority:priority||'medium', status:'new', description:description||'',
    suburb:job.suburb||'', street:job.street||'', state:job.state||'', postcode:job.postcode||'',
    assignedTo:'', scheduledDate:'', scheduledTime:'',
    completedAt:'', resolution:'', created:new Date().toISOString(), updated:new Date().toISOString(),
    branch:job.branch||'VIC', val:0};
  var list = getServiceCalls(); list.push(svc); saveServiceCalls(list);
  addToast('Service call '+num+' created','success');
  return svc;
}
function updateService(id, changes) {
  changes.updated = new Date().toISOString();
  var list = getServiceCalls().map(function(s){return s.id===id?Object.assign({},s,changes):s;});
  saveServiceCalls(list);
}

function renderServiceList() {
  var svcs = getServiceCalls();
  var contacts = getState().contacts || [];
  var branch = getState().branch || 'all';
  var detailId = getState().serviceDetailId;
  if (detailId) return renderServiceDetail(detailId);

  if (branch !== 'all') svcs = svcs.filter(function(s){return s.branch===branch;});

  // KPI
  var open = svcs.filter(function(s){return s.status!=='completed'&&s.status!=='closed';});
  var urgent = svcs.filter(function(s){return s.priority==='urgent'&&s.status!=='completed'&&s.status!=='closed';});
  var completedThisMonth = svcs.filter(function(s){return s.status==='completed'&&s.completedAt&&s.completedAt.slice(0,7)===new Date().toISOString().slice(0,7);});
  var avgAge = open.length>0?Math.round(open.reduce(function(s,sv){return s+Math.floor((new Date()-new Date(sv.created))/86400000);},0)/open.length):0;

  var kpi = '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Open</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:2px">'+open.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Urgent</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#ef4444;margin-top:2px">'+urgent.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Completed (Month)</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:2px">'+completedThisMonth.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Avg Age (days)</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+avgAge+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Total</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+svcs.length+'</div></div></div>';

  // New service call button
  var header = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
    +'<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">Service Calls</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Warranty, callbacks, repairs \u2014 linked to jobs</p></div>'
    +'<button onclick="var jn=prompt(\'Job number or ID to create service call for:\');if(!jn)return;var jobs=getState().jobs||[];var job=jobs.find(function(j){return j.jobNumber===jn||j.id===jn;});if(!job){addToast(\'Job not found. Enter exact job number e.g. VIC-4001\',\'error\');return;}var type=prompt(\'Type (warranty/callback/repair/adjustment/complaint/leak/hardware/glass):\',\'callback\');var pri=prompt(\'Priority (low/medium/high/urgent):\',\'medium\');var desc=prompt(\'Description of issue:\',\'\');addServiceCall(job.id,type,pri,desc);" class="btn-r" style="font-size:12px;gap:6px">'+Icon({n:'plus',size:14})+' New Service Call</button></div>';

  // Status filter pills
  var statusFilter = '<div style="display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap">';
  statusFilter += '<button onclick="setState({svcStatusFilter:\'\'});renderPage()" class="btn-'+(!(getState().svcStatusFilter)?'r':'w')+'" style="font-size:11px;padding:4px 12px">All</button>';
  SERVICE_STATUSES.forEach(function(st){
    var cnt = svcs.filter(function(s){return s.status===st.key;}).length;
    var active = getState().svcStatusFilter===st.key;
    statusFilter += '<button onclick="setState({svcStatusFilter:\''+st.key+'\'});renderPage()" class="btn-'+(active?'r':'w')+'" style="font-size:11px;padding:4px 12px">'+st.label+' ('+cnt+')</button>';
  });
  statusFilter += '</div>';

  var filtered = svcs;
  if (getState().svcStatusFilter) filtered = filtered.filter(function(s){return s.status===getState().svcStatusFilter;});
  filtered.sort(function(a,b){
    if (a.priority==='urgent'&&b.priority!=='urgent') return -1;
    if (b.priority==='urgent'&&a.priority!=='urgent') return 1;
    return (b.created||'').localeCompare(a.created||'');
  });

  // Table
  var table = '<div class="card" style="overflow:hidden;padding:0">';
  if (filtered.length === 0) {
    table += '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">'+(svcs.length===0?'No service calls yet. Create one from a job.':'No service calls match this filter.')+'</div>';
  } else {
    table += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Service #</th><th class="th">Job</th><th class="th">Client</th><th class="th">Type</th><th class="th">Priority</th><th class="th">Status</th><th class="th">Suburb</th><th class="th">Assigned</th><th class="th">Scheduled</th><th class="th">Age</th></tr></thead><tbody>';
    filtered.forEach(function(svc){
      var st = SERVICE_STATUSES.find(function(x){return x.key===svc.status;});
      var pr = SERVICE_PRIORITIES[svc.priority]||SERVICE_PRIORITIES.medium;
      var inst = getInstallers().find(function(i){return i.id===svc.assignedTo;});
      var age = Math.floor((new Date()-new Date(svc.created))/86400000);
      table += '<tr style="cursor:pointer" onclick="setState({serviceDetailId:\''+svc.id+'\'})" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">'
        +'<td class="td" style="font-weight:700;color:#c41230">'+svc.serviceNumber+'</td>'
        +'<td class="td"><span style="color:#3b82f6;cursor:pointer" onclick="event.stopPropagation();setState({crmMode:\'jobs\',page:\'jobs\',jobDetailId:\''+svc.jobId+'\'})">'+svc.jobNumber+'</span></td>'
        +'<td class="td">'+svc.contactName+'</td>'
        +'<td class="td"><span class="bdg" style="font-size:10px">'+(SERVICE_TYPES[svc.type]||svc.type)+'</span></td>'
        +'<td class="td"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+pr.bg+';color:'+pr.col+'">'+pr.label+'</span></td>'
        +'<td class="td"><span style="font-size:10px;font-weight:600;color:'+st.col+'">\u25cf '+st.label+'</span></td>'
        +'<td class="td">'+(svc.suburb||'')+'</td>'
        +'<td class="td">'+(inst?inst.name.split(' ')[0]:'\u2014')+'</td>'
        +'<td class="td">'+(svc.scheduledDate||'\u2014')+'</td>'
        +'<td class="td">'+(age>7?'<span style="color:#ef4444;font-weight:600">'+age+'d</span>':age+'d')+'</td></tr>';
    });
    table += '</tbody></table>';
  }
  table += '</div>';

  return '<div>'+header+kpi+statusFilter+table+'</div>';
}

function renderServiceDetail(svcId) {
  var svcs = getServiceCalls();
  var svc = svcs.find(function(s){return s.id===svcId;});
  if (!svc) return '<div class="card" style="padding:40px;text-align:center">Service call not found</div>';
  var installers = getInstallers().filter(function(i){return i.active;});
  var st = SERVICE_STATUSES.find(function(x){return x.key===svc.status;})||{label:'Unknown',col:'#6b7280'};
  var pr = SERVICE_PRIORITIES[svc.priority]||SERVICE_PRIORITIES.medium;
  var inst = installers.find(function(i){return i.id===svc.assignedTo;});
  var age = Math.floor((new Date()-new Date(svc.created))/86400000);

  var h = '<div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">'
    +'<button onclick="setState({serviceDetailId:null})" class="btn-g" style="padding:4px 8px">'+Icon({n:'left',size:14})+'</button>'
    +'<h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:20px;margin:0">'+svc.serviceNumber+'</h2>'
    +'<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;background:'+pr.bg+';color:'+pr.col+'">'+pr.label+'</span>'
    +'<span style="font-size:11px;font-weight:600;color:'+st.col+'">\u25cf '+st.label+'</span>'
    +'<span style="font-size:11px;color:#6b7280;margin-left:auto">'+age+' days old \u00b7 Linked to <a href="#" onclick="event.preventDefault();setState({crmMode:\'jobs\',page:\'jobs\',jobDetailId:\''+svc.jobId+'\'})" style="color:#3b82f6">'+svc.jobNumber+'</a></span>'
    +'</div>';

  h += '<div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">';
  // Left: details
  h += '<div><div class="card" style="padding:16px">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:10px">Service Details</div>'
    +'<div style="display:grid;gap:10px">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Type</label><select class="sel" style="font-size:13px;padding:8px" onchange="updateService(\''+svc.id+'\',{type:this.value});renderPage()">'+Object.entries(SERVICE_TYPES).map(function(e){return '<option value="'+e[0]+'"'+(svc.type===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></div>'
    +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Priority</label><select class="sel" style="font-size:13px;padding:8px" onchange="updateService(\''+svc.id+'\',{priority:this.value});renderPage()">'+Object.keys(SERVICE_PRIORITIES).map(function(k){return '<option value="'+k+'"'+(svc.priority===k?' selected':'')+'>'+SERVICE_PRIORITIES[k].label+'</option>';}).join('')+'</select></div></div>'
    +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Status</label><select class="sel" style="font-size:13px;padding:8px" onchange="updateService(\''+svc.id+'\',{status:this.value'+(this.value==='completed'?',completedAt:new Date().toISOString()':'')+'}); renderPage()">'+SERVICE_STATUSES.map(function(s){return '<option value="'+s.key+'"'+(svc.status===s.key?' selected':'')+'>'+s.label+'</option>';}).join('')+'</select></div>'
    +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Description</label><textarea class="inp" rows="3" style="font-size:13px" onblur="updateService(\''+svc.id+'\',{description:this.value})">'+svc.description+'</textarea></div>'
    +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Resolution Notes</label><textarea class="inp" rows="3" style="font-size:13px" onblur="updateService(\''+svc.id+'\',{resolution:this.value})">'+svc.resolution+'</textarea></div>'
    +'</div></div></div>';

  // Right: scheduling + assignment
  h += '<div><div class="card" style="padding:16px;margin-bottom:14px">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:10px">Schedule & Assignment</div>'
    +'<div style="display:grid;gap:10px">'
    +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Assigned Installer</label><select class="sel" style="font-size:13px;padding:8px" onchange="updateService(\''+svc.id+'\',{assignedTo:this.value,status:this.value?\'assigned\':\'new\'});renderPage()"><option value="">Unassigned</option>'+installers.map(function(i){return '<option value="'+i.id+'"'+(svc.assignedTo===i.id?' selected':'')+'>'+i.name+'</option>';}).join('')+'</select></div>'
    +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Scheduled Date</label><input type="date" class="inp" value="'+(svc.scheduledDate||'')+'" style="font-size:13px;padding:8px" onblur="updateService(\''+svc.id+'\',{scheduledDate:this.value,status:this.value?\'scheduled\':\'assigned\'});renderPage()"></div>'
    +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Scheduled Time</label><select class="sel" style="font-size:13px;padding:8px" onchange="updateService(\''+svc.id+'\',{scheduledTime:this.value})"><option value="">Select time</option>'+['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','13:00','14:00','15:00','16:00'].map(function(t){return '<option value="'+t+'"'+(svc.scheduledTime===t?' selected':'')+'>'+formatTime12(t)+'</option>';}).join('')+'</select></div>'
    +'</div></div>'
    +'<div class="card" style="padding:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:10px">Site Info</div>'
    +'<div style="font-size:13px;color:#374151;line-height:1.8">'
    +'\ud83d\udc64 '+svc.contactName+'<br>'
    +'\ud83d\udccd '+(svc.street?svc.street+', ':'')+(svc.suburb||'')+' '+(svc.state||'')+' '+(svc.postcode||'')+'<br>'
    +(svc.scheduledDate?'\ud83d\udcc5 '+svc.scheduledDate+(svc.scheduledTime?' at '+formatTime12(svc.scheduledTime):'')+'<br>':'')
    +(inst?'\ud83d\udc77 '+inst.name+' ($'+inst.hourlyRate+'/h)':'')
    +'</div>'
    +(svc.suburb?'<a href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent([svc.street,svc.suburb,svc.state].filter(Boolean).join(', ')+' Australia')+'" target="_blank" class="btn-w" style="font-size:11px;padding:6px 12px;margin-top:10px;width:100%;justify-content:center;text-decoration:none;gap:4px">'+Icon({n:'map',size:13})+' Get Directions</a>':'')
    +'</div></div>';

  h += '</div></div>';
  return h;
}

// (Previous OSM-iframe mount helper removed — this page now uses real Google
//  Maps via mountServiceGoogleMap in 14a-google-maps-real.js.)

function renderServiceMap() {
  var svcs = getServiceCalls();
  var branch = getState().branch || 'all';
  var installers = getInstallers().filter(function(i){return i.active;});
  if (branch !== 'all') svcs = svcs.filter(function(s){return s.branch===branch;});

  var open = svcs.filter(function(s){return s.status!=='completed'&&s.status!=='closed';});
  var unbooked = open.filter(function(s){return !s.scheduledDate;});
  var bookedToday = open.filter(function(s){return s.scheduledDate===svcMapDate;});

  // Map centre + plotting handled by mountServiceGoogleMap in 14a-google-maps-real.js.

  // Group unbooked by suburb
  var subG={};unbooked.forEach(function(s){var k=(s.suburb||'Unknown').trim();if(!subG[k])subG[k]=[];subG[k].push(s);});
  var subs=Object.keys(subG).sort(function(a,b){return subG[b].length-subG[a].length;});

  var kpi='<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<div class="card" style="flex:1;min-width:110px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Open Service</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:2px">'+open.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:110px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Unbooked</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#f59e0b;margin-top:2px">'+unbooked.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:110px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Today</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:2px">'+bookedToday.length+'</div></div></div>';

  var filters='<div style="display:flex;gap:8px;margin-bottom:14px"><input type="date" value="'+svcMapDate+'" oninput="svcMapDate=this.value;renderPage()" class="inp" style="font-size:13px;padding:7px 10px"></div>';

  // Left: map + daily schedule
  var left='<div style="display:flex;flex-direction:column;gap:14px">';
  left+='<div class="card" style="overflow:hidden"><div id="serviceMapSlot" style="width:100%;height:380px;background:#f3f4f6"></div></div>';
  left+='<div class="card" style="overflow:hidden"><div style="padding:12px 16px;border-bottom:1px solid #f0f0f0"><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">Service Schedule \u2014 '+new Date(svcMapDate+'T12:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})+'</div></div>';
  if(bookedToday.length===0){left+='<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">No service calls scheduled for this date</div>';}
  else{bookedToday.sort(function(a,b){return(a.scheduledTime||'99').localeCompare(b.scheduledTime||'99');}).forEach(function(svc,i){
    var inst=installers.find(function(x){return x.id===svc.assignedTo;});var pr=SERVICE_PRIORITIES[svc.priority]||SERVICE_PRIORITIES.medium;
    left+='<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;'+(i<bookedToday.length-1?'border-bottom:1px solid #f9fafb':'')+';cursor:pointer" onclick="setState({crmMode:\'service\',page:\'servicelist\',serviceDetailId:\''+svc.id+'\'})">'
      +'<div style="min-width:45px;font-size:13px;font-weight:700">'+(svc.scheduledTime?formatTime12(svc.scheduledTime):'\u2014')+'</div>'
      +(inst?'<div style="width:10px;height:10px;border-radius:50%;background:'+inst.colour+';flex-shrink:0"></div>':'')
      +'<div style="flex:1"><div style="font-size:12px;font-weight:600">'+svc.serviceNumber+' \u2014 '+svc.contactName+'</div>'
      +'<div style="font-size:11px;color:#6b7280">\ud83d\udccd '+(svc.suburb||'')+' \u00b7 '+(SERVICE_TYPES[svc.type]||svc.type)+'</div></div>'
      +'<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+pr.bg+';color:'+pr.col+'">'+pr.label+'</span></div>';});}
  left+='</div></div>';

  // Right: smart booking
  var right='<div style="display:flex;flex-direction:column;gap:14px">';
  right+='<div class="card" style="overflow:hidden"><div style="padding:12px 16px;border-bottom:1px solid #f0f0f0"><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif">\ud83d\udccd Smart Service Booking ('+unbooked.length+')</div></div>';
  if(subs.length===0){right+='<div style="padding:20px;text-align:center;color:#22c55e;font-size:12px">\u2705 All service calls booked</div>';}
  else{right+='<div style="max-height:500px;overflow-y:auto">';subs.forEach(function(sub){
    var grp=subG[sub];
    right+='<div style="border-bottom:1px solid #f3f4f6"><div style="padding:8px 16px;background:#f9fafb"><span style="font-size:12px;font-weight:700">\ud83d\udccd '+sub+'</span><span style="font-size:10px;color:#6b7280;margin-left:6px">'+grp.length+' call'+(grp.length!==1?'s':'')+'</span></div>';
    grp.forEach(function(svc){var pr=SERVICE_PRIORITIES[svc.priority]||SERVICE_PRIORITIES.medium;
      right+='<div style="display:flex;align-items:center;gap:6px;padding:8px 16px;border-bottom:1px solid #fafafa">'
        +'<div style="flex:1;min-width:0"><div style="font-size:11px"><span style="font-weight:700;color:#c41230">'+svc.serviceNumber+'</span> '+svc.contactName+'</div>'
        +'<div style="font-size:10px;color:#6b7280">'+(SERVICE_TYPES[svc.type]||'')+' \u00b7 <span style="font-weight:600;color:'+pr.col+'">'+pr.label+'</span></div></div>'
        +'<select class="sel" style="font-size:9px;padding:2px 3px;width:70px" onchange="updateService(\''+svc.id+'\',{assignedTo:this.value,status:this.value?\'assigned\':\'new\'});renderPage()"><option value="">Assign</option>'+installers.map(function(i){return '<option value="'+i.id+'">'+i.name.split(' ')[0]+'</option>';}).join('')+'</select>'
        +'<input type="date" class="inp" style="font-size:9px;padding:2px 3px;width:105px" value="'+svcMapDate+'" id="svcb_d_'+svc.id+'">'
        +'<button onclick="var d=document.getElementById(\'svcb_d_'+svc.id+'\').value;updateService(\''+svc.id+'\',{scheduledDate:d,status:\'scheduled\'});addToast(\''+svc.serviceNumber+' scheduled\',\'success\');renderPage();" class="btn-r" style="font-size:9px;padding:2px 8px">Book</button></div>';});
    right+='</div>';});right+='</div>';}
  right+='</div></div>';

  return '<div>'
    +'<div style="margin-bottom:14px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">\ud83d\udee0\ufe0f Service Scheduler</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Book service calls by proximity \u2014 optimise routes for callbacks and repairs</p></div>'
    +kpi+filters
    +'<div style="display:grid;grid-template-columns:1fr 380px;gap:16px;align-items:start">'+left+right+'</div></div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE SCHEDULE — Find openings in install schedule for service calls
// ══════════════════════════════════════════════════════════════════════════════
var svcSchedOffset = 0;

function renderSvcSchedule() {
  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var branch = getState().branch || 'all';
  var installers = getInstallers().filter(function(i){return i.active;});
  var svcs = getServiceCalls().filter(function(s){return s.status!=='completed'&&s.status!=='closed';});
  var weekDates = getWeekDates(svcSchedOffset);
  var weekStart = isoDate(weekDates[0]);
  var weekEnd = isoDate(weekDates[6]);

  if (branch !== 'all') { jobs = jobs.filter(function(j){return j.branch===branch;}); svcs = svcs.filter(function(s){return s.branch===branch;}); }
  var weekJobs = jobs.filter(function(j){return j.installDate&&j.installDate>=weekStart&&j.installDate<=weekEnd;});
  var unbooked = svcs.filter(function(s){return !s.scheduledDate;});
  var bookedThisWeek = svcs.filter(function(s){return s.scheduledDate&&s.scheduledDate>=weekStart&&s.scheduledDate<=weekEnd;});

  // Week nav
  var nav = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:14px">'
    +'<button onclick="svcSchedOffset--;renderPage()" class="btn-w" style="padding:5px 10px;font-size:12px">\u2190</button>'
    +'<button onclick="svcSchedOffset=0;renderPage()" class="btn-'+(svcSchedOffset===0?'r':'w')+'" style="padding:5px 14px;font-size:12px;font-weight:700">This Week</button>'
    +'<button onclick="svcSchedOffset++;renderPage()" class="btn-w" style="padding:5px 10px;font-size:12px">\u2192</button>'
    +'<span style="font-family:Syne,sans-serif;font-weight:700;font-size:14px;margin-left:8px">'+fmtShortDate(weekDates[0])+' \u2014 '+fmtShortDate(weekDates[6])+'</span></div>';

  // KPIs — capacity focused, no revenue
  var totalGaps = 0;
  var kpi = '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Open Service Calls</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:2px">'+unbooked.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Booked This Week</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:2px">'+bookedThisWeek.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Installs This Week</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+weekJobs.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Installers</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+installers.length+'</div></div></div>';

  // ── Build gap analysis: per installer per day ─────────────────────────────
  var gaps = []; // {installer, date, dateStr, freeHours, startAfter, suburbs:[]}
  installers.forEach(function(inst){
    var maxH = inst.maxHoursPerDay || 8;
    weekDates.forEach(function(d){
      if (d.getDay()===0||d.getDay()===6) return;
      var ds = isoDate(d);
      var dayJobs = weekJobs.filter(function(j){return j.installDate===ds&&(j.installCrew||[]).indexOf(inst.id)>=0;});
      var dayH = dayJobs.reduce(function(s,j){return s+(j.installDurationHours||0);},0);
      var freeH = maxH - dayH;
      if (freeH >= 1) {
        var subs = dayJobs.map(function(j){return (j.suburb||'').toLowerCase().trim();}).filter(Boolean);
        var lastEnd = 7 + dayH; // approximate: stack hours from 7am
        gaps.push({inst:inst, date:d, ds:ds, freeH:freeH, startAfter:lastEnd, dayH:dayH, maxH:maxH, suburbs:subs, dayJobs:dayJobs});
        totalGaps++;
      }
    });
  });

  // For each gap, find service calls in nearby suburbs
  var recommendations = [];
  gaps.forEach(function(gap){
    unbooked.forEach(function(svc){
      var svcSub = (svc.suburb||'').toLowerCase().trim();
      var nearbyMatch = gap.suburbs.indexOf(svcSub) >= 0;
      var score = nearbyMatch ? 100 : 10; // strong preference for same suburb
      // Also boost urgent/high priority
      if (svc.priority === 'urgent') score += 50;
      else if (svc.priority === 'high') score += 30;
      recommendations.push({gap:gap, svc:svc, score:score, nearbyMatch:nearbyMatch});
    });
  });
  recommendations.sort(function(a,b){return b.score - a.score;});
  // Deduplicate: only show each service call once (best match)
  var seen = {};
  var topRecs = [];
  recommendations.forEach(function(r){
    if (seen[r.svc.id]) return;
    seen[r.svc.id] = true;
    topRecs.push(r);
  });

  // Update KPI with gaps count
  kpi = kpi.slice(0, kpi.lastIndexOf('</div></div>'));
  kpi += '</div><div class="card" style="flex:1;min-width:120px;padding:14px 18px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Schedule Gaps</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#3b82f6;margin-top:2px">'+totalGaps+'</div><div style="font-size:10px;color:#9ca3af">openings found</div></div></div>';

  // ── Installer schedule with gaps highlighted ──────────────────────────────
  var grid = '<div class="card" style="overflow-x:auto;padding:0">';
  grid += '<table style="width:100%;border-collapse:collapse;min-width:'+(180+weekDates.length*140)+'px">';
  grid += '<thead><tr><th style="position:sticky;left:0;z-index:3;background:#fff;min-width:160px;padding:8px 12px;border-bottom:2px solid #e5e7eb;border-right:2px solid #f0f0f0;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Installer</th>';
  weekDates.forEach(function(d){
    var td = isToday(d);
    grid += '<th style="padding:6px;border-bottom:2px solid '+(td?'#c41230':'#e5e7eb')+';text-align:center;min-width:130px;'+(td?'background:#fef2f2':'')+'"><div style="font-size:11px;font-weight:700;'+(td?'color:#c41230':'color:#374151')+'">'+fmtShortDate(d)+'</div></th>';
  });
  grid += '</tr></thead><tbody>';

  installers.forEach(function(inst){
    grid += '<tr style="border-bottom:1px solid #f3f4f6">';
    grid += '<td style="position:sticky;left:0;z-index:1;background:#fff;padding:8px 10px;border-right:2px solid #f0f0f0;vertical-align:top">'
      +'<div style="display:flex;align-items:center;gap:6px">'
      +'<div style="width:26px;height:26px;border-radius:50%;background:'+inst.colour+';color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(inst.name||'?')[0]+'</div>'
      +'<div style="font-size:12px;font-weight:600">'+inst.name+'</div></div></td>';

    weekDates.forEach(function(d){
      var ds = isoDate(d); var td = isToday(d); var wk = d.getDay()===0||d.getDay()===6;
      var dayJobs = weekJobs.filter(function(j){return j.installDate===ds&&(j.installCrew||[]).indexOf(inst.id)>=0;});
      var daySvcs = bookedThisWeek.filter(function(s){return s.scheduledDate===ds&&s.assignedTo===inst.id;});
      var dayH = dayJobs.reduce(function(s,j){return s+(j.installDurationHours||0);},0);
      var maxH = inst.maxHoursPerDay||8;
      var freeH = maxH - dayH;
      var hasFree = freeH >= 1 && !wk;

      grid += '<td style="padding:4px;vertical-align:top;'+(td?'background:#fffbfb':wk?'background:#fafafa':'')+';border-right:1px solid #f9fafb">';

      // Show install jobs as small blocks
      dayJobs.forEach(function(j){
        var c = contacts.find(function(ct){return ct.id===j.contactId;});
        grid += '<div style="background:'+inst.colour+'12;border-left:2px solid '+inst.colour+';border-radius:0 4px 4px 0;padding:3px 6px;margin-bottom:2px;font-size:10px">'
          +'<span style="font-weight:700;color:'+inst.colour+'">'+(j.jobNumber||'')+'</span> '
          +'<span style="color:#6b7280">'+(j.suburb||'')+'</span> '
          +'<span style="color:#9ca3af">'+(j.installDurationHours||0)+'h</span></div>';
      });

      // Show booked service calls
      daySvcs.forEach(function(s){
        var pr = SERVICE_PRIORITIES[s.priority]||SERVICE_PRIORITIES.medium;
        grid += '<div style="background:#fef3c720;border-left:2px solid #f59e0b;border-radius:0 4px 4px 0;padding:3px 6px;margin-bottom:2px;font-size:10px">'
          +'<span style="font-weight:700;color:#f59e0b">\ud83d\udee0 '+s.serviceNumber+'</span> '
          +'<span style="color:#6b7280">'+(s.suburb||'')+'</span></div>';
      });

      // Show gap indicator with quick-book dropdown
      if (hasFree) {
        grid += '<div style="background:#eff6ff;border:1px dashed #93c5fd;border-radius:6px;padding:4px 6px;margin-top:2px;text-align:center">'
          +'<div style="font-size:9px;font-weight:700;color:#3b82f6">'+freeH+'h free</div>'
          +'<select class="sel" style="font-size:9px;padding:1px 3px;width:100%;margin-top:2px;color:#3b82f6;border-color:#93c5fd" onchange="if(this.value){updateService(this.value,{scheduledDate:\''+ds+'\',assignedTo:\''+inst.id+'\',status:\'scheduled\'});addToast(\'Service call booked\',\'success\');renderPage();this.value=\'\';}">'
          +'<option value="">+ Service call</option>'
          +unbooked.map(function(s){var pr=SERVICE_PRIORITIES[s.priority]||SERVICE_PRIORITIES.medium; return '<option value="'+s.id+'">'+s.serviceNumber+' '+s.suburb+' ('+pr.label+')</option>';}).join('')
          +'</select></div>';
      } else if (!wk && dayJobs.length === 0 && daySvcs.length === 0) {
        grid += '<div style="color:#d1d5db;font-size:10px;text-align:center;padding:8px">\u2014</div>';
      }

      grid += '</td>';
    });
    grid += '</tr>';
  });
  grid += '</tbody></table></div>';

  // ── Smart Recommendations: batch service calls near existing installs ─────
  var recsHtml = '<div class="card" style="padding:16px;margin-top:16px">'
    +'<div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:4px">\ud83e\udde0 Smart Service Placement</div>'
    +'<div style="font-size:12px;color:#6b7280;margin-bottom:14px">Service calls matched to installer gaps by proximity to existing installs</div>';

  if (topRecs.length === 0) {
    recsHtml += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:16px">'+(unbooked.length===0?'\u2705 All service calls are booked':'No matching gaps found this week. Try next week or add more installers.')+'</div>';
  } else {
    recsHtml += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th" style="font-size:10px">Service Call</th><th class="th" style="font-size:10px">Client</th><th class="th" style="font-size:10px">Suburb</th><th class="th" style="font-size:10px">Priority</th><th class="th" style="font-size:10px">Recommended Slot</th><th class="th" style="font-size:10px">Installer</th><th class="th" style="font-size:10px">Match</th><th class="th" style="font-size:10px"></th></tr></thead><tbody>';
    topRecs.slice(0,15).forEach(function(r){
      var pr = SERVICE_PRIORITIES[r.svc.priority]||SERVICE_PRIORITIES.medium;
      var matchLabel = r.nearbyMatch ? '<span style="color:#22c55e;font-weight:700">\u2605 Same area</span>' : '<span style="color:#9ca3af">Different area</span>';
      var dayLabel = fmtShortDate(r.gap.date);
      var timeLabel = r.gap.startAfter <= 12 ? r.gap.startAfter + (r.gap.startAfter<12?'AM':'PM') : (r.gap.startAfter-12) + 'PM';
      recsHtml += '<tr>'
        +'<td class="td" style="font-weight:700;color:#c41230">'+r.svc.serviceNumber+'</td>'
        +'<td class="td">'+r.svc.contactName+'</td>'
        +'<td class="td">'+(r.svc.suburb||'')+'</td>'
        +'<td class="td"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+pr.bg+';color:'+pr.col+'">'+pr.label+'</span></td>'
        +'<td class="td">'+dayLabel+' \u00b7 after '+timeLabel+' \u00b7 '+r.gap.freeH+'h gap</td>'
        +'<td class="td"><div style="display:flex;align-items:center;gap:4px"><div style="width:16px;height:16px;border-radius:50%;background:'+r.gap.inst.colour+';color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center">'+(r.gap.inst.name||'?')[0]+'</div>'+r.gap.inst.name+'</div></td>'
        +'<td class="td">'+matchLabel+'</td>'
        +'<td class="td"><button onclick="updateService(\''+r.svc.id+'\',{scheduledDate:\''+r.gap.ds+'\',assignedTo:\''+r.gap.inst.id+'\',status:\'scheduled\'});addToast(\''+r.svc.serviceNumber+' booked with '+r.gap.inst.name+'\',\'success\');renderPage();" class="btn-r" style="font-size:10px;padding:3px 10px">Book</button></td></tr>';
    });
    recsHtml += '</tbody></table>';
  }
  recsHtml += '</div>';

  return '<div>'
    +'<div style="margin-bottom:14px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">\ud83d\udee0\ufe0f Install Openings for Service</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Find gaps in the install schedule to slot in service calls \u2014 batched by proximity</p></div>'
    +nav+kpi+grid+recsHtml
    +'</div>';
}

