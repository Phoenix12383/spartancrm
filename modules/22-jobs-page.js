// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 22-jobs-page.js
// Extracted from original index.html lines 14450-15285
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// JOBS PAGE — List + Detail
// ══════════════════════════════════════════════════════════════════════════════

function renderJobsPage() {
  var jid = getState().jobDetailId;
  if (jid) return renderJobDetail();

  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var branch = getState().branch;
  var search = getState().jobListSearch || '';
  var statusFilter = getState().jobListFilter || 'All';
  var heldOnly = getState().jobShowHeldOnly || false;
  var sortCol = getState().jobSortCol || 'created';
  var sortDir = getState().jobSortDir || 'desc';
  var jobFields = getState().jobFields || [];
  var jobFieldValues = getState().jobFieldValues || {};

  // ── Column system ─────────────────────────────────────────────────────────
  var ALL_COLS = [
    {id:'jobNumber', label:'Job #', default:true, w:'100px'},
    {id:'client', label:'Client', default:true},
    {id:'suburb', label:'Suburb', default:true},
    {id:'branch', label:'Branch', default:true, w:'60px'},
    {id:'status', label:'Status', default:true},
    {id:'val', label:'Value', default:true, w:'100px', align:'right'},
    {id:'cmDate', label:'CM Date', default:true, w:'95px'},
    {id:'installDate', label:'Install Date', default:true, w:'95px'},
    {id:'age', label:'Age', default:true, w:'50px'},
    {id:'payMethod', label:'Payment', default:true, w:'70px'},
    {id:'frames', label:'Frames', default:false, w:'60px', align:'right'},
    {id:'street', label:'Street', default:false},
    {id:'state', label:'State', default:false, w:'50px'},
    {id:'postcode', label:'Postcode', default:false, w:'70px'},
    {id:'installTime', label:'Install Time', default:false, w:'90px'},
    {id:'crew', label:'Crew', default:false},
    {id:'phone', label:'Phone', default:false, w:'110px'},
    {id:'email', label:'Email', default:false},
    {id:'legalEntity', label:'Legal Entity', default:false},
    {id:'orderType', label:'Order Type', default:false, w:'80px'},
    {id:'created', label:'Created', default:false, w:'95px'},
  ];
  // Add custom fields as available columns
  jobFields.forEach(function(f){
    ALL_COLS.push({id:'cf_'+f.id, label:f.label, default:false, isCustom:true, fieldId:f.id});
  });

  // Per-user column preferences
  var userId = (getCurrentUser()||{id:'default'}).id;
  var colKey = 'spartan_job_cols_'+userId;
  var savedCols;
  try { savedCols = JSON.parse(localStorage.getItem(colKey)); } catch(e){ savedCols = null; }
  if (!savedCols || !Array.isArray(savedCols)) {
    savedCols = ALL_COLS.map(function(c,i){return {id:c.id, visible:!!c.default, ord:i};});
    localStorage.setItem(colKey, JSON.stringify(savedCols));
  }
  // Merge any new columns not in saved prefs
  ALL_COLS.forEach(function(c){
    if (!savedCols.find(function(s){return s.id===c.id;})) {
      savedCols.push({id:c.id, visible:false, ord:savedCols.length});
    }
  });
  // Remove any saved cols that no longer exist
  savedCols = savedCols.filter(function(s){return ALL_COLS.find(function(c){return c.id===s.id;});});

  var visibleCols = savedCols.filter(function(s){return s.visible;}).sort(function(a,b){return a.ord-b.ord;});
  var colDefs = visibleCols.map(function(vc){return ALL_COLS.find(function(c){return c.id===vc.id;});}).filter(Boolean);

  // Branch filter
  if (branch && branch !== 'all') jobs = jobs.filter(function(j){ return j.branch === branch; });
  if (statusFilter !== 'All') jobs = jobs.filter(function(j){ return j.status === statusFilter; });
  if (heldOnly) jobs = jobs.filter(function(j){ return j.hold || j.status === 'c4_date_change_hold'; });
  if (search) {
    var q = search.toLowerCase();
    jobs = jobs.filter(function(j){
      var c = contacts.find(function(ct){ return ct.id === j.contactId; });
      var cName = c ? (c.fn + ' ' + c.ln).toLowerCase() : '';
      return (j.jobNumber||'').toLowerCase().indexOf(q) >= 0 || cName.indexOf(q) >= 0 || (j.suburb||'').toLowerCase().indexOf(q) >= 0 || (j.street||'').toLowerCase().indexOf(q) >= 0;
    });
  }

  // Sort
  var getContactName = function(j) { var c = contacts.find(function(ct){ return ct.id === j.contactId; }); return c ? (c.fn + ' ' + c.ln).toLowerCase() : ''; };
  jobs.sort(function(a,b){
    var va, vb;
    if (sortCol === 'jobNumber') { va = a.jobNumber||''; vb = b.jobNumber||''; }
    else if (sortCol === 'client') { va = getContactName(a); vb = getContactName(b); }
    else if (sortCol === 'suburb') { va = (a.suburb||'').toLowerCase(); vb = (b.suburb||'').toLowerCase(); }
    else if (sortCol === 'branch') { va = a.branch||''; vb = b.branch||''; }
    else if (sortCol === 'status') { va = a.status||''; vb = b.status||''; }
    else if (sortCol === 'val') { va = Number(a.val)||0; vb = Number(b.val)||0; }
    else if (sortCol === 'cmDate') { va = a.cmBookedDate||''; vb = b.cmBookedDate||''; }
    else if (sortCol === 'installDate') { va = a.installDate||''; vb = b.installDate||''; }
    else if (sortCol === 'age') { va = a.created||''; vb = b.created||''; }
    else { va = a.created||''; vb = b.created||''; }
    if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
    var cmp = String(va).localeCompare(String(vb));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  var now = new Date();

  // KPI strip
  var allBranchJobs = getState().jobs || [];
  if (branch && branch !== 'all') allBranchJobs = allBranchJobs.filter(function(j){ return j.branch === branch; });
  var totalJobs = allBranchJobs.length;
  var cmPending = allBranchJobs.filter(function(j){ return j.status === 'a_check_measure'; }).length;
  var inProduction = allBranchJobs.filter(function(j){ return ['d3_cutting','d4_milling_steel_welding','d5_hardware_revealing'].indexOf(j.status) >= 0; }).length;
  var installing = allBranchJobs.filter(function(j){ return j.status === 'f_installing'; }).length;
  var pipelineVal = allBranchJobs.reduce(function(s,j){ return s + (j.val||0); }, 0);

  function kpi(label, val, col) {
    return '<div class="card" style="flex:1;min-width:130px;padding:14px 18px">'
      + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">' + label + '</div>'
      + '<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + (col||'#1a1a1a') + ';margin-top:4px">' + val + '</div></div>';
  }

  function stripPrefix(label) { return label.replace(/^[a-iA-I]\.?\d*\.?\s*/,'').trim(); }

  // Cell renderer
  function cellVal(col, j) {
    var c = contacts.find(function(ct){return ct.id===j.contactId;});
    var st = getJobStatusObj(j.status);
    var installers = getInstallers();
    switch(col.id) {
      case 'jobNumber': return '<span style="font-weight:700;color:#c41230">'+(j.jobNumber||'\u2014')+'</span>';
      case 'client': return c ? c.fn+' '+c.ln : '\u2014';
      case 'suburb': return j.suburb||'\u2014';
      case 'branch': return j.branch||'\u2014';
      case 'status': return '<span class="bdg" style="background:'+st.col+'20;color:'+st.col+';border:1px solid '+st.col+'40;font-size:11px">'+stripPrefix(st.label)+'</span>';
      case 'val': return '$'+Number(j.val||0).toLocaleString();
      case 'cmDate': return j.cmBookedDate||'\u2014';
      case 'installDate': return j.installDate||'\u2014';
      case 'age': return j.created?Math.floor((now-new Date(j.created))/86400000)+'d':'\u2014';
      case 'payMethod': return j.paymentMethod==='zip'?'<span style="background:#faf5ff;color:#7c3aed;font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;border:1px solid #c4b5fd">ZIP</span>':'<span style="background:#f0fdf4;color:#15803d;font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;border:1px solid #86efac">COD</span>';
      case 'frames': return (j.windows||[]).length;
      case 'street': return j.street||'';
      case 'state': return j.state||'';
      case 'postcode': return j.postcode||'';
      case 'installTime': return j.installTime?formatTime12(j.installTime):'\u2014';
      case 'crew': var crew=(j.installCrew||[]).map(function(cid){var inst=installers.find(function(i){return i.id===cid;});return inst?inst.name.split(' ')[0]:'';}).filter(Boolean); return crew.join(', ')||'\u2014';
      case 'phone': return c?c.phone||'':'';
      case 'email': return c?'<span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;display:inline-block">'+(c.email||'')+'</span>':'';
      case 'legalEntity': return j.legalEntity||'';
      case 'orderType': return j.orderSuffix==='S'?'Service':'Original';
      case 'created': return j.created?j.created.slice(0,10):'';
      default:
        if (col.isCustom && col.fieldId) {
          var fv = (jobFieldValues[j.id]||{})[col.fieldId];
          return fv!=null?fv:'\u2014';
        }
        return '';
    }
  }

  // Status dropdown
  var statusDropdown = '<select class="sel" style="font-size:12px;padding:6px 12px;min-width:200px" onchange="setState({jobListFilter:this.value})">'
    + '<option value="All"' + (statusFilter==='All'?' selected':'') + '>All Statuses</option>'
    + JOB_STATUSES.map(function(s){ var count=allBranchJobs.filter(function(j){return j.status===s.key;}).length; return '<option value="'+s.key+'"'+(statusFilter===s.key?' selected':'')+'>'+stripPrefix(s.label)+(count?' ('+count+')':'')+'</option>'; }).join('')+'</select>';

  // Sortable header
  function sortTh(col) {
    var arrow = sortCol===col.id?(sortDir==='asc'?' \u25b2':' \u25bc'):'';
    return '<th class="th" draggable="true" data-colid="'+col.id+'" ondragstart="event.dataTransfer.setData(\'text/plain\',\''+col.id+'\')" ondragover="event.preventDefault();this.style.borderLeft=\'2px solid #c41230\'" ondragleave="this.style.borderLeft=\'none\'" ondrop="event.preventDefault();this.style.borderLeft=\'none\';reorderJobCol(event.dataTransfer.getData(\'text/plain\'),\''+col.id+'\')" style="cursor:pointer;user-select:none;'+(col.align?'text-align:'+col.align+';':'')+(col.w?'width:'+col.w+';':'')+'" onclick="var d=getState();setState({jobSortCol:\''+col.id+'\',jobSortDir:(d.jobSortCol===\''+col.id+'\'&&d.jobSortDir===\'asc\')?\'desc\':\'asc\'})">'+col.label+'<span style="color:#c41230;font-size:10px">'+arrow+'</span></th>';
  }

  // Table rows — with production status bar on left
  var factoryOrders = getFactoryOrders();
  var rowsHtml = jobs.map(function(j){
    // Check production readiness
    var fo = factoryOrders.find(function(o){return o.crmJobId===j.id||o.jid===j.jobNumber;});
    var warnings = [];
    var barCol = '#e5e7eb'; // default grey
    if (j.productionStatus || fo) {
      var glassOk = fo && fo.glassStatus && fo.glassStatus !== 'not_ordered';
      var profileOk = fo && fo.profileStatus && fo.profileStatus !== 'not_ordered';
      var matDateOk = fo && fo.materialDeliveryDate;
      if (!glassOk) warnings.push('\ud83e\ude9f Glass');
      if (!profileOk) warnings.push('\ud83d\udce6 Profiles');
      if (!matDateOk) warnings.push('\ud83d\udcc5 Mat. Date');
      if (warnings.length === 0) barCol = '#22c55e';
      else if (warnings.length <= 1) barCol = '#f59e0b';
      else barCol = '#ef4444';
    } else if (j.finalSignedAt && !j.productionStatus) {
      warnings.push('\ud83c\udfed Not in factory');
      barCol = '#9ca3af';
    }
    var warningHtml = warnings.length > 0 ? '<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:2px">' + warnings.map(function(w){return '<span style="font-size:8px;font-weight:700;color:#fff;background:'+(barCol==='#ef4444'?'#ef4444':'#f59e0b')+';padding:0 4px;border-radius:3px;white-space:nowrap">'+w+'</span>';}).join('') + '</div>' : '';

    return '<tr onclick="setState({jobDetailId:\''+j.id+'\'})" style="cursor:pointer;border-left:4px solid '+barCol+'" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'">'
      +colDefs.map(function(col,ci){
        var val = cellVal(col,j);
        // Append warnings to the first column
        if (ci === 0 && warningHtml) val += warningHtml;
        return '<td class="td" style="'+(col.align?'text-align:'+col.align+';':'')+'">'+val+'</td>';
      }).join('')+'</tr>';
  }).join('');

  // Column settings dropdown
  var colSettings = '<div style="position:relative;display:inline-block">'
    +'<button onclick="document.getElementById(\'jobColDrop\').style.display=document.getElementById(\'jobColDrop\').style.display===\'block\'?\'none\':\'block\'" class="btn-g" style="font-size:12px;padding:6px 12px;gap:4px">'+Icon({n:'settings',size:13})+' Columns</button>'
    +'<div id="jobColDrop" style="display:none;position:absolute;right:0;top:calc(100%+4px);background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:100;padding:12px;width:280px;max-height:400px;overflow-y:auto">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:8px">Show/Hide Columns</div>'
    +'<div style="font-size:10px;color:#9ca3af;margin-bottom:10px">Drag column headers to reorder</div>';
  savedCols.sort(function(a,b){return a.ord-b.ord;}).forEach(function(sc){
    var def = ALL_COLS.find(function(c){return c.id===sc.id;});
    if (!def) return;
    colSettings += '<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:6px;cursor:pointer;font-size:12px" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'transparent\'">'
      +'<input type="checkbox" '+(sc.visible?'checked':'')+' onchange="toggleJobCol(\''+sc.id+'\',this.checked)" style="accent-color:#c41230;flex-shrink:0">'
      +'<span style="flex:1">'+def.label+(def.isCustom?' <span style="font-size:9px;color:#9ca3af">(custom)</span>':'')+'</span></label>';
  });
  colSettings += '<div style="border-top:1px solid #f0f0f0;margin-top:8px;padding-top:8px">'
    +'<button onclick="resetJobCols()" class="btn-g" style="font-size:11px;padding:4px 10px;width:100%;justify-content:center">Reset to Default</button></div></div></div>';

  return '<div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
    +'<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">Jobs</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Operational workflow from check measure to installation</p></div></div>'
    +'<div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">'
    +kpi('Total Jobs',totalJobs,'#1a1a1a')+kpi('CM Pending',cmPending,'#3b82f6')+kpi('In Production',inProduction,'#a855f7')+kpi('Installing',installing,'#6366f1')+kpi('Pipeline Value','$'+Math.round(pipelineVal).toLocaleString(),'#c41230')+'</div>'
    +'<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">'
    +statusDropdown
    +'<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" '+(heldOnly?'checked':'')+' onchange="setState({jobShowHeldOnly:this.checked})" style="accent-color:#c41230"> Held only</label>'
    +'<div style="margin-left:auto;display:flex;gap:8px;align-items:center">'
    +'<input id="jobSearchInput" class="inp" placeholder="Search jobs\u2026" value="'+search.replace(/"/g,'&quot;')+'" oninput="setState({jobListSearch:this.value})" style="width:220px;font-size:13px">'
    +colSettings+'</div></div>'
    +'<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>'
    +colDefs.map(function(col){return sortTh(col);}).join('')
    +'</tr></thead><tbody>'+(rowsHtml||'<tr><td class="td" colspan="'+colDefs.length+'" style="text-align:center;color:#9ca3af;padding:40px">No jobs found.</td></tr>')+'</tbody></table></div></div>';
}

// Column management helpers
function toggleJobCol(colId, visible) {
  var userId = (getCurrentUser()||{id:'default'}).id;
  var key = 'spartan_job_cols_'+userId;
  try {
    var cols = JSON.parse(localStorage.getItem(key)||'[]');
    cols = cols.map(function(c){return c.id===colId?Object.assign({},c,{visible:visible}):c;});
    localStorage.setItem(key, JSON.stringify(cols));
  } catch(e){}
  renderPage();
}
function reorderJobCol(draggedId, droppedOnId) {
  if (draggedId===droppedOnId) return;
  var userId = (getCurrentUser()||{id:'default'}).id;
  var key = 'spartan_job_cols_'+userId;
  try {
    var cols = JSON.parse(localStorage.getItem(key)||'[]');
    var dragIdx = cols.findIndex(function(c){return c.id===draggedId;});
    var dropIdx = cols.findIndex(function(c){return c.id===droppedOnId;});
    if (dragIdx<0||dropIdx<0) return;
    var item = cols.splice(dragIdx,1)[0];
    cols.splice(dropIdx,0,item);
    cols.forEach(function(c,i){c.ord=i;});
    localStorage.setItem(key, JSON.stringify(cols));
  } catch(e){}
  renderPage();
}
function resetJobCols() {
  var userId = (getCurrentUser()||{id:'default'}).id;
  localStorage.removeItem('spartan_job_cols_'+userId);
  renderPage();
}

// ── Job Detail Page (stub for Phase 3+) ─────────────────────────────────────
function renderJobDetail() {
  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var job = jobs.find(function(j){ return j.id === getState().jobDetailId; });
  if (!job) { setState({jobDetailId:null}); return renderJobsPage(); }

  var contact = contacts.find(function(c){ return c.id === job.contactId; });
  var cName = contact ? contact.fn + ' ' + contact.ln : '—';
  var st = getJobStatusObj(job.status);
  var tab = getState().jobDetailTab || 'overview';

  // Status stepper — single horizontal scrollable row
  var _stepperGroupKeys = ['onboarding','finance','order','material','production','dispatch','install'];
  var _curIdx = JOB_STATUSES.findIndex(function(x){ return x.key === job.status; });
  var stepperHtml = JOB_STATUSES.filter(function(s){ return _stepperGroupKeys.indexOf(s.group) >= 0; }).map(function(s, i, arr){
    var active = s.key === job.status;
    var thisIdx = JOB_STATUSES.findIndex(function(x){ return x.key === s.key; });
    var passed = thisIdx < _curIdx;
    var check = canTransition(job, s.key);
    var locked = !check.ok && !active && !passed;
    var bg = active ? s.col : passed ? s.col + '22' : '#f3f4f6';
    var col = active ? '#fff' : passed ? s.col : locked ? '#d1d5db' : '#6b7280';
    var border = active ? s.col : passed ? s.col + '80' : 'transparent';
    var cursor = (active || locked) ? 'default' : 'pointer';
    var onclick = active ? '' : locked ? '' : 'transitionJobStatus(\'' + job.id + '\',\'' + s.key + '\',\'\')';
    var tip = locked ? (check.reason||'') : s.label;
    var icon = active ? '● ' : passed ? '✓ ' : locked ? '🔒 ' : '';
    var arrow = i < arr.length - 1 ? '<span style="color:#d1d5db;flex-shrink:0;font-size:12px;align-self:center">›</span>' : '';
    return '<div onclick="'+onclick+'" title="'+tip.replace(/"/g,'&quot;')+'" style="display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:'+(active?600:400)+';background:'+bg+';color:'+col+';border:1.5px solid '+border+';cursor:'+cursor+';white-space:nowrap;flex-shrink:0">'+icon+s.label+'</div>' + arrow;
  }).join('');

  // Tabs
  var tabs = [
    {key:'overview', label:'Overview'},
    {key:'design', label:'Original Design'},
    {key:'check_measure', label:'Check Measure'},
    {key:'final_design', label:'Final Design'},
    {key:'progress_claims', label:'Progress Claims'},
    {key:'installation', label:'Installation'},
    {key:'costing', label:'Job Costing'},
    {key:'files', label:'Files'},
    {key:'audit_log', label:'Audit Log'},
  ];
  var tabsHtml = tabs.map(function(t){
    var on = tab === t.key;
    return '<button onclick="setState({jobDetailTab:\'' + t.key + '\'})" style="padding:8px 16px;border:none;border-bottom:2px solid ' + (on?'#c41230':'transparent') + ';background:none;font-size:13px;font-weight:' + (on?700:500) + ';color:' + (on?'#c41230':'#6b7280') + ';cursor:pointer;font-family:inherit;position:relative">'
      + t.label + (t.coming ? ' <span style="font-size:9px;background:#f3f4f6;color:#9ca3af;padding:1px 6px;border-radius:8px;margin-left:4px">Soon</span>' : '') + '</button>';
  }).join('');

  // Tab content
  var tabContent = '';
  if (tab === 'overview') {
    tabContent = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'
      + '<div class="card" style="padding:20px"><h3 style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;margin:0 0 12px">Site Conditions</h3>'
      + '<div style="display:grid;gap:10px;font-size:13px">'
      + '<div><span style="color:#6b7280">Access Notes:</span> ' + (job.accessNotes||'<span style="color:#d1d5db">None specified</span>') + '</div>'
      + '<div><span style="color:#6b7280">Parking Notes:</span> ' + (job.parkingNotes||'<span style="color:#d1d5db">None specified</span>') + '</div>'
      + (job.renderWarning ? '<div style="color:#ef4444;font-weight:600">⚠️ Render warning — site has rendered brick</div>' : '')
      + '</div></div>'
      + '<div class="card" style="padding:20px"><h3 style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;margin:0 0 12px">Windows Summary</h3>'
      + '<div style="font-size:13px">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6b7280">Total windows/doors</span><strong>' + (job.windows||[]).length + '</strong></div>'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6b7280">Measured</span><strong>' + (job.windows||[]).filter(function(w){return w.widthMm>0&&w.heightMm>0;}).length + '</strong></div>'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6b7280">CM Status</span>' + (job.cmCompletedAt ? '<span style="color:#22c55e;font-weight:600">✅ Completed</span>' : '<span style="color:#f59e0b;font-weight:600">Pending</span>') + '</div>'
      + (job.cmBookedDate ? '<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">CM Booked</span><span>' + job.cmBookedDate + (job.cmBookedTime ? ' ' + job.cmBookedTime : '') + '</span></div>' : '')
      + '</div></div>'
      + '</div>'
      // Tags
      + '<div class="card" style="padding:20px;margin-top:16px"><h3 style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;margin:0 0 12px">Notes</h3>'
      + '<textarea class="inp" rows="4" style="width:100%;font-size:13px;resize:vertical" placeholder="General job notes…" onblur="updateJobField(\'' + job.id + '\',\'notes\',this.value)">' + (job.notes||'') + '</textarea>'
      + '</div>';
  } else if (tab === 'design') {
    // ORIGINAL DESIGN — locked after job creation, password required to edit
    var hasCadData = job.cadData && job.cadData.projectItems && job.cadData.projectItems.length > 0;
    var frames = hasCadData ? job.cadData.projectItems : [];
    var cu = getCurrentUser() || {};
    var isManager = cu.role === 'admin' || cu.role === 'sales_manager';

    tabContent = '<div class="card" style="padding:20px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      +'<div><h4 style="font-size:16px;font-weight:700;margin:0">\ud83d\udd12 Original Design <span style="font-size:12px;font-weight:400;color:#6b7280">(Locked)</span></h4>'
      +'<p style="color:#6b7280;font-size:12px;margin:4px 0 0">Approved design from deal. Changes require sales manager password.</p></div>'
      +'<div style="display:flex;gap:8px">'
      +'<button onclick="openCadDesigner(\'job\',\''+job.id+'\',\'design\')" class="btn-w" style="font-size:12px;gap:4px">\ud83d\udc41 View in CAD</button>'
      +(isManager ? '<button onclick="openCadDesigner(\'job\',\''+job.id+'\',\'design\')" class="btn-r" style="font-size:12px;gap:4px">\ud83d\udd13 Edit Design (Manager)</button>' : '<button onclick="var pw=prompt(\'Enter sales manager password to edit:\');if(pw===\'spartan2026\'){openCadDesigner(\'job\',\''+job.id+'\',\'design\');}else if(pw!==null){addToast(\'Incorrect password\',\'error\');}" class="btn-w" style="font-size:12px;gap:4px;color:#9ca3af">\ud83d\udd10 Request Edit Access</button>')
      +'</div></div>';

    if (hasCadData) {
      tabContent += '<div style="padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;margin-bottom:14px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center">'
        +'<div><span style="font-size:13px;font-weight:700;color:#15803d">\u2705 Design Approved</span>'
        +'<span style="font-size:12px;color:#6b7280;margin-left:8px">'+frames.length+' frames \u00b7 $'+Math.round(job.cadData.totalPrice||0).toLocaleString()+' inc GST</span></div>'
        +'<span style="font-size:11px;color:#9ca3af">Saved: '+(job.cadData.savedAt?new Date(job.cadData.savedAt).toLocaleDateString('en-AU'):'\u2014')+'</span></div></div>';

      tabContent += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Frame</th><th class="th">Type</th><th class="th">Size (mm)</th><th class="th">Colour (Ext)</th><th class="th">Colour (Int)</th><th class="th">Glass</th><th class="th">Panels</th><th class="th">Fly Screen</th></tr></thead><tbody>';
      var PLABELS = {awning_window:'Awning',casement_window:'Casement',sliding_window:'Sliding',fixed_window:'Fixed',tilt_turn_window:'Tilt & Turn',double_hung_window:'Double Hung',bifold_door:'Bifold Door',sliding_door:'Sliding Door',french_door:'French Door',entry_door:'Entry Door',stacker_door:'Stacker Door'};
      frames.forEach(function(f,i){
        tabContent += '<tr style="'+(i%2?'background:#fafafa':'')+'">'
          +'<td class="td" style="font-weight:700;color:#c41230">'+(f.name||'W'+(i+1))+'</td>'
          +'<td class="td">'+(PLABELS[f.productType]||f.productType||'')+'</td>'
          +'<td class="td" style="font-family:monospace">'+(f.width||0)+' \u00d7 '+(f.height||0)+'</td>'
          +'<td class="td">'+(f.colour||'').replace(/_/g,' ')+'</td>'
          +'<td class="td">'+(f.colourInt||'').replace(/_/g,' ')+'</td>'
          +'<td class="td">'+(f.glassSpec||'').replace(/_/g,' ')+'</td>'
          +'<td class="td">'+((f.gridCols||1)*(f.gridRows||1))+'</td>'
          +'<td class="td">'+(f.showFlyScreen?'\u2705':'\u2014')+'</td></tr>';
      });
      tabContent += '</tbody></table>';
    } else {
      tabContent += '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">\ud83c\udfae No design data. Design was not created in Spartan CAD for this deal.</div>';
    }
    if (job.dealId) {
      tabContent += '<div style="margin-top:14px;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;color:#0369a1">\ud83d\udd17 Inherited from <a href="#" onclick="event.preventDefault();setState({crmMode:\'sales\',page:\'deals\',dealDetailId:\''+job.dealId+'\'})" style="color:#0369a1;font-weight:600">original deal</a>. Any authorised changes will update the job value and be logged.</div>';
    }
    tabContent += '</div>';

  } else if (tab === 'check_measure') {
    // CHECK MEASURE — installer opens Spartan CAD in survey mode, fills fields, completes
    var cmDone = !!job.cmCompletedAt;
    var hasSurvey = job.cadSurveyData && job.cadSurveyData.projectItems && job.cadSurveyData.projectItems.length > 0;
    var cmFiles = getJobFiles(job.id).filter(function(f){return f.category==='check_measure';});
    var hasCadDesign = job.cadData && job.cadData.projectItems && job.cadData.projectItems.length > 0;

    tabContent = '<div class="card" style="padding:20px;margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      +'<div><h4 style="font-size:16px;font-weight:700;margin:0">\ud83d\udccf Check Measure</h4>'
      +'<p style="color:#6b7280;font-size:12px;margin:4px 0 0">Installer opens CAD on-site, fills tolerances and obstructions, then completes</p></div>'
      +'<div style="display:flex;gap:8px">';

    if (!cmDone) {
      tabContent += '<button onclick="openCadDesigner(\'job\',\''+job.id+'\',\'survey\')" class="btn-r" style="font-size:13px;padding:8px 20px;gap:6px">\ud83d\udccf '+(!hasSurvey?'Start Check Measure':'Continue Check Measure')+'</button>';
    }
    tabContent += '</div></div>';

    // Status & scheduling
    tabContent += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">'
      +'<div style="padding:14px;border-radius:10px;text-align:center;'+(cmDone?'background:#f0fdf4;border:1px solid #86efac':hasSurvey?'background:#eff6ff;border:1px solid #93c5fd':'background:#fef3c7;border:1px solid #fde68a')+'">'
      +'<div style="font-size:11px;font-weight:700;color:'+(cmDone?'#15803d':hasSurvey?'#1d4ed8':'#92400e')+'">'+(cmDone?'\u2705 CM Completed':hasSurvey?'\ud83d\udccf Survey In Progress':'\u23f3 Not Started')+'</div>'
      +(cmDone?'<div style="font-size:11px;color:#6b7280;margin-top:2px">'+new Date(job.cmCompletedAt).toLocaleDateString('en-AU')+'</div>':'')+'</div>'
      +'<div style="padding:14px;border-radius:10px;text-align:center;'+(cmFiles.length>0?'background:#f0fdf4;border:1px solid #86efac':'background:#f9fafb;border:1px solid #e5e7eb')+'">'
      +'<div style="font-size:11px;font-weight:700;color:'+(cmFiles.length>0?'#15803d':'#6b7280')+'">'+(cmFiles.length>0?'\u2705 CM File Uploaded':'\u23f3 No File Yet')+'</div></div>'
      +'<div style="padding:14px;border-radius:10px;text-align:center;background:#f9fafb;border:1px solid #e5e7eb">'
      +'<div style="font-size:11px;font-weight:700;color:#6b7280">Booked: '+(job.cmBookedDate||'\u2014')+'</div>'
      +(job.cmBookedTime?'<div style="font-size:11px;color:#9ca3af">'+job.cmBookedTime+'</div>':'')
      +'</div></div>';

    // Scheduling fields
    tabContent += '<div class="card" style="padding:16px;margin-bottom:14px">'
      +'<h5 style="font-size:13px;font-weight:700;margin:0 0 10px">Scheduling</h5>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'
      +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Booked Date</label>'
      +'<input type="date" class="inp" value="'+(job.cmBookedDate||'')+'" onchange="updateJobField(\''+job.id+'\',\'cmBookedDate\',this.value)"></div>'
      +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Time</label>'
      +'<select class="sel" onchange="updateJobField(\''+job.id+'\',\'cmBookedTime\',this.value)">'
      +'<option value="">Select\u2026</option>'
      +['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','13:00','13:30','14:00','14:30','15:00','15:30','16:00'].map(function(t){return '<option value="'+t+'"'+(job.cmBookedTime===t?' selected':'')+'>'+formatTime12(t)+'</option>';}).join('')
      +'</select></div>'
      +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Assigned To</label>'
      +'<select class="sel" onchange="updateJobField(\''+job.id+'\',\'cmAssignedTo\',this.value)">'
      +'<option value="">Unassigned</option>'
      +getInstallers().map(function(u){return '<option value="'+u.id+'"'+(job.cmAssignedTo===u.id?' selected':'')+'>'+u.name+'</option>';}).join('')
      +'</select></div></div></div>';

    // Site notes
    tabContent += '<div class="card" style="padding:16px;margin-bottom:14px">'
      +'<h5 style="font-size:13px;font-weight:700;margin:0 0 10px">Site Notes</h5>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
      +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Access Notes</label>'
      +'<textarea class="inp" rows="2" style="font-size:12px;resize:vertical" onblur="updateJobField(\''+job.id+'\',\'accessNotes\',this.value)">'+(job.accessNotes||'')+'</textarea></div>'
      +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Parking Notes</label>'
      +'<textarea class="inp" rows="2" style="font-size:12px;resize:vertical" onblur="updateJobField(\''+job.id+'\',\'parkingNotes\',this.value)">'+(job.parkingNotes||'')+'</textarea></div></div></div>';

    // Survey data preview (if partially done)
    if (hasSurvey && !cmDone) {
      var sf = job.cadSurveyData.projectItems;
      tabContent += '<div class="card" style="padding:16px;margin-bottom:14px;border-left:3px solid #3b82f6">'
        +'<div style="font-size:13px;font-weight:700;margin-bottom:8px">\ud83d\udccf Survey In Progress ('+sf.length+' frames measured)</div>'
        +'<div style="font-size:12px;color:#6b7280">Last saved: '+new Date(job.cadSurveyData.savedAt).toLocaleDateString('en-AU')+'. Continue the check measure to complete.</div></div>';
    }

    if (!cmDone) {
      tabContent += '<div style="padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1d4ed8;margin-bottom:14px">'
        +'ℹ️ Save the check measure in Spartan CAD to automatically generate the CM file and issue the 45% invoice.</div>';
    }

    // Completed CM files
    if (cmFiles.length > 0) {
      tabContent += '<div class="card" style="padding:16px"><h5 style="font-size:13px;font-weight:700;margin:0 0 10px">\ud83d\udcc1 Check Measure Files</h5>';
      cmFiles.forEach(function(f){
        tabContent += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f9fafb"><a href="'+f.dataUrl+'" target="_blank" download="'+f.name+'" style="color:#3b82f6;text-decoration:none;font-weight:600;font-size:12px">\ud83d\udcce '+f.name+'</a><span style="font-size:10px;color:#9ca3af">'+f.uploadedBy+' \u00b7 '+new Date(f.uploadedAt).toLocaleDateString('en-AU')+'</span></div>';
      });
      tabContent += '</div>';
    }
    tabContent += '</div>';

  } else if (tab === 'final_design') {
    // FINAL DESIGN — Step 5 §5.2 (spec §4.4). Three states: Ready (CM done,
    // no cadFinalData) / In Progress (cadFinalData, no finalSignedAt) / Signed.
    // Final-mode CAD entry is role-gated to admin + sales_manager (spec §4.2).
    // Signing itself is still the legacy markFinalDesignSigned path — DocuSign
    // integration is Step 6.
    var cmDone = !!job.cmCompletedAt;
    var hasSurvey = job.cadSurveyData && job.cadSurveyData.projectItems && job.cadSurveyData.projectItems.length > 0;
    var hasFinal = job.cadFinalData && job.cadFinalData.projectItems && job.cadFinalData.projectItems.length > 0;
    var finalSigned = !!job.finalSignedAt;
    var cu = getCurrentUser() || {};
    var isManager = cu.role === 'admin' || cu.role === 'sales_manager';
    var surveyFrames = hasSurvey ? job.cadSurveyData.projectItems : [];

    tabContent = '<div class="card" style="padding:20px;margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      +'<div><h4 style="font-size:16px;font-weight:700;margin:0">\ud83d\udcdd Final Design & Sign-Off</h4>'
      +'<p style="color:#6b7280;font-size:12px;margin:4px 0 0">Sales Manager locks the final design from the check-measure data, client signs, then it goes to production</p></div></div>';

    // Pipeline status — updated to reflect the three-state model
    tabContent += '<div style="display:flex;gap:8px;margin-bottom:16px">';
    var steps = [
      {label:'CM Complete', done:cmDone, icon:'\ud83d\udccf'},
      {label:'Final Design', done:hasFinal, icon:'\ud83d\udd12'},
      {label:'Client Signature', done:finalSigned, icon:'\u270d\ufe0f'},
      {label:'To Installation', done:job.installDate, icon:'\ud83d\udee0\ufe0f'},
    ];
    steps.forEach(function(s,i){
      var stCol = s.done ? '#22c55e' : (i===0||(i>0&&steps[i-1].done)) ? '#3b82f6' : '#d1d5db';
      tabContent += '<div style="flex:1;padding:10px;border-radius:8px;text-align:center;background:'+stCol+'10;border:1.5px solid '+stCol+'40">'
        +'<div style="font-size:16px">'+s.icon+'</div>'
        +'<div style="font-size:11px;font-weight:700;color:'+stCol+';margin-top:2px">'+s.label+'</div>'
        +'<div style="font-size:10px;color:'+(s.done?'#22c55e':'#9ca3af')+'">'+(s.done?'\u2705 Done':'\u23f3 Pending')+'</div></div>';
      if (i < steps.length-1) tabContent += '<div style="display:flex;align-items:center;color:#d1d5db;font-size:18px">\u2192</div>';
    });
    tabContent += '</div>';

    if (!cmDone) {
      tabContent += '<div style="padding:30px;text-align:center;color:#9ca3af"><div style="font-size:36px;margin-bottom:8px">\u23f3</div>'
        +'<div style="font-size:14px;font-weight:600">Check measure not yet completed</div>'
        +'<div style="font-size:12px;margin-top:4px">The installer must complete the check measure first. Go to the Check Measure tab.</div></div>';
    } else {
      // Completed CM summary
      tabContent += '<div class="card" style="padding:16px;margin-bottom:14px;border-left:3px solid #22c55e">'
        +'<div style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:6px">\u2705 Check Measure Completed \u2014 '+new Date(job.cmCompletedAt).toLocaleDateString('en-AU')+'</div>';
      if (surveyFrames.length > 0) {
        tabContent += '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px"><thead><tr><th class="th" style="font-size:10px">Frame</th><th class="th" style="font-size:10px">Type</th><th class="th" style="font-size:10px">Measured Size</th><th class="th" style="font-size:10px">Colour</th><th class="th" style="font-size:10px">Glass</th></tr></thead><tbody>';
        var PLABELS2 = {awning_window:'Awning',casement_window:'Casement',sliding_window:'Sliding',fixed_window:'Fixed',tilt_turn_window:'Tilt & Turn',double_hung_window:'Double Hung',bifold_door:'Bifold Door',sliding_door:'Sliding Door',french_door:'French Door',entry_door:'Entry Door',stacker_door:'Stacker Door'};
        surveyFrames.forEach(function(f,i){
          tabContent += '<tr><td class="td" style="font-weight:700;color:#c41230">'+(f.name||'W'+(i+1))+'</td>'
            +'<td class="td">'+(PLABELS2[f.productType]||f.productType||'')+'</td>'
            +'<td class="td" style="font-family:monospace">'+(f.width||0)+' \u00d7 '+(f.height||0)+'</td>'
            +'<td class="td">'+(f.colour||'').replace(/_/g,' ')+'</td>'
            +'<td class="td">'+(f.glassSpec||'').replace(/_/g,' ')+'</td></tr>';
        });
        tabContent += '</tbody></table>';
      }
      tabContent += '</div>';

      // Step 5 §5.2: three-state Final Design block.
      if (finalSigned) {
        // STATE 3 — Final Design Signed (view-only)
        tabContent += '<div class="card" style="padding:16px;margin-bottom:14px;border-left:3px solid #22c55e">'
          +'<h5 style="font-size:13px;font-weight:700;margin:0 0 10px">\ud83d\udd12 Final Design Signed</h5>'
          +'<div style="padding:12px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px">'
          +'<div style="font-size:13px;font-weight:700;color:#15803d">\u2705 Client has signed the final design</div>'
          +'<div style="font-size:11px;color:#6b7280;margin-top:2px">Signed on '+new Date(job.finalSignedAt).toLocaleDateString('en-AU')+' \u00b7 '+(hasFinal?job.cadFinalData.projectItems.length+' frames':'')+'</div></div>'
          +'<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">'
          +'<button onclick="openCadDesigner(\'job\',\''+job.id+'\',\'final\')" class="btn-w" style="font-size:12px;gap:4px">\ud83d\udc41 View Signed Final Design</button>';
        if (job.finalSignedPdfUrl) {
          tabContent += '<button onclick="window.open(\''+job.finalSignedPdfUrl+'\',\'_blank\')" class="btn-w" style="font-size:12px;gap:4px">\ud83d\udcc4 View Signed PDF</button>';
        } else if (job.finalRenderedPdfUrl) {
          tabContent += '<button onclick="window.open(\''+job.finalRenderedPdfUrl+'\',\'_blank\')" class="btn-w" style="font-size:12px;gap:4px">\ud83d\udcc4 View Final PDF</button>';
        }
        tabContent += '<button onclick="pushJobToFactory(\''+job.id+'\');renderPage();" class="btn-r" style="font-size:13px;padding:8px 24px;gap:6px">\ud83c\udfed Push to Production</button>'
          +'<button onclick="setState({jobDetailTab:\'installation\'})" class="btn-w" style="font-size:13px;padding:8px 24px;gap:6px">\ud83d\udee0\ufe0f Installation Scheduling \u2192</button></div>'
          +'</div>';
      } else if (hasFinal) {
        // STATE 2 — Final Design In Progress (not yet signed)
        tabContent += '<div class="card" style="padding:16px;margin-bottom:14px;border-left:3px solid #3b82f6">'
          +'<h5 style="font-size:13px;font-weight:700;margin:0 0 10px">\ud83d\udd12 Final Design In Progress</h5>'
          +'<div style="padding:12px;background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;margin-bottom:12px">'
          +'<div style="font-size:13px;font-weight:700;color:#1d4ed8">'+job.cadFinalData.projectItems.length+' frames locked from Check Measure</div>'
          +'<div style="font-size:11px;color:#6b7280;margin-top:2px">Last saved: '+(job.cadFinalData.savedAt?new Date(job.cadFinalData.savedAt).toLocaleString('en-AU'):'\u2014')+'</div></div>';
        if (!isManager) {
          tabContent += '<div style="font-size:12px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;padding:10px 12px;border-radius:8px;margin-bottom:10px">\ud83d\udd12 Only admins and Sales Managers can edit the Final Design.</div>';
        }
        tabContent += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
        if (isManager) {
          tabContent += '<button onclick="openCadDesigner(\'job\',\''+job.id+'\',\'final\')" class="btn-r" style="font-size:13px;padding:8px 20px;gap:6px">\ud83d\udd12 Continue Final Design</button>';
        } else {
          tabContent += '<button onclick="openCadDesigner(\'job\',\''+job.id+'\',\'final\')" class="btn-w" style="font-size:12px;gap:4px">\ud83d\udc41 View Final Design</button>';
        }
        if (job.finalRenderedPdfUrl) {
          tabContent += '<button onclick="window.open(\''+job.finalRenderedPdfUrl+'\',\'_blank\')" class="btn-w" style="font-size:12px;gap:4px">\ud83d\udcc4 Preview Final PDF</button>';
        }
        tabContent += '</div>';
        // Signature sub-section (legacy markFinalDesignSigned button — DocuSign is Step 6)
        tabContent += '<div style="margin-top:14px;padding-top:12px;border-top:1px dashed #e5e7eb">'
          +'<h6 style="font-size:12px;font-weight:700;margin:0 0 6px;color:#374151">\u270d\ufe0f Client Signature</h6>'
          +'<div style="font-size:11px;color:#6b7280;margin-bottom:10px">Once the client has signed the final design, mark it as signed to advance the job to installation. <em>DocuSign integration is coming in Step 6.</em></div>'
          +'<button onclick="markFinalDesignSigned(\''+job.id+'\')" class="btn-r" style="font-size:13px;padding:8px 20px;gap:6px"'+(isManager?'':' disabled title="Manager only"')+'>\u270d\ufe0f Mark as Signed & Advance</button>'
          +'</div>'
          +'</div>';
      } else {
        // STATE 1 — Ready for Final Design (CM done, no cadFinalData yet)
        tabContent += '<div class="card" style="padding:16px;margin-bottom:14px;border-left:3px solid #3b82f6">'
          +'<h5 style="font-size:13px;font-weight:700;margin:0 0 10px">\ud83d\udd12 Ready for Final Design</h5>'
          +'<div style="font-size:12px;color:#374151;margin-bottom:12px;line-height:1.5">'
          +'The Check Measure is complete. A Sales Manager can now open CAD in <strong>Final Design mode</strong> to lock the design for client signature. '
          +'In this mode, dimensions are locked from the Check Measure \u2014 only colours, opening styles, and transom/mullion positions can be changed.'
          +'</div>';
        if (!isManager) {
          tabContent += '<div style="font-size:12px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;padding:10px 12px;border-radius:8px">\ud83d\udd12 Only admins and Sales Managers can start the Final Design. Ask a manager to take the next step.</div>';
        } else {
          tabContent += '<button onclick="openCadDesigner(\'job\',\''+job.id+'\',\'final\')" class="btn-r" style="font-size:13px;padding:8px 20px;gap:6px">\ud83d\udd12 Start Final Design</button>';
        }
        tabContent += '</div>';
      }
    }
    tabContent += '</div>';
  } else if (tab === 'costing') {
    var cs = calcJobCostSummary(job);
    var profitCol = cs.marginPct >= 40 ? '#22c55e' : cs.marginPct >= 20 ? '#f59e0b' : '#ef4444';

    // Summary cards
    tabContent = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">'
      +'<div class="card" style="padding:14px;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Job Value (ex GST)</div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px">$'+Math.round(cs.valExGst).toLocaleString()+'</div></div>'
      +'<div class="card" style="padding:14px;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Labour Cost</div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:#3b82f6;margin-top:4px">$'+Math.round(cs.totalLabour).toLocaleString()+'</div><div style="font-size:10px;color:#6b7280">'+cs.totalLabourHrs+'h worked</div></div>'
      +'<div class="card" style="padding:14px;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Materials</div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:#f59e0b;margin-top:4px">$'+Math.round(cs.totalMaterials).toLocaleString()+'</div></div>'
      +'<div class="card" style="padding:14px;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Total Cost</div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:4px">$'+Math.round(cs.totalCost).toLocaleString()+'</div></div>'
      +'<div class="card" style="padding:14px;text-align:center;border-left:3px solid '+profitCol+'"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Gross Profit</div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:'+profitCol+';margin-top:4px">$'+Math.round(cs.grossProfit).toLocaleString()+'</div><div style="font-size:10px;color:'+profitCol+';font-weight:700">'+cs.marginPct+'% margin</div></div>'
      +'</div>';

    // Profit bar
    var labPct = cs.valExGst>0?Math.round(cs.totalLabour/cs.valExGst*100):0;
    var matPct = cs.valExGst>0?Math.round(cs.totalMaterials/cs.valExGst*100):0;
    var addPct = cs.valExGst>0?Math.round(cs.totalAdditional/cs.valExGst*100):0;
    tabContent += '<div class="card" style="padding:14px;margin-bottom:16px"><div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:6px">Cost Breakdown</div>'
      +'<div style="display:flex;height:24px;border-radius:6px;overflow:hidden;background:#f3f4f6">'
      +(labPct>0?'<div style="width:'+labPct+'%;background:#3b82f6;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">Labour '+labPct+'%</div>':'')
      +(matPct>0?'<div style="width:'+matPct+'%;background:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">Materials '+matPct+'%</div>':'')
      +(addPct>0?'<div style="width:'+addPct+'%;background:#a855f7;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">Other '+addPct+'%</div>':'')
      +'<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:'+profitCol+'">Profit '+cs.marginPct+'%</div>'
      +'</div></div>';

    // ── Labour logs ─────────────────────────────────────────────────────────
    tabContent += '<div class="card" style="padding:16px;margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      +'<h4 style="font-size:14px;font-weight:700;margin:0">\ud83d\udc77 Labour Log <span style="font-weight:400;color:#9ca3af">('+cs.costs.labour.length+' entries)</span></h4></div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding:10px;background:#f9fafb;border-radius:8px">'
      +'<select class="sel" id="lab_inst" style="font-size:11px;padding:4px 6px">'
      +'<option value="">Installer</option>'
      +getInstallers().map(function(i){return '<option value="'+i.id+'">'+i.name+' ($'+(i.hourlyRate||45)+'/h)</option>';}).join('')
      +'</select>'
      +'<input type="date" class="inp" id="lab_date" value="'+new Date().toISOString().slice(0,10)+'" style="font-size:11px;padding:4px 6px;width:120px">'
      +'<input type="number" class="inp" id="lab_hrs" placeholder="Hours" step="0.5" style="font-size:11px;padding:4px 6px;width:65px">'
      +'<input type="number" class="inp" id="lab_ot" placeholder="OT hrs" step="0.5" value="0" style="font-size:11px;padding:4px 6px;width:65px">'
      +'<input type="number" class="inp" id="lab_travel" placeholder="Travel" step="0.5" value="0" style="font-size:11px;padding:4px 6px;width:65px">'
      +'<input class="inp" id="lab_notes" placeholder="Notes" style="font-size:11px;padding:4px 6px;flex:1">'
      +'<button onclick="var i=document.getElementById(\'lab_inst\').value;var d=document.getElementById(\'lab_date\').value;var h=parseFloat(document.getElementById(\'lab_hrs\').value)||0;var ot=parseFloat(document.getElementById(\'lab_ot\').value)||0;var tr=parseFloat(document.getElementById(\'lab_travel\').value)||0;var n=document.getElementById(\'lab_notes\').value;if(!i){addToast(\'Select installer\',\'error\');return;}if(!h&&!ot){addToast(\'Enter hours\',\'error\');return;}addLabourLog(\''+job.id+'\',i,d,\'\',\'\',h,ot,tr,n);renderPage();" class="btn-r" style="font-size:11px;padding:4px 12px">+ Log</button></div>';
    if (cs.costs.labour.length > 0) {
      tabContent += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th" style="font-size:10px">Date</th><th class="th" style="font-size:10px">Installer</th><th class="th" style="font-size:10px">Hours</th><th class="th" style="font-size:10px">OT</th><th class="th" style="font-size:10px">Travel</th><th class="th" style="font-size:10px">Rate</th><th class="th" style="font-size:10px;text-align:right">Cost</th><th class="th" style="font-size:10px"></th></tr></thead><tbody>';
      cs.costs.labour.forEach(function(l){
        tabContent += '<tr><td class="td">'+l.date+'</td><td class="td" style="font-weight:600">'+l.installerName+'</td><td class="td">'+l.regularHours+'h</td><td class="td">'+(l.overtimeHours||0)+'h</td><td class="td">'+(l.travelHours||0)+'h</td><td class="td">$'+l.hourlyRate+'/h</td><td class="td" style="text-align:right;font-weight:700">$'+l.labourCost.toFixed(2)+'</td><td class="td"><button onclick="removeLabourLog(\''+job.id+'\',\''+l.id+'\');renderPage()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:10px">\u2715</button></td></tr>';
      });
      tabContent += '<tr style="background:#f9fafb;font-weight:700"><td class="td" colspan="6">Total Labour</td><td class="td" style="text-align:right;color:#3b82f6">$'+cs.totalLabour.toFixed(2)+'</td><td class="td"></td></tr>';
      tabContent += '</tbody></table>';
    } else { tabContent += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">No labour logged yet</div>'; }
    tabContent += '</div>';

    // ── Material costs ──────────────────────────────────────────────────────
    tabContent += '<div class="card" style="padding:16px;margin-bottom:14px">'
      +'<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">\ud83e\uddf1 Material Costs <span style="font-weight:400;color:#9ca3af">('+cs.costs.materials.length+')</span></h4>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding:10px;background:#f9fafb;border-radius:8px">'
      +'<input class="inp" id="mat_desc" placeholder="Description" style="font-size:11px;padding:4px 6px;flex:1">'
      +'<input class="inp" id="mat_sup" placeholder="Supplier" style="font-size:11px;padding:4px 6px;width:100px">'
      +'<select class="sel" id="mat_cat" style="font-size:11px;padding:4px 6px"><option value="frames">Frames</option><option value="glass">Glass</option><option value="hardware">Hardware</option><option value="sealant">Sealant</option><option value="other">Other</option></select>'
      +'<input type="number" class="inp" id="mat_qty" placeholder="Qty" value="1" style="font-size:11px;padding:4px 6px;width:50px">'
      +'<input type="number" class="inp" id="mat_unit" placeholder="Unit $" step="0.01" style="font-size:11px;padding:4px 6px;width:75px">'
      +'<button onclick="var d=document.getElementById(\'mat_desc\').value;var s=document.getElementById(\'mat_sup\').value;var c=document.getElementById(\'mat_cat\').value;var q=parseFloat(document.getElementById(\'mat_qty\').value)||1;var u=parseFloat(document.getElementById(\'mat_unit\').value)||0;if(!d){addToast(\'Enter description\',\'error\');return;}addMaterialCost(\''+job.id+'\',d,s,c,q,u,\'\');renderPage();" class="btn-r" style="font-size:11px;padding:4px 12px">+ Add</button></div>';
    if (cs.costs.materials.length > 0) {
      tabContent += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th" style="font-size:10px">Item</th><th class="th" style="font-size:10px">Supplier</th><th class="th" style="font-size:10px">Category</th><th class="th" style="font-size:10px">Qty</th><th class="th" style="font-size:10px">Unit $</th><th class="th" style="font-size:10px;text-align:right">Total</th><th class="th" style="font-size:10px"></th></tr></thead><tbody>';
      cs.costs.materials.forEach(function(m){
        tabContent += '<tr><td class="td">'+m.description+'</td><td class="td">'+m.supplier+'</td><td class="td"><span class="bdg" style="font-size:9px">'+m.category+'</span></td><td class="td">'+m.qty+'</td><td class="td">$'+m.unitCost.toFixed(2)+'</td><td class="td" style="text-align:right;font-weight:700">$'+m.total.toFixed(2)+'</td><td class="td"><button onclick="removeMaterialCost(\''+job.id+'\',\''+m.id+'\');renderPage()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:10px">\u2715</button></td></tr>';
      });
      tabContent += '<tr style="background:#f9fafb;font-weight:700"><td class="td" colspan="5">Total Materials</td><td class="td" style="text-align:right;color:#f59e0b">$'+cs.totalMaterials.toFixed(2)+'</td><td class="td"></td></tr></tbody></table>';
    } else { tabContent += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">No materials logged yet</div>'; }
    tabContent += '</div>';

    // ── Additional costs ────────────────────────────────────────────────────
    tabContent += '<div class="card" style="padding:16px">'
      +'<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">\ud83d\udcb0 Additional Costs <span style="font-weight:400;color:#9ca3af">('+cs.costs.additional.length+')</span></h4>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding:10px;background:#f9fafb;border-radius:8px">'
      +'<input class="inp" id="add_desc" placeholder="Description" style="font-size:11px;padding:4px 6px;flex:1">'
      +'<select class="sel" id="add_cat" style="font-size:11px;padding:4px 6px"><option value="scaffolding">Scaffolding</option><option value="skip_bin">Skip Bin</option><option value="permit">Permit</option><option value="delivery">Delivery</option><option value="subcontractor">Subcontractor</option><option value="other">Other</option></select>'
      +'<input type="number" class="inp" id="add_amt" placeholder="Amount $" step="0.01" style="font-size:11px;padding:4px 6px;width:90px">'
      +'<button onclick="var d=document.getElementById(\'add_desc\').value;var c=document.getElementById(\'add_cat\').value;var a=parseFloat(document.getElementById(\'add_amt\').value)||0;if(!d){addToast(\'Enter description\',\'error\');return;}addAdditionalCost(\''+job.id+'\',d,c,a,\'\');renderPage();" class="btn-r" style="font-size:11px;padding:4px 12px">+ Add</button></div>';
    if (cs.costs.additional.length > 0) {
      tabContent += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th" style="font-size:10px">Description</th><th class="th" style="font-size:10px">Category</th><th class="th" style="font-size:10px">Date</th><th class="th" style="font-size:10px;text-align:right">Amount</th><th class="th" style="font-size:10px"></th></tr></thead><tbody>';
      cs.costs.additional.forEach(function(a){
        tabContent += '<tr><td class="td">'+a.description+'</td><td class="td"><span class="bdg" style="font-size:9px">'+a.category+'</span></td><td class="td">'+a.date+'</td><td class="td" style="text-align:right;font-weight:700">$'+a.amount.toFixed(2)+'</td><td class="td"><button onclick="removeAdditionalCost(\''+job.id+'\',\''+a.id+'\');renderPage()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:10px">\u2715</button></td></tr>';
      });
      tabContent += '<tr style="background:#f9fafb;font-weight:700"><td class="td" colspan="3">Total Additional</td><td class="td" style="text-align:right;color:#a855f7">$'+cs.totalAdditional.toFixed(2)+'</td><td class="td"></td></tr></tbody></table>';
    } else { tabContent += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">No additional costs logged yet</div>'; }
    tabContent += '</div>';


  } else if (tab === 'progress_claims') {
    var valExGst = Math.round((job.val||0) / 1.1 * 100) / 100;
    var valIncGst = job.val || 0;
    var claims = getJobClaims(job.id);
    if (claims.length === 0) {
      claims = initJobClaims(job.id, job.val, job.paymentMethod||'cod');
    }
    var totalPaid = claims.filter(function(c){return c.status==='paid';}).reduce(function(s,c){return s+c.amountIncGst;},0);
    var totalInvoiced = claims.filter(function(c){return c.status==='invoiced';}).reduce(function(s,c){return s+c.amountIncGst;},0);
    var totalOutstanding = valIncGst - totalPaid;
    var paidPct = valIncGst>0?Math.round(totalPaid/valIncGst*100):0;

    tabContent = '<div style="display:flex;gap:12px;margin-bottom:14px">'
      +'<div class="card" style="flex:1;padding:14px;text-align:center;background:#f0fdf4"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Job Value</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:4px">$'+Math.round(valIncGst).toLocaleString()+'</div></div>'
      +'<div class="card" style="flex:1;padding:14px;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Paid</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:4px">$'+Math.round(totalPaid).toLocaleString()+'</div></div>'
      +'<div class="card" style="flex:1;padding:14px;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Invoiced (Unpaid)</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#3b82f6;margin-top:4px">$'+Math.round(totalInvoiced).toLocaleString()+'</div></div>'
      +'<div class="card" style="flex:1;padding:14px;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Outstanding</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:4px">$'+Math.round(totalOutstanding).toLocaleString()+'</div></div></div>'
      +'<div class="card" style="padding:14px;margin-bottom:14px"><div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:6px">Payment Progress ('+paidPct+'%)</div><div style="height:10px;background:#f3f4f6;border-radius:5px;overflow:hidden"><div style="height:100%;background:#22c55e;border-radius:5px;width:'+Math.min(paidPct,100)+'%"></div></div></div>';

    var stageIcons = {cl_dep:'\ud83d\udcb0',cl_cm:'\ud83d\udccf',cl_preinstall:'\ud83d\udee0\ufe0f',cl_final:'\u2705'};
    var stageNotes = {cl_dep:'Auto-generated when deal is won',cl_cm:'Auto-generated when check measure is complete + uploaded',cl_preinstall:'Auto-generated when install date is booked (due 7 business days before)',cl_final:'Auto-generated when job is marked complete'};

    tabContent += '<div class="card" style="padding:0;overflow:hidden">'
      +'<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
      +'<h4 style="font-size:14px;font-weight:700;margin:0">Payment Schedule (4 stages)</h4></div>';
    claims.forEach(function(cl,i){
      var stCol = cl.status==='paid'?'#22c55e':cl.status==='invoiced'?'#3b82f6':cl.status==='zip_pending'?'#7c3aed':cl.status==='zip_received'?'#22c55e':'#9ca3af';
      var stLabel = cl.status==='paid'?'\u2705 Paid':cl.status==='invoiced'?'\ud83d\udce8 Invoiced':cl.status==='zip_pending'?'\ud83d\udcb3 Zip Pending':cl.status==='zip_received'?'\u2705 Zip Received':'\u23f3 Pending';
      var isZipClaim = cl.isZip || cl.id === 'cl_zip';
      tabContent += '<div style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #f3f4f6">'
        +'<div style="width:44px;height:44px;border-radius:50%;background:'+stCol+'18;color:'+stCol+';font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid '+stCol+'">'+(stageIcons[cl.id]||''+(i+1))+'</div>'
        +'<div style="flex:1"><div style="font-size:14px;font-weight:700">'+cl.stage+'</div>'
        +'<div style="font-size:11px;color:#6b7280;margin-top:2px">'+(stageNotes[cl.id]||'')+'</div>'
        +(cl.invoiceNumber?'<div style="font-size:11px;color:#3b82f6;margin-top:2px">\ud83d\udcc4 Invoice: '+cl.invoiceNumber+(cl.paidDate?' \u2014 Paid '+cl.paidDate:'')+'</div>':'')
        +'</div>'
        +'<div style="text-align:right;margin-right:10px"><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif">$'+Math.round(cl.amountIncGst).toLocaleString()+'</div>'
        +'<div style="font-size:11px;color:#6b7280">$'+Math.round(cl.amountExGst).toLocaleString()+' ex GST</div></div>'
        +'<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;min-width:110px">'
        +'<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;background:'+stCol+'18;color:'+stCol+';text-align:center">'+stLabel+'</span>'
        +(cl.status==='invoiced'&&!isZipClaim?'<button onclick="var cls=getJobClaims(\''+job.id+'\');cls=cls.map(function(c){return c.id===\''+cl.id+'\'?Object.assign({},c,{status:\'paid\',paidDate:new Date().toISOString().slice(0,10)}):c;});saveJobClaims(\''+job.id+'\',cls);logJobAudit(\''+job.id+'\',\'Payment Received\',\''+cl.stage+' $'+Math.round(cl.amountIncGst)+'\');renderPage()" class="btn-r" style="font-size:10px;padding:4px 10px">\ud83d\udcb3 Mark Paid</button>':'')
        +(cl.status==='zip_pending'?'<button onclick="var cls=getJobClaims(\''+job.id+'\');cls=cls.map(function(c){return c.id===\''+cl.id+'\'?Object.assign({},c,{status:\'zip_received\',paidDate:new Date().toISOString().slice(0,10)}):c;});saveJobClaims(\''+job.id+'\',cls);logJobAudit(\''+job.id+'\',\'Zip Payment Received\',\''+cl.stage+' $'+Math.round(cl.amountIncGst)+'\');renderPage()" class="btn-w" style="font-size:10px;padding:4px 10px;color:#7c3aed;border-color:#c4b5fd">\ud83d\udcb3 Mark Zip Received</button>':'')
        +'</div></div>';
    });
    tabContent += '</div>';
    if(job.dealId){tabContent+='<div style="margin-top:14px;padding:10px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:12px;color:#0369a1">\ud83d\udd17 Linked to <a href="#" onclick="event.preventDefault();setState({crmMode:\'sales\',page:\'deals\',dealDetailId:\''+job.dealId+'\'})" style="color:#0369a1;font-weight:600">Original Deal</a> — all invoices visible in Invoicing section</div>';}

  } else if (tab === 'files') {
    var files = getJobFiles(job.id);
    var FILE_CATS = {check_measure:'Check Measure',contract:'Contract',photo:'Site Photo',invoice:'Invoice',variation:'Variation',general:'General'};
    var cmFiles = files.filter(function(f){return f.category==='check_measure';});
    tabContent = '<div class="card" style="padding:16px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h4 style="font-size:14px;font-weight:700;margin:0">\ud83d\udcc1 Job Files ('+files.length+')</h4></div>'
      +'<div style="display:flex;gap:8px;margin-bottom:12px;padding:12px;background:#f9fafb;border-radius:8px">'
      +'<select class="sel" id="file_cat" style="font-size:12px;padding:6px 10px">'+Object.entries(FILE_CATS).map(function(e){return '<option value="'+e[0]+'">'+e[1]+'</option>';}).join('')+'</select>'
      +'<label class="btn-r" style="font-size:12px;padding:6px 16px;cursor:pointer;gap:6px">'+Icon({n:'plus',size:13})+' Upload File<input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style="display:none" onchange="var file=this.files[0];if(!file)return;var cat=document.getElementById(\'file_cat\').value;var reader=new FileReader();reader.onload=function(e){addJobFile(\''+job.id+'\',file.name,cat,e.target.result);renderPage();};reader.readAsDataURL(file);"></label></div>';
    if(files.length===0){tabContent+='<div style="color:#9ca3af;font-size:12px;text-align:center;padding:20px">No files yet</div>';}
    else{tabContent+='<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Name</th><th class="th">Category</th><th class="th">By</th><th class="th">Date</th><th class="th"></th></tr></thead><tbody>';
    files.forEach(function(f){tabContent+='<tr><td class="td"><a href="'+f.dataUrl+'" target="_blank" download="'+f.name+'" style="color:#3b82f6;text-decoration:none;font-weight:600">\ud83d\udcce '+f.name+'</a></td><td class="td"><span class="bdg" style="font-size:10px">'+(FILE_CATS[f.category]||f.category)+'</span></td><td class="td">'+f.uploadedBy+'</td><td class="td">'+new Date(f.uploadedAt).toLocaleDateString('en-AU')+'</td><td class="td"><button onclick="removeJobFile(\''+job.id+'\',\''+f.id+'\');renderPage()" style="background:none;border:none;color:#ef4444;cursor:pointer">\u2715</button></td></tr>';});
    tabContent+='</tbody></table>';}
    if(cmFiles.length===0){tabContent+='<div style="margin-top:12px;padding:10px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e">\u26a0\ufe0f <strong>Check Measure PDF required.</strong> Upload before advancing to production.</div>';}
    tabContent+='</div>';

  } else if (tab === 'installation') {
    // INSTALLATION — Phase 1: status, scheduling, site conditions, completion
    var installers = getInstallers().filter(function(i){return i.active;});
    var installerById = {}; installers.forEach(function(i){ installerById[i.id]=i; });
    var crewIds = job.installCrew || [];
    var installDone = !!job.installCompletedAt;
    var installInProgress = !installDone && job.status === 'f_installing';
    var hasInstallDate = !!job.installDate;

    // Days until install (for Pre-Install banner)
    var daysUntil = null;
    if (hasInstallDate && !installDone) {
      var diff = (new Date(job.installDate + 'T12:00') - new Date()) / 86400000;
      daysUntil = Math.ceil(diff);
    }

    // Pre-install invoice status
    var preClaim = (getJobClaims(job.id) || []).find(function(c){return c.id==='cl_preinstall';});
    var preInvoiced = preClaim && (preClaim.status==='invoiced' || preClaim.status==='paid');

    // Status banner
    tabContent = '<div class="card" style="padding:20px;margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center">'
      +'<div><h4 style="font-size:16px;font-weight:700;margin:0">🛠️ Installation</h4>'
      +'<p style="color:#6b7280;font-size:12px;margin:4px 0 0">Schedule the install crew, capture site conditions, and complete the job</p></div></div></div>';

    // Three-cell status row
    var stateCell, stateCol, stateBg, stateBorder;
    if (installDone) { stateCell='✅ Installed'; stateCol='#15803d'; stateBg='#f0fdf4'; stateBorder='#86efac'; }
    else if (installInProgress) { stateCell='🔨 In Progress'; stateCol='#1d4ed8'; stateBg='#eff6ff'; stateBorder='#93c5fd'; }
    else if (hasInstallDate) { stateCell='📅 Scheduled'; stateCol='#92400e'; stateBg='#fef3c7'; stateBorder='#fde68a'; }
    else { stateCell='⏳ Not Scheduled'; stateCol='#92400e'; stateBg='#fef3c7'; stateBorder='#fde68a'; }

    tabContent += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">'
      +'<div style="padding:14px;border-radius:10px;text-align:center;background:'+stateBg+';border:1px solid '+stateBorder+'">'
      +'<div style="font-size:11px;font-weight:700;color:'+stateCol+'">'+stateCell+'</div>'
      +(installDone?'<div style="font-size:11px;color:#6b7280;margin-top:2px">'+new Date(job.installCompletedAt).toLocaleDateString('en-AU')+'</div>':'')
      +(daysUntil!==null && !installDone ? '<div style="font-size:11px;color:#6b7280;margin-top:2px">'+(daysUntil>0?'In '+daysUntil+' day'+(daysUntil!==1?'s':''):daysUntil===0?'Today':Math.abs(daysUntil)+' day'+(Math.abs(daysUntil)!==1?'s':'')+' overdue')+'</div>':'')
      +'</div>'
      +'<div style="padding:14px;border-radius:10px;text-align:center;'+(preInvoiced?'background:#f0fdf4;border:1px solid #86efac':'background:#f9fafb;border:1px solid #e5e7eb')+'">'
      +'<div style="font-size:11px;font-weight:700;color:'+(preInvoiced?'#15803d':'#6b7280')+'">'+(preInvoiced?'✅ 45% Pre-Install Invoice':'⏳ Pre-Install Invoice Pending')+'</div>'
      +(preInvoiced && preClaim.invoiceNumber?'<div style="font-size:11px;color:#9ca3af;margin-top:2px">'+preClaim.invoiceNumber+'</div>':'')
      +'</div>'
      +'<div style="padding:14px;border-radius:10px;text-align:center;background:#f9fafb;border:1px solid #e5e7eb">'
      +'<div style="font-size:11px;font-weight:700;color:#6b7280">Booked: '+(job.installDate||'—')+'</div>'
      +(job.installTime?'<div style="font-size:11px;color:#9ca3af">'+formatTime12(job.installTime)+'</div>':'')
      +'</div></div>';

    // Scheduling — read-only summary, edit via Install Schedule page
    tabContent += '<div class="card" style="padding:16px;margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      +'<h5 style="font-size:13px;font-weight:700;margin:0">Scheduling</h5>'
      +'<button onclick="setState({page:\'schedule\',jobDetailId:null})" class="btn-r" style="font-size:12px;padding:6px 14px;gap:4px">📅 Open in Install Schedule →</button>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px;font-size:12px">'
      +'<div><div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:3px">Install Date</div>'
      +'<div style="font-weight:600">'+(job.installDate?new Date(job.installDate+'T12:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):'<span style="color:#9ca3af;font-weight:400">— not scheduled —</span>')+'</div></div>'
      +'<div><div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:3px">Arrival Time</div>'
      +'<div style="font-weight:600">'+(job.installTime?formatTime12(job.installTime):'<span style="color:#9ca3af;font-weight:400">—</span>')+'</div></div>'
      +'<div><div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:3px">Install Crew</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:4px">'
      +(crewIds.length===0?'<span style="color:#9ca3af;font-weight:400">— no crew assigned —</span>':crewIds.map(function(cid,idx){var inst=installerById[cid]||{name:'Unknown',colour:'#9ca3af'};return '<span style="display:inline-flex;align-items:center;gap:4px;background:'+inst.colour+'18;border:1px solid '+inst.colour+'66;color:'+inst.colour+';padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">'+(idx===0?'👑 ':'')+inst.name+'</span>';}).join(''))
      +'</div></div>'
      +'</div>'
      +'<div style="font-size:10px;color:#9ca3af;margin-top:10px;padding-top:10px;border-top:1px solid #f3f4f6">ℹ️ Date, time and crew are set via the Smart Install Scheduler — the Install Schedule page runs capacity, vehicle and glass-timing checks.</div>'
      +'</div>';

    // Site Conditions
    tabContent += '<div class="card" style="padding:16px;margin-bottom:14px">'
      +'<h5 style="font-size:13px;font-weight:700;margin:0 0 10px">Site Conditions</h5>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
      +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Access Notes</label>'
      +'<textarea class="inp" rows="2" style="font-size:12px;resize:vertical" onblur="updateJobField(\''+job.id+'\',\'accessNotes\',this.value)" placeholder="Tight passage, gate code, etc.">'+(job.accessNotes||'')+'</textarea></div>'
      +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Parking Notes</label>'
      +'<textarea class="inp" rows="2" style="font-size:12px;resize:vertical" onblur="updateJobField(\''+job.id+'\',\'parkingNotes\',this.value)" placeholder="Where the truck can park, permits needed, etc.">'+(job.parkingNotes||'')+'</textarea></div>'
      +'</div>'
      +'<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px">'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(job.renderWarning?'checked':'')+' onchange="updateJobField(\''+job.id+'\',\'renderWarning\',this.checked)"> ⚠️ Render Warning</label>'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(job.tightAccess?'checked':'')+' onchange="updateJobField(\''+job.id+'\',\'tightAccess\',this.checked)"> Tight Access</label>'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(job.twoStory?'checked':'')+' onchange="updateJobField(\''+job.id+'\',\'twoStory\',this.checked)"> Two Story</label>'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(job.petOnPremises?'checked':'')+' onchange="updateJobField(\''+job.id+'\',\'petOnPremises\',this.checked)"> Pet on Premises</label>'
      +'</div></div>';

    // Tools Required card (admin/install manager picks which tools the job needs)
    var allTools = (typeof getTools === 'function' ? getTools() : []).filter(function(t){return t.active!==false;});
    var requiredToolIds = (typeof getJobTools === 'function') ? getJobTools(job.id) : [];
    var TICONS = {lifting:'🏗️',access:'🪜',sealing:'🧴',fastening:'🔩',measuring:'📏',other:'🛠️'};
    if (allTools.length > 0 || requiredToolIds.length > 0) {
      tabContent += '<div class="card" style="padding:16px;margin-bottom:14px">'
        +'<h5 style="font-size:13px;font-weight:700;margin:0 0 10px">Tools Required</h5>'
        +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px">'
        +(requiredToolIds.length===0?'<span style="font-size:11px;color:#9ca3af;font-style:italic">No tools specified</span>':requiredToolIds.map(function(tid){var t=allTools.find(function(x){return x.id===tid;})||{name:'(removed tool)',category:'other'};return '<span style="display:inline-flex;align-items:center;gap:6px;background:#f3f4f6;border:1px solid #e5e7eb;color:#374151;padding:3px 8px;border-radius:14px;font-size:11px;font-weight:600">'+(TICONS[t.category]||'🛠️')+' '+t.name+'<button onclick="setJobTools(\''+job.id+'\',getJobTools(\''+job.id+'\').filter(function(c){return c!==\''+tid+'\'}));renderPage()" style="background:none;border:none;color:#6b7280;cursor:pointer;padding:0;font-size:13px;line-height:1">×</button></span>';}).join(''))
        +'</div>'
        +(allTools.filter(function(t){return requiredToolIds.indexOf(t.id)<0;}).length>0?'<select class="sel" onchange="if(this.value){var cur=getJobTools(\''+job.id+'\');if(cur.indexOf(this.value)<0){setJobTools(\''+job.id+'\',cur.concat([this.value]));renderPage();}this.value=\'\';}" style="font-size:12px;padding:6px 10px;max-width:280px">'
          +'<option value="">+ Add required tool…</option>'
          +allTools.filter(function(t){return requiredToolIds.indexOf(t.id)<0;}).map(function(t){return '<option value="'+t.id+'">'+(TICONS[t.category]||'🛠️')+' '+t.name+'</option>';}).join('')
          +'</select>':'<div style="font-size:10px;color:#9ca3af">All available tools added.</div>')
        +'</div>';
    }

    // ── Install Progress Tracking (TESTING — to be replaced by mobile app) ─
    var instProgress = (typeof getInstallProgress === 'function') ? getInstallProgress(job.id) : {arrivedAt:null,frameStages:[]};
    var progressPct = (typeof getInstallProgressPct === 'function') ? getInstallProgressPct(job) : 0;
    // Frames live in CAD data; prefer Final → Survey → Original → windows fallback.
    var frameSource = (job.cadFinalData && job.cadFinalData.projectItems) ||
                      (job.cadSurveyData && job.cadSurveyData.projectItems) ||
                      (job.cadData && job.cadData.projectItems) ||
                      job.windows || [];
    var frames = frameSource.length;
    // Always render the card so testers can see the feature. Show helpful messages when prerequisites missing.
    {
      var STAGE_LABELS = ['','Demo','Fit','Foam','Trim','Glaze','HW','Clean'];
      var STAGE_FULL = ['Not Started','Demo\'d','Fitted','Foamed','Trimmed','Glazed','Hardware Tested','Cleaned'];
      var stageColours = ['#e5e7eb','#fbbf24','#f59e0b','#06b6d4','#3b82f6','#a855f7','#ec4899','#22c55e'];

      tabContent += '<div class="card" style="padding:0;margin-bottom:14px;border:2px dashed #c4b5fd;overflow:hidden">'
        // Header strip
        +'<div style="padding:12px 16px;background:linear-gradient(180deg,#faf5ff,#fff);border-bottom:1px solid #ede9fe;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'
        +'<div style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">🔨</span><h5 style="font-size:14px;font-weight:700;margin:0">Install Progress</h5></div>'
        +(frames>0&&hasInstallDate?(instProgress.arrivedAt?'<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#15803d;background:#dcfce7;padding:5px 10px;border-radius:14px;font-weight:600">✅ Arrived '+new Date(instProgress.arrivedAt).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'</span>':'<button onclick="markCrewArrived(\''+job.id+'\')" class="btn-r" style="font-size:12px;padding:6px 14px;gap:4px">📍 Tap Arrived</button>'):'')
        +'</div>'
        // Testing strip
        +'<div style="padding:8px 16px;background:#f5f3ff;border-bottom:1px solid #ede9fe;font-size:11px;color:#6d28d9;font-weight:500">🧪 <strong>TESTING</strong> — these stages will be tapped by the install crew on the mobile app once that ships. For now, admin can update manually here.</div>'
        // Body
        +'<div style="padding:16px">';

      if (!hasInstallDate) {
        tabContent += '<div style="padding:14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e">⏳ Schedule the install date first (above) before tracking progress.</div></div></div>';
      } else if (frames === 0) {
        tabContent += '<div style="padding:14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1d4ed8">📐 This job has no frames defined yet. Frames are added during Original Design / Check Measure. Once frames exist, each will appear here as a per-stage tracker.</div></div></div>';
      } else {
        // Overall progress bar
        tabContent += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
          +'<div style="font-size:11px;font-weight:600;color:#6b7280;min-width:60px">Overall</div>'
          +'<div style="flex:1;height:12px;background:#f3f4f6;border-radius:6px;overflow:hidden;position:relative"><div style="height:100%;background:linear-gradient(90deg,#22c55e,#16a34a);width:'+progressPct+'%;border-radius:6px;transition:width .3s"></div></div>'
          +'<span style="font-size:14px;font-weight:800;color:#15803d;min-width:48px;text-align:right;font-family:Syne,sans-serif">'+progressPct+'%</span>'
          +'</div>'
          // Per-frame heading
          +'<div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Per-frame stages · click any stage to advance, click again to roll back</div>'
          +'<div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto">';
      for (var fi = 0; fi < frames; fi++) {
        var w = frameSource[fi] || {};
        var curStage = (instProgress.frameStages && instProgress.frameStages[fi]) || 0;
        var frameLabel = (w.position || w.name || w.location || w.label || ('Frame ' + (fi+1)));
        var rowPct = Math.round(curStage / 7 * 100);
        tabContent += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:'+(curStage>=7?'#f0fdf4':'#f9fafb')+';border:1px solid '+(curStage>=7?'#bbf7d0':'#f3f4f6')+';border-radius:8px">'
          +'<div style="min-width:80px;font-size:12px;font-weight:700;color:#374151">'+frameLabel+'</div>'
          +'<div style="display:flex;gap:3px;flex:1">';
        for (var si = 1; si <= 7; si++) {
          var done = curStage >= si;
          tabContent += '<button onclick="setFrameStage(\''+job.id+'\','+fi+','+(curStage===si?si-1:si)+');renderPage()" title="'+STAGE_FULL[si]+' — click to '+(done?'roll back':'mark complete')+'" style="flex:1;padding:5px 0;font-size:10px;font-weight:700;background:'+(done?stageColours[si]:'#fff')+';color:'+(done?'#fff':'#9ca3af')+';border:1.5px solid '+(done?stageColours[si]:'#e5e7eb')+';border-radius:5px;cursor:pointer;transition:all .15s">'+STAGE_LABELS[si]+'</button>';
        }
        tabContent += '</div>'
          +'<div style="font-size:11px;color:'+(curStage>=7?'#15803d':curStage>0?'#3b82f6':'#9ca3af')+';font-weight:600;min-width:90px;text-align:right">'+(curStage===0?'Not started':curStage>=7?'✅ '+STAGE_FULL[curStage]:rowPct+'% · '+STAGE_FULL[curStage])+'</div>'
          +'</div>';
      }
      tabContent += '</div></div></div>';
      } // close else branch
    } // close progress card block

    // Completion card
    var canComplete = !!job.completionSignedAt && !installDone;
    tabContent += '<div class="card" style="padding:16px">'
      +'<h5 style="font-size:13px;font-weight:700;margin:0 0 10px">Completion</h5>';
    if (installDone) {
      tabContent += '<div style="padding:14px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:13px;color:#15803d">'
        +'✅ <strong>Installation completed</strong> on '+new Date(job.installCompletedAt).toLocaleDateString('en-AU')+'. Final 5% invoice has been issued.'
        +'</div>';
    } else {
      tabContent += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
        +'<div style="padding:12px;border-radius:8px;'+(job.completionSignedAt?'background:#f0fdf4;border:1px solid #86efac':'background:#f9fafb;border:1px solid #e5e7eb')+'">'
        +'<div style="font-size:11px;font-weight:700;color:'+(job.completionSignedAt?'#15803d':'#6b7280')+'">'+(job.completionSignedAt?'✅ Customer Signed':'⏳ Awaiting Customer Signature')+'</div>'
        +(job.completionSignedAt?'<div style="font-size:11px;color:#9ca3af;margin-top:2px">'+new Date(job.completionSignedAt).toLocaleDateString('en-AU')+'</div>':'<div style="font-size:11px;color:#9ca3af;margin-top:2px">Captured on installer\'s tablet at end of install day</div>')
        +'</div>'
        +'<div style="padding:12px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb">'
        +'<div style="font-size:11px;font-weight:700;color:#6b7280">Final 5% Invoice</div>'
        +'<div style="font-size:11px;color:#9ca3af;margin-top:2px">Auto-issued when job is marked complete</div>'
        +'</div></div>'
        +'<div style="display:flex;gap:8px;align-items:center">'
        +'<button onclick="markJobComplete(\''+job.id+'\')" '+(canComplete?'':'disabled')+' class="btn-r" style="font-size:13px;padding:8px 20px;'+(canComplete?'':'opacity:.5;cursor:not-allowed')+'">✅ Mark Installation Complete</button>'
        +(!job.completionSignedAt?'<span style="font-size:11px;color:#9ca3af">Customer must sign the completion certificate first</span>':'')
        +'</div>';
    }
    tabContent += '</div>';

  } else if (tab === 'audit_log') {
    var auditLog = getJobAuditLog(job.id);
    var activities = (job.activity||[]).map(function(a){return {action:'Activity',detail:a.text||a.note||'',user:a.by||'System',timestamp:a.at||a.date||'',oldValue:'',newValue:''};});
    var combined = auditLog.concat(activities).sort(function(a,b){return (b.timestamp||'').localeCompare(a.timestamp||'');});
    tabContent = '<div class="card" style="padding:0;overflow:hidden">'
      +'<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">\ud83d\udcdd Audit Log ('+combined.length+')</h4></div>';
    if(combined.length===0){tabContent+='<div style="padding:30px;text-align:center;color:#9ca3af">No audit history yet</div>';}
    else{tabContent+='<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th" style="width:160px">Action</th><th class="th">Detail</th><th class="th" style="width:140px">By</th><th class="th" style="width:180px">Date</th></tr></thead><tbody>';
    combined.forEach(function(entry,i){var actionCol=entry.action==='Status Changed'?'#3b82f6':entry.action==='Payment Received'?'#22c55e':entry.action==='File Uploaded'?'#22c55e':entry.action==='Progress Claim'?'#f59e0b':'#6b7280';var ts=entry.timestamp?new Date(entry.timestamp):null;var ds=ts?ts.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})+' '+ts.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'}):'';
    tabContent+='<tr style="'+(i%2===0?'':'background:#fafafa')+'"><td class="td"><span style="font-weight:600;color:'+actionCol+'">'+entry.action+'</span>'+(entry.oldValue&&entry.newValue?'<div style="font-size:10px;color:#9ca3af">'+entry.oldValue+' \u2192 '+entry.newValue+'</div>':'')+'</td><td class="td">'+entry.detail+'</td><td class="td" style="font-weight:500">'+entry.user+'</td><td class="td" style="color:#6b7280;font-size:11px">'+ds+'</td></tr>';});
    tabContent+='</tbody></table>';}
    tabContent+='</div>';

  } else {
    // Placeholder for tabs not yet built
    var tabLabel = tabs.find(function(t){ return t.key === tab; });
    tabContent = '<div class="card" style="padding:40px;text-align:center">'
      + '<div style="font-size:48px;margin-bottom:12px">🚧</div>'
      + '<h3 style="font-family:Syne,sans-serif;font-size:16px;font-weight:700;margin:0 0 8px">' + (tabLabel ? tabLabel.label : tab) + '</h3>'
      + '<p style="color:#9ca3af;font-size:13px">This section will be built in the next phase.</p>'
      + '</div>';
  }

  // Hold banner
  var holdBanner = '';
  if (job.hold || job.status === 'c4_date_change_hold') {
    holdBanner = '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;padding:12px 20px;margin-bottom:16px;display:flex;align-items:center;gap:12px">'
      + '<span style="font-size:20px">⏸️</span>'
      + '<div><strong style="color:#92400e">Job on HOLD</strong>'
      + (job.holdReason ? '<div style="font-size:12px;color:#92400e;margin-top:2px">Reason: ' + job.holdReason + '</div>' : '')
      + '</div>'
      + '<button onclick="var prev=(job.statusHistory||[]).slice().reverse().find(function(h){return h.status!==\'c4_date_change_hold\';});transitionJobStatus(\'' + job.id + '\',prev?prev.status:\'a_check_measure\',\'Resumed from hold\')" class="btn-w" style="margin-left:auto;font-size:12px">Resume</button>'
      + '</div>';
  }

  // ── Left panel: Custom Fields ──────────────────────────────────────────────
  var jobFields = getState().jobFields || [];
  var jobFv = (getState().jobFieldValues || {})[job.id] || {};
  var leftPanel = '<div style="width:280px;flex-shrink:0">';
  // Core fields card
  leftPanel += '<div class="card" style="padding:16px;margin-bottom:12px">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:10px">Job Info</div>'
    + '<div style="display:flex;flex-direction:column;gap:8px;font-size:12px">'
    + '<div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Value</span><strong>$' + Number(job.val||0).toLocaleString() + '</strong></div>'
    + '<div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Branch</span><span>' + (job.branch||'—') + '</span></div>'
    + '<div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Legal Entity</span><span style="text-align:right;max-width:160px">' + (job.legalEntity||'—') + '</span></div>'
    + '<div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Order Type</span><span>' + (job.orderSuffix === 'S' ? 'Service' : 'Original') + '</span></div>'
    + '<div style="border-top:1px solid #f3f4f6;padding-top:8px;margin-top:2px"><span style="color:#9ca3af;display:block;margin-bottom:4px">Address</span><span>' + [job.street,job.suburb,job.state,job.postcode].filter(Boolean).join(', ') + '</span></div>'
    + (contact ? '<div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Phone</span><span>' + (contact.phone||'—') + '</span></div>' : '')
    + (contact ? '<div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Email</span><span style="max-width:160px;overflow:hidden;text-overflow:ellipsis">' + (contact.email||'—') + '</span></div>' : '')
    + (job.dealId ? '<div style="border-top:1px solid #f3f4f6;padding-top:8px;margin-top:2px"><a href="#" onclick="event.preventDefault();setState({crmMode:\'sales\',page:\'deals\',dealDetailId:\'' + job.dealId + '\',jobDetailId:null})" style="color:#c41230;text-decoration:none;font-size:12px;font-weight:600">← View linked deal</a></div>' : '')
    + '</div></div>';

  // Custom fields card
  if (jobFields.length > 0) {
    leftPanel += '<div class="card" style="padding:16px;margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af">Custom Fields</div>'
      + '<button onclick="jobSettTab=\'jobfields\';setState({page:\'jobsettings\'})" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:2px" title="Manage custom fields">' + Icon({n:'settings',size:13}) + '</button>'
      + '</div>';
    leftPanel += jobFields.sort(function(a,b){ return a.ord - b.ord; }).map(function(field) {
      var val = jobFv[field.id];
      return '<div style="padding:6px 0;border-bottom:1px solid #f9fafb">'
        + '<div style="font-size:11px;color:#9ca3af;margin-bottom:3px">' + field.label + (field.required ? '<span style="color:#c41230">*</span>' : '') + '</div>'
        + '<div id="cf_' + job.id + '_' + field.id + '_display" onclick="cfStartEdit(\'' + job.id + '\',\'' + field.id + '\',\'job\')" style="cursor:pointer;min-height:22px">'
        + renderCFValue(field, val)
        + '</div></div>';
    }).join('');
    leftPanel += '</div>';
  }
  // Add fields button
  leftPanel += '<button onclick="jobSettTab=\'jobfields\';jsAddingField=true;setState({page:\'jobsettings\'})" class="btn-g" style="width:100%;font-size:12px;justify-content:center;gap:6px">' + Icon({n:'plus',size:12}) + ' Add Custom Field</button>';
  leftPanel += '</div>';

  return '<div>'
    // Back link + header
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">'
    + '<button onclick="setState({jobDetailId:null})" class="btn-g" style="font-size:13px">← Jobs</button>'
    + '<div style="flex:1"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:20px;margin:0">' + (job.jobNumber||'Job') + ' <span style="font-weight:400;color:#6b7280;font-size:16px">— ' + cName + '</span></h2></div>'
    + '<div style="display:flex;gap:6px;align-items:center">'
    + '<span class="bdg" style="background:' + st.col + '20;color:' + st.col + ';border:1px solid ' + st.col + '40;font-size:12px;padding:4px 12px">' + st.label + '</span>'
    + (job.paymentMethod==='zip' ? '<span style="background:#faf5ff;color:#7c3aed;font-size:11px;font-weight:800;padding:4px 12px;border-radius:20px;border:1.5px solid #c4b5fd">ZIP MONEY</span>' : '<span style="background:#f0fdf4;color:#15803d;font-size:11px;font-weight:800;padding:4px 12px;border-radius:20px;border:1.5px solid #86efac">COD</span>')
    + (job.status !== 'h_completed_standard' && job.status !== 'h1_completed_service'
        ? (!job.completionSignedAt
            ? '<button onclick="if(confirm(\'Record customer completion signature? This confirms the customer has signed off on the completed work.\')){var now=new Date().toISOString();setState({jobs:getState().jobs.map(function(j){return j.id===\'' + job.id + '\'?Object.assign({},j,{completionSignedAt:now}):j;})});dbUpdate(\'jobs\',\'' + job.id + '\',{completion_signed_at:now,updated:now});logJobAudit(\'' + job.id + '\',\'Completion Signed\',\'Customer completion signature recorded by \'+getCurrentUser().name);addToast(\'Completion signature recorded\',\'success\');renderPage();}" class="btn-w" style="font-size:11px;padding:5px 14px;gap:4px">' + Icon({n:'check',size:13}) + ' Record Completion Signature</button>'
            : '<button onclick="if(confirm(\'Mark this job as complete? This will generate the final 5% invoice.\')){markJobComplete(\'' + job.id + '\');renderPage();}" class="btn-r" style="font-size:11px;padding:5px 14px;gap:4px">' + Icon({n:'check',size:13}) + ' Mark Complete</button>')
        : '<span style="font-size:11px;padding:5px 14px;background:#f0fdf4;color:#15803d;border-radius:8px;font-weight:600">\u2705 Completed</span>')
    + '<button onclick="var type=prompt(\'Service call type (warranty/callback/repair/leak):\',\'callback\');if(!type)return;var desc=prompt(\'Description:\',\'\');addServiceCall(\'' + job.id + '\',type,\'medium\',desc);setState({crmMode:\'service\',page:\'servicelist\'});" class="btn-w" style="font-size:11px;padding:5px 10px;gap:4px">' + Icon({n:'phone',size:12}) + ' Service Call</button>'
    + '</div>'
    + '</div>'
    + holdBanner
    // Status stepper
    + '<div style="display:flex;align-items:center;gap:6px;overflow-x:auto;padding:10px 0 16px;margin-bottom:4px;scrollbar-width:none">' + stepperHtml + '</div>'
    // Tabs
    + '<div style="border-bottom:1px solid #e5e7eb;margin-bottom:20px;display:flex;gap:0;overflow-x:auto">' + tabsHtml + '</div>'
    // 2-column layout: left custom fields + right tab content
    + '<div style="display:flex;gap:20px;align-items:flex-start">'
    + leftPanel
    + '<div style="flex:1;min-width:0">' + tabContent + '</div>'
    + '</div>'
    + '</div>';
}

