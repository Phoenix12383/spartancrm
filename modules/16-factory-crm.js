// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 16-factory-crm.js
// Extracted from original index.html lines 11084-12242
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// FACTORY CRM — Native production management linked to Job CRM
// ══════════════════════════════════════════════════════════════════════════════

var FACTORY_STATIONS = [
  {id:'frame_cutting', name:'Frame Cutting', cap:20, icon:'\u2702\ufe0f'},
  {id:'sash_cutting', name:'Sash Cutting', cap:20, icon:'\ud83e\ude9a'},
  {id:'steel_cutting', name:'Steel Cutting', cap:15, icon:'\u2699\ufe0f'},
  {id:'welding', name:'Welding', cap:12, icon:'\ud83d\udd25'},
  {id:'hardware', name:'Hardware Assembly', cap:18, icon:'\ud83d\udd27'},
  {id:'qc', name:'QC Inspection', cap:20, icon:'\u2705'},
  {id:'packing', name:'Packing & Dispatch', cap:25, icon:'\ud83d\udce6'},
];
var FACTORY_ORDER_STATUSES = [
  {key:'received', label:'Received', col:'#6b7280'},
  {key:'bom_generated', label:'BOM Generated', col:'#3b82f6'},
  {key:'materials_ordered', label:'Materials Ordered', col:'#7c3aed'},
  {key:'in_production', label:'In Production', col:'#f59e0b'},
  {key:'qc_check', label:'QC Check', col:'#10b981'},
  {key:'ready_dispatch', label:'Ready for Dispatch', col:'#06b6d4'},
  {key:'dispatched', label:'Dispatched', col:'#22c55e'},
];
function getFactoryStatusObj(k){return FACTORY_ORDER_STATUSES.find(function(s){return s.key===k;})||FACTORY_ORDER_STATUSES[0];}
var FACTORY_STATUS_ORDER = FACTORY_ORDER_STATUSES.map(function(s){return s.key;});

function getFactoryOrders(){try{return JSON.parse(localStorage.getItem('spartan_factory_orders')||'[]');}catch(e){return [];}}
function saveFactoryOrders(o){localStorage.setItem('spartan_factory_orders',JSON.stringify(o));if(_sb)o.forEach(function(ord){dbUpsert('factory_orders',ord);});}
function getFactoryItems(){try{return JSON.parse(localStorage.getItem('spartan_factory_items')||'[]');}catch(e){return [];}}
function saveFactoryItems(i){localStorage.setItem('spartan_factory_items',JSON.stringify(i));if(_sb)i.forEach(function(it){dbUpsert('factory_items',it);});}

// One-time migration: Glazing was removed from the factory flow (Spartan site-glazes).
// Move any frame still sitting at the glazing station to QC so it isn't orphaned.
(function migrateGlazingStation(){
  try {
    if (localStorage.getItem('spartan_glazing_migration_v1') === 'done') return;
    var items = JSON.parse(localStorage.getItem('spartan_factory_items')||'[]');
    var changed = 0;
    items.forEach(function(it){
      if (it.station === 'glazing') { it.station = 'qc'; changed++; }
    });
    if (changed > 0) {
      localStorage.setItem('spartan_factory_items', JSON.stringify(items));
      console.log('[Migration] Moved '+changed+' frame(s) from retired Glazing station to QC');
    }
    localStorage.setItem('spartan_glazing_migration_v1', 'done');
  } catch(e) { console.warn('[Migration] Glazing migration skipped:', e); }
})();

function cadFrameToFactoryItem(frame, idx, orderJid, customer, suburb, due) {
  return {id:'fi_'+Date.now()+'_'+idx, orderId:orderJid,
    name:frame.name||((frame.productType||'').indexOf('door')>=0?'D':'W')+String(idx+1).padStart(2,'0'),
    productType:frame.productType||'awning_window', widthMm:frame.width||900, heightMm:frame.height||900,
    colour:frame.colour||'white_body', colourInt:frame.colourInt||'white_body',
    glassSpec:frame.glassSpec||'dgu_4_12_4', profileSystem:frame.profileSystem||'ideal_4000',
    panelCount:frame.panelCount||1, customer:customer||'', suburb:suburb||'', due:due||'',
    station:'frame_cutting', rework:false, stationHistory:[{station:'frame_cutting',at:new Date().toISOString()}]};
}

function pushJobToFactory(jobId) {
  var jobs=getState().jobs||[]; var job=jobs.find(function(j){return j.id===jobId;});
  if(!job){addToast('Job not found','error');return;}
  // Step 5 §6 / spec §8.2: final design > survey > original. The factory
  // should build what was signed, not what was measured or originally designed.
  var cadData=job.cadFinalData||job.cadSurveyData||job.cadData;
  if(!cadData||!cadData.projectItems||cadData.projectItems.length===0){addToast('No design data','error');return;}
  var contact=(getState().contacts||[]).find(function(c){return c.id===job.contactId;});
  var cName=contact?contact.fn+' '+contact.ln:'';
  var existing=getFactoryOrders();
  if(existing.find(function(o){return o.crmJobId===jobId;})){addToast('Already in factory','warning');return;}
  var order={id:'fo_'+Date.now(),crmJobId:jobId,jid:job.jobNumber||job.id,
    customer:cName,address:[job.street,job.suburb,job.state,job.postcode].filter(Boolean).join(', '),
    suburb:job.suburb||'',branch:job.branch||'VIC',value:job.val||0,
    installDate:job.installDate||'',notes:job.notes||'',status:'received',
    frameCount:cadData.projectItems.length,paymentMethod:job.paymentMethod||'cod',created:new Date().toISOString()};
  existing.push(order); saveFactoryOrders(existing);
  var prodItems=cadData.projectItems.map(function(f,i){return cadFrameToFactoryItem(f,i,order.jid,cName,job.suburb,job.installDate);});
  saveFactoryItems(getFactoryItems().concat(prodItems));
  setState({jobs:getState().jobs.map(function(j){return j.id===jobId?Object.assign({},j,{productionStatus:'received',factoryOrderId:order.id}):j;})});
  logJobAudit(jobId,'Sent to Factory',cadData.projectItems.length+' frames');
  addToast('\ud83c\udfed '+cadData.projectItems.length+' frames sent to factory','success');renderPage();
}

function updateFactoryOrderField(orderId, field, value) {
  var orders = getFactoryOrders();
  orders = orders.map(function(o) { if (o.id !== orderId) return o; var u = {}; u[field] = value; return Object.assign({}, o, u); });
  saveFactoryOrders(orders);
  renderPage();
}

// ── Glass Ordering Protocol ─────────────────────────────────────────────────
// Glass must be ordered 3 weeks (15 business days) before material delivery
var GLASS_STATUSES = [
  {key:'not_ordered',label:'Not Ordered',col:'#9ca3af',icon:'\u23f3'},
  {key:'ordered',label:'Ordered',col:'#3b82f6',icon:'\ud83d\udce6'},
  {key:'received',label:'Received',col:'#22c55e',icon:'\u2705'},
];
function getGlassStatusObj(key){return GLASS_STATUSES.find(function(s){return s.key===key;})||GLASS_STATUSES[0];}

function getGlassOrderDueDate(order) {
  // Glass must be ordered 3 weeks before material delivery
  if (!order.materialDeliveryDate) return null;
  var matDate = new Date(order.materialDeliveryDate);
  var due = new Date(matDate);
  var bizDays = 0;
  while (bizDays < 15) { due.setDate(due.getDate() - 1); if (due.getDay() !== 0 && due.getDay() !== 6) bizDays++; }
  return due;
}

function getGlassAlerts(orders) {
  var today = new Date(); today.setHours(0,0,0,0);
  var alerts = {overdue:[], dueThisWeek:[], upcoming:[], ordered:[], received:[]};
  orders.forEach(function(o) {
    if (o.status === 'dispatched') return;
    var gs = o.glassStatus || 'not_ordered';
    if (gs === 'received') { alerts.received.push(o); return; }
    if (gs === 'ordered') { alerts.ordered.push(o); return; }
    var due = getGlassOrderDueDate(o);
    if (!due) { alerts.overdue.push(o); return; } // no mat date = urgent
    var daysUntilDue = Math.round((due - today) / 86400000);
    if (daysUntilDue < 0) alerts.overdue.push(o);
    else if (daysUntilDue <= 7) alerts.dueThisWeek.push(o);
    else alerts.upcoming.push(o);
  });
  return alerts;
}

function updateGlassOrder(orderId, field, value) {
  var orders = getFactoryOrders();
  orders = orders.map(function(o) {
    if (o.id !== orderId) return o;
    var u = {};
    u[field] = value;
    if (field === 'glassStatus' && value === 'ordered' && !o.glassOrderedDate) u.glassOrderedDate = new Date().toISOString().slice(0,10);
    if (field === 'glassStatus' && value === 'received' && !o.glassReceivedDate) u.glassReceivedDate = new Date().toISOString().slice(0,10);
    return Object.assign({}, o, u);
  });
  saveFactoryOrders(orders);
  // Log to CRM job audit
  var order = orders.find(function(o){return o.id===orderId;});
  if (order && order.crmJobId) {
    var label = field === 'glassStatus' ? 'Glass ' + value : 'Glass ' + field + ' updated';
    logJobAudit(order.crmJobId, label, value);
  }
  renderPage();
}

function showGlassOrderModal(orderId) {
  var order = getFactoryOrders().find(function(o){return o.id===orderId;});
  if (!order) return;
  var gs = getGlassStatusObj(order.glassStatus || 'not_ordered');
  var due = getGlassOrderDueDate(order);
  var dueStr = due ? due.toLocaleDateString('en-AU') : 'Set material date first';
  var crmJob = (getState().jobs||[]).find(function(j){return j.factoryOrderId===orderId||j.id===order.crmJobId;});
  var cadData = crmJob ? (crmJob.cadSurveyData||crmJob.cadData) : null;
  var frames = cadData && cadData.projectItems ? cadData.projectItems : [];
  var glassSpecs = {};
  frames.forEach(function(f) {
    var spec = f.glassSpec || f.glazingSpec || 'dgu_standard';
    var w = f.width || f.widthMm || 0;
    var h = f.height || f.heightMm || 0;
    var key = spec + '_' + w + 'x' + h;
    if (!glassSpecs[key]) glassSpecs[key] = {spec:spec,w:w,h:h,qty:0};
    glassSpecs[key].qty += (f.panelCount || 1);
  });
  var totalPanes = Object.values(glassSpecs).reduce(function(s,g){return s+g.qty;},0);
  var isOverdue = (order.glassStatus||'not_ordered') === 'not_ordered';

  var m = '<div class="modal-bg" id="glassModal" onclick="if(event.target===this){this.remove();}"><div class="modal" style="max-width:620px;max-height:90vh;overflow-y:auto">'
    +'<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;'+(isOverdue?'background:#fef2f2':'')+'"><h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">\ud83e\ude9f Glass Order \u2014 '+order.jid+(isOverdue?' <span style="color:#ef4444;font-size:12px">\ud83d\udea8 NOT ORDERED</span>':'')+'</h3><button onclick="this.closest(\'.modal-bg\').remove()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px">\u00d7</button></div>'
    +'<div style="padding:20px">';

  // Status strip
  m += '<div style="display:flex;gap:8px;margin-bottom:16px"><div style="flex:1;padding:10px;border-radius:8px;background:'+(isOverdue?'#ef4444':''+gs.col)+'15;border:1.5px solid '+(isOverdue?'#ef4444':gs.col)+'40;text-align:center"><div style="font-size:18px">'+gs.icon+'</div><div style="font-size:12px;font-weight:700;color:'+(isOverdue?'#ef4444':gs.col)+'">'+gs.label+'</div></div>'
    +'<div style="flex:1;padding:10px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280">ORDER BY</div><div style="font-size:13px;font-weight:700;color:#c41230;margin-top:2px">'+dueStr+'</div></div>'
    +'<div style="flex:1;padding:10px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280">PANES</div><div style="font-size:18px;font-weight:800;margin-top:2px">'+totalPanes+'</div></div></div>';

  // Glass spec table from CAD
  if (Object.keys(glassSpecs).length > 0) {
    m += '<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">Glass Specifications (from Spartan CAD)</div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th">Glass Spec</th><th class="th">Size (mm)</th><th class="th">Panes</th></tr></thead><tbody>';
    Object.values(glassSpecs).forEach(function(g,i) {
      m += '<tr style="'+(i%2?'background:#fafafa':'')+'"><td class="td" style="font-weight:600">'+g.spec.replace(/_/g,' ')+'</td><td class="td" style="font-family:monospace">'+g.w+' \u00d7 '+g.h+'</td><td class="td" style="font-weight:700">'+g.qty+'</td></tr>';
    });
    m += '</tbody></table></div>';
  }

  // Supplier + PO fields
  m += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Supplier</label><select class="sel" style="font-size:12px" onchange="updateGlassOrder(\''+order.id+'\',\'glassSupplier\',this.value)"><option value="">Select\u2026</option><option value="Viridian"'+(order.glassSupplier==='Viridian'?' selected':'')+'>Viridian Glass</option><option value="CSR"'+(order.glassSupplier==='CSR'?' selected':'')+'>CSR Building Products</option><option value="Metro"'+(order.glassSupplier==='Metro'?' selected':'')+'>Metro Glass</option><option value="Other"'+(order.glassSupplier==='Other'?' selected':'')+'>Other</option></select></div>'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">PO Number</label><input class="inp" style="font-size:12px" value="'+(order.glassPO||'')+'" onblur="updateGlassOrder(\''+order.id+'\',\'glassPO\',this.value)" placeholder="PO-2026-0123"></div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Date Ordered</label><input type="date" class="inp" style="font-size:12px" value="'+(order.glassOrderedDate||'')+'" onchange="updateGlassOrder(\''+order.id+'\',\'glassOrderedDate\',this.value)"></div>'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Expected Delivery</label><input type="date" class="inp" style="font-size:12px" value="'+(order.glassExpectedDate||'')+'" onchange="updateGlassOrder(\''+order.id+'\',\'glassExpectedDate\',this.value)"></div></div>';

  // Glass order file upload (MANDATORY)
  m += '<div style="padding:14px;background:'+(order.glassOrderFile?'#f0fdf4':'#fef2f2')+';border:1.5px solid '+(order.glassOrderFile?'#86efac':'#fca5a5')+';border-radius:10px;margin-bottom:14px">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px">\ud83d\udcc4 Glass Order Document <span style="color:#ef4444">*mandatory</span></div>';
  if (order.glassOrderFile) {
    m += '<div style="display:flex;align-items:center;gap:8px"><a href="'+order.glassOrderFile.dataUrl+'" target="_blank" download="'+order.glassOrderFile.name+'" style="color:#3b82f6;text-decoration:none;font-weight:600;font-size:12px">\ud83d\udcce '+order.glassOrderFile.name+'</a>'
      +'<span style="font-size:10px;color:#6b7280">Uploaded '+(order.glassOrderFile.uploadedAt?new Date(order.glassOrderFile.uploadedAt).toLocaleDateString('en-AU'):'')+'</span>'
      +'<button onclick="updateGlassOrder(\''+order.id+'\',\'glassOrderFile\',null)" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:10px;font-weight:600">\u2715 Remove</button></div>';
  } else {
    m += '<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#fff;border:1.5px dashed #fca5a5;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;color:#ef4444">\ud83d\udcc4 Upload Glass Order (PDF/Image)'
      +'<input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv" style="display:none" onchange="var file=this.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(e){updateGlassOrder(\''+order.id+'\',\'glassOrderFile\',{name:file.name,dataUrl:e.target.result,uploadedAt:new Date().toISOString()});document.getElementById(\'glassModal\').remove();showGlassOrderModal(\''+order.id+'\');};reader.readAsDataURL(file);"></label>';
  }
  m += '</div>';

  // Email send section
  var emailTo = order.glassSupplier === 'Viridian' ? 'orders@viridian.com.au' : order.glassSupplier === 'CSR' ? 'orders@csr.com.au' : order.glassSupplier === 'Metro' ? 'orders@metroglass.com.au' : '';
  var emailSubject = encodeURIComponent('Glass Order - ' + order.jid);
  var emailBody = encodeURIComponent('Hi,\n\nPlease find attached glass order for:\n\nJob: ' + order.jid + '\nClient: ' + order.customer + '\nSite Address: ' + order.address + '\nPO Number: ' + (order.glassPO || 'TBC') + '\nTotal Panes: ' + totalPanes + '\n\nPlease confirm receipt and expected delivery date.\n\nRegards,\nSpartan Double Glazing');

  m += '<div style="padding:14px;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;margin-bottom:14px">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px">\ud83d\udce7 Send Glass Order to Supplier</div>'
    +'<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Supplier Email</label>'
    +'<input class="inp" id="glassEmailTo" style="font-size:12px" value="'+emailTo+'" placeholder="supplier@example.com"></div>'
    +'<a id="glassEmailBtn" href="mailto:'+emailTo+'?subject='+emailSubject+'&body='+emailBody+'" onclick="var to=document.getElementById(\'glassEmailTo\').value;if(!to){alert(\'Enter supplier email\');return false;}this.href=\'mailto:\'+to+\'?subject='+emailSubject+'&body='+emailBody+'\'" style="display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:#c41230;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap">\ud83d\udce7 Send Email</a></div>'
    +(order.glassOrderFile?'<div style="font-size:10px;color:#0369a1;margin-top:6px">\u2139\ufe0f Attach <strong>'+order.glassOrderFile.name+'</strong> to the email manually after your email client opens.</div>':'<div style="font-size:10px;color:#ef4444;margin-top:6px">\u26a0\ufe0f Upload the glass order document above before sending.</div>')
    +'</div>';

  // Action buttons
  m += '<div style="display:flex;gap:8px">';
  if ((order.glassStatus||'not_ordered') === 'not_ordered') {
    m += '<button onclick="if(!getFactoryOrders().find(function(o){return o.id===\''+order.id+'\';}).glassOrderFile){addToast(\'\u26a0\ufe0f Upload the glass order document first\',\'error\');return;}updateGlassOrder(\''+order.id+'\',\'glassStatus\',\'ordered\');this.closest(\'.modal-bg\').remove()" class="btn-r" style="flex:1;justify-content:center">\ud83d\udce6 Mark Glass as Ordered</button>';
  } else if (order.glassStatus === 'ordered') {
    m += '<button onclick="updateGlassOrder(\''+order.id+'\',\'glassStatus\',\'received\');this.closest(\'.modal-bg\').remove()" class="btn-r" style="flex:1;justify-content:center;background:#22c55e">\u2705 Mark Glass as Received</button>';
  } else {
    m += '<div style="flex:1;padding:10px;text-align:center;background:#f0fdf4;border-radius:8px;color:#15803d;font-weight:700">\u2705 Glass received '+(order.glassReceivedDate||'')+'</div>';
  }
  m += '</div></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', m);
}

// ── Profile Ordering Protocol (Aluplast) ────────────────────────────────────
// ── Profile Ordering Protocol (Aluplast) ────────────────────────────────────
var PROFILE_STATUSES = [
  {key:'not_ordered',label:'Not Ordered',col:'#9ca3af',icon:'\u23f3'},
  {key:'ordered',label:'Ordered',col:'#3b82f6',icon:'\ud83d\udce6'},
  {key:'received',label:'Received',col:'#22c55e',icon:'\u2705'},
];
function getProfileStatusObj(key){return PROFILE_STATUSES.find(function(s){return s.key===key;})||PROFILE_STATUSES[0];}

function updateProfileOrder(orderId, field, value) {
  var orders = getFactoryOrders();
  orders = orders.map(function(o) {
    if (o.id !== orderId) return o;
    var u = {}; u[field] = value;
    if (field === 'profileStatus' && value === 'ordered' && !o.profileOrderedDate) u.profileOrderedDate = new Date().toISOString().slice(0,10);
    if (field === 'profileStatus' && value === 'received' && !o.profileReceivedDate) u.profileReceivedDate = new Date().toISOString().slice(0,10);
    return Object.assign({}, o, u);
  });
  saveFactoryOrders(orders);
  var order = orders.find(function(o){return o.id===orderId;});
  if (order && order.crmJobId) logJobAudit(order.crmJobId, 'Profile ' + (field === 'profileStatus' ? value : field), String(value).slice(0,50));
  renderPage();
}

function showProfileOrderModal(orderId) {
  var order = getFactoryOrders().find(function(o){return o.id===orderId;});
  if (!order) return;
  var ps = getProfileStatusObj(order.profileStatus || 'not_ordered');
  var isOverdue = (order.profileStatus||'not_ordered') === 'not_ordered';
  var crmJob = (getState().jobs||[]).find(function(j){return j.factoryOrderId===orderId||j.id===order.crmJobId;});
  var cadData = crmJob ? (crmJob.cadSurveyData||crmJob.cadData) : null;
  var frames = cadData && cadData.projectItems ? cadData.projectItems : [];

  // Extract profile systems from frames
  var profileSystems = {};
  frames.forEach(function(f) {
    var sys = f.profileSystem || 'ideal_4000';
    var col = f.colour || f.colourExternal || 'white_body';
    var key = sys + '_' + col;
    if (!profileSystems[key]) profileSystems[key] = {system:sys, colour:col, count:0, totalPerim:0};
    profileSystems[key].count++;
    var w = (f.width || f.widthMm || 0) / 1000;
    var h = (f.height || f.heightMm || 0) / 1000;
    profileSystems[key].totalPerim += (w + h) * 2;
  });
  var SYSNAMES = {ideal_4000:'Aluplast Ideal 4000',vario_slide:'Aluplast Vario-Slide',casement_75:'Casement 75.5 T-Sash',lift_slide:'Lift-Slide 85mm',smart_slide:'Smart-Slide'};

  var m = '<div class="modal-bg" id="profileModal" onclick="if(event.target===this){this.remove();}"><div class="modal" style="max-width:620px;max-height:90vh;overflow-y:auto">'
    +'<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;'+(isOverdue?'background:#fef2f2':'')+'"><h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">\ud83d\udce6 Profile Order \u2014 '+order.jid+(isOverdue?' <span style="color:#ef4444;font-size:12px">\ud83d\udea8 NOT ORDERED</span>':'')+'</h3><button onclick="this.closest(\'.modal-bg\').remove()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px">\u00d7</button></div>'
    +'<div style="padding:20px">';

  // Status strip
  m += '<div style="display:flex;gap:8px;margin-bottom:16px"><div style="flex:1;padding:10px;border-radius:8px;background:'+(isOverdue?'#ef4444':''+ps.col)+'15;border:1.5px solid '+(isOverdue?'#ef4444':ps.col)+'40;text-align:center"><div style="font-size:18px">'+ps.icon+'</div><div style="font-size:12px;font-weight:700;color:'+(isOverdue?'#ef4444':ps.col)+'">'+ps.label+'</div></div>'
    +'<div style="flex:1;padding:10px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280">SUPPLIER</div><div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-top:2px">Aluplast Australia</div></div>'
    +'<div style="flex:1;padding:10px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center"><div style="font-size:10px;font-weight:700;color:#6b7280">FRAMES</div><div style="font-size:18px;font-weight:800;margin-top:2px">'+frames.length+'</div></div></div>';

  // Profile spec table from CAD
  if (Object.keys(profileSystems).length > 0) {
    m += '<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">Profile Requirements (from Spartan CAD)</div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th">Profile System</th><th class="th">Colour</th><th class="th">Frames</th><th class="th">Perimeter (m)</th></tr></thead><tbody>';
    Object.values(profileSystems).forEach(function(p,i) {
      m += '<tr style="'+(i%2?'background:#fafafa':'')+'"><td class="td" style="font-weight:600">'+(SYSNAMES[p.system]||p.system)+'</td><td class="td">'+p.colour.replace(/_/g,' ')+'</td><td class="td" style="font-weight:700">'+p.count+'</td><td class="td" style="font-family:monospace">'+p.totalPerim.toFixed(1)+'m</td></tr>';
    });
    m += '</tbody></table></div>';
  }

  // PO + delivery fields
  m += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">PO Number</label><input class="inp" style="font-size:12px" value="'+(order.profilePO||'')+'" onblur="updateProfileOrder(\''+order.id+'\',\'profilePO\',this.value)" placeholder="PO-ALU-2026-001"></div>'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Delivery Date</label><input type="date" class="inp" style="font-size:12px" value="'+(order.profileDeliveryDate||'')+'" onchange="updateProfileOrder(\''+order.id+'\',\'profileDeliveryDate\',this.value)"></div></div>';

  // Profile order file upload (MANDATORY)
  m += '<div style="padding:14px;background:'+(order.profileOrderFile?'#f0fdf4':'#fef2f2')+';border:1.5px solid '+(order.profileOrderFile?'#86efac':'#fca5a5')+';border-radius:10px;margin-bottom:14px">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px">\ud83d\udcc4 Aluplast Order PDF <span style="color:#ef4444">*mandatory</span></div>';
  if (order.profileOrderFile) {
    m += '<div style="display:flex;align-items:center;gap:8px"><a href="'+order.profileOrderFile.dataUrl+'" target="_blank" download="'+order.profileOrderFile.name+'" style="color:#3b82f6;text-decoration:none;font-weight:600;font-size:12px">\ud83d\udcce '+order.profileOrderFile.name+'</a>'
      +'<span style="font-size:10px;color:#6b7280">Uploaded '+(order.profileOrderFile.uploadedAt?new Date(order.profileOrderFile.uploadedAt).toLocaleDateString('en-AU'):'')+'</span>'
      +'<button onclick="updateProfileOrder(\''+order.id+'\',\'profileOrderFile\',null)" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:10px;font-weight:600">\u2715 Remove</button></div>';
  } else {
    m += '<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#fff;border:1.5px dashed #fca5a5;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;color:#ef4444">\ud83d\udcc4 Upload Aluplast Order PDF'
      +'<input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv" style="display:none" onchange="var file=this.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(e){updateProfileOrder(\''+order.id+'\',\'profileOrderFile\',{name:file.name,dataUrl:e.target.result,uploadedAt:new Date().toISOString()});document.getElementById(\'profileModal\').remove();showProfileOrderModal(\''+order.id+'\');};reader.readAsDataURL(file);"></label>';
  }
  m += '</div>';

  // Email send
  var emailSubject = encodeURIComponent('Profile Order - ' + order.jid + (order.profilePO ? ' - ' + order.profilePO : ''));
  var emailBody = encodeURIComponent('Hi Aluplast,\n\nPlease find attached profile order for:\n\nJob: ' + order.jid + '\nClient: ' + order.customer + '\nSite Address: ' + order.address + '\nPO Number: ' + (order.profilePO || 'TBC') + '\nFrames: ' + frames.length + '\n\nPlease confirm receipt and delivery date.\n\nRegards,\nSpartan Double Glazing');

  m += '<div style="padding:14px;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;margin-bottom:14px">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px">\ud83d\udce7 Send Profile Order to Aluplast</div>'
    +'<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Aluplast Email</label>'
    +'<input class="inp" id="profileEmailTo" style="font-size:12px" value="sales@aluplast.com.au" placeholder="sales@aluplast.com.au"></div>'
    +'<a href="mailto:sales@aluplast.com.au?subject='+emailSubject+'&body='+emailBody+'" onclick="var to=document.getElementById(\'profileEmailTo\').value;if(!to){alert(\'Enter email\');return false;}this.href=\'mailto:\'+to+\'?subject='+emailSubject+'&body='+emailBody+'\'" style="display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:#c41230;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap">\ud83d\udce7 Send Email</a></div>'
    +(order.profileOrderFile?'<div style="font-size:10px;color:#0369a1;margin-top:6px">\u2139\ufe0f Attach <strong>'+order.profileOrderFile.name+'</strong> to the email.</div>':'<div style="font-size:10px;color:#ef4444;margin-top:6px">\u26a0\ufe0f Upload the Aluplast order PDF above first.</div>')
    +'</div>';

  // Action buttons
  m += '<div style="display:flex;gap:8px">';
  if ((order.profileStatus||'not_ordered') === 'not_ordered') {
    m += '<button onclick="if(!getFactoryOrders().find(function(o){return o.id===\''+order.id+'\';}).profileOrderFile){addToast(\'\u26a0\ufe0f Upload the Aluplast order PDF first\',\'error\');return;}updateProfileOrder(\''+order.id+'\',\'profileStatus\',\'ordered\');this.closest(\'.modal-bg\').remove()" class="btn-r" style="flex:1;justify-content:center">\ud83d\udce6 Mark Profiles as Ordered</button>';
  } else if (order.profileStatus === 'ordered') {
    m += '<button onclick="updateProfileOrder(\''+order.id+'\',\'profileStatus\',\'received\');this.closest(\'.modal-bg\').remove()" class="btn-r" style="flex:1;justify-content:center;background:#22c55e">\u2705 Mark Profiles as Received</button>';
  } else {
    m += '<div style="flex:1;padding:10px;text-align:center;background:#f0fdf4;border-radius:8px;color:#15803d;font-weight:700">\u2705 Profiles received</div>';
  }
  m += '</div></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', m);
}

function advanceFactoryOrder(orderId) {
  var orders=getFactoryOrders(); var order=orders.find(function(o){return o.id===orderId;});
  if(!order)return; var idx=FACTORY_STATUS_ORDER.indexOf(order.status);
  if(idx<0||idx>=FACTORY_STATUS_ORDER.length-1)return;
  var nextStatus = FACTORY_STATUS_ORDER[idx+1];
  // GLASS GATE: Cannot advance past materials_ordered unless glass is ordered
  if (nextStatus === 'in_production' && (!order.glassStatus || order.glassStatus === 'not_ordered')) {
    addToast('\u26a0\ufe0f Glass must be ordered before starting production.', 'error');
    showGlassOrderModal(orderId);
    return;
  }
  // PROFILE GATE: Cannot advance past materials_ordered unless profiles are ordered
  if (nextStatus === 'in_production' && (!order.profileStatus || order.profileStatus === 'not_ordered')) {
    addToast('\u26a0\ufe0f Aluplast profiles must be ordered before starting production.', 'error');
    showProfileOrderModal(orderId);
    return;
  }
  order.status=nextStatus; saveFactoryOrders(orders);
  var crmJob=(getState().jobs||[]).find(function(j){return j.factoryOrderId===orderId||j.id===order.crmJobId;});
  if(crmJob){setState({jobs:getState().jobs.map(function(j){return j.id===crmJob.id?Object.assign({},j,{productionStatus:order.status}):j;})});
    if(order.status==='dispatched')logJobAudit(crmJob.id,'Dispatched','All frames dispatched');}
  renderPage();
}

function moveFactoryItem(itemId, toStation) {
  var items=getFactoryItems();
  items=items.map(function(it){if(it.id!==itemId)return it;var hist=it.stationHistory||[];hist.push({station:toStation,at:new Date().toISOString()});return Object.assign({},it,{station:toStation,stationHistory:hist});});
  saveFactoryItems(items);renderPage();
}

function renderFactoryDash() {
  var orders=getFactoryOrders();var items=getFactoryItems();var jobs=getState().jobs||[];var contacts=getState().contacts||[];
  var branch=getState().branch||'all';
  if(branch!=='all')orders=orders.filter(function(o){return o.branch===branch;});
  var awaitingProd=jobs.filter(function(j){return j.finalSignedAt&&!j.productionStatus&&j.status!=='h_completed_standard'&&j.status!=='i_cancelled';});
  var inFactory=orders.filter(function(o){return o.status!=='dispatched';});
  var dispatched=orders.filter(function(o){return o.status==='dispatched';});
  var stationLoad={};FACTORY_STATIONS.forEach(function(s){stationLoad[s.id]=items.filter(function(i){return i.station===s.id;}).length;});

  var h='<div style="margin-bottom:20px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">\ud83c\udfed Factory CRM</h2><p style="color:#6b7280;font-size:13px;margin:4px 0 0">Production management \u2014 from signed-off designs through to dispatch</p></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">';
  [{l:'Awaiting Entry',v:awaitingProd.length,c:'#c41230'},{l:'In Factory',v:inFactory.length,c:'#f59e0b'},{l:'Frames on Floor',v:items.filter(function(i){return i.station!=='complete';}).length,c:'#3b82f6'},{l:'Dispatched',v:dispatched.length,c:'#22c55e'},{l:'Factory Value',v:'$'+Math.round(inFactory.reduce(function(s,o){return s+(o.value||0);},0)/1000)+'k',c:'#a855f7'}].forEach(function(k){h+='<div class="card" style="padding:14px 18px;border-left:4px solid '+k.c+'"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">'+k.l+'</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:'+k.c+';margin-top:4px">'+k.v+'</div></div>';});
  h+='</div>';

  // Station load
  h+='<div class="card" style="padding:16px;margin-bottom:16px"><div style="font-size:13px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:12px">Station Load</div><div style="display:flex;gap:8px">';
  FACTORY_STATIONS.forEach(function(s){var count=stationLoad[s.id]||0;var pct=s.cap>0?Math.round(count/s.cap*100):0;var col=pct>80?'#ef4444':pct>50?'#f59e0b':count>0?'#22c55e':'#d1d5db';
    h+='<div style="flex:1;text-align:center;padding:10px 6px;border-radius:8px;background:'+col+'10;border:1px solid '+col+'30"><div style="font-size:16px">'+s.icon+'</div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:'+col+'">'+count+'</div><div style="font-size:9px;color:#6b7280;margin-top:2px">'+s.name+'</div><div style="font-size:8px;color:#9ca3af">cap: '+s.cap+'/day</div></div>';});
  h+='</div></div>';

  // Glass Ordering Protocol
  var glassAlerts = getGlassAlerts(orders);
  var profileNotOrdered = orders.filter(function(o){return o.status!=='dispatched'&&(o.profileStatus||'not_ordered')==='not_ordered';});
  var profileOrdered = orders.filter(function(o){return o.profileStatus==='ordered';});
  var profileReceived = orders.filter(function(o){return o.profileStatus==='received';});
  var glassUrgent = glassAlerts.overdue.length + glassAlerts.dueThisWeek.length;
  var totalUrgent = glassUrgent + profileNotOrdered.length;
  h+='<div class="card" style="padding:16px;margin-bottom:16px;border-left:4px solid '+(totalUrgent>0?'#ef4444':'#22c55e')+'"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:'+(totalUrgent>0?'12':'0')+'px"><div><div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif">\ud83d\udce6 Material Orders Protocol</div><div style="font-size:12px;color:#6b7280;margin-top:2px">Glass (3 weeks lead) + Aluplast Profiles \u2014 must be ordered before production</div></div>'
    +'<div style="display:flex;gap:4px;flex-wrap:wrap">'
    +'<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#ef444420;color:#ef4444;border:1px solid #ef444440">\ud83e\ude9f Glass Overdue: '+glassAlerts.overdue.length+'</span>'
    +'<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#f59e0b20;color:#f59e0b;border:1px solid #f59e0b40">\ud83e\ude9f This Week: '+glassAlerts.dueThisWeek.length+'</span>'
    +'<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#ef444420;color:#ef4444;border:1px solid #ef444440">\ud83d\udce6 Profiles Not Ordered: '+profileNotOrdered.length+'</span>'
    +'<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#3b82f620;color:#3b82f6;border:1px solid #3b82f640">\ud83d\udce6 Ordered: '+(glassAlerts.ordered.length+profileOrdered.length)+'</span>'
    +'<span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:#22c55e20;color:#22c55e;border:1px solid #22c55e40">\u2705 Received: '+(glassAlerts.received.length+profileReceived.length)+'</span></div></div>';
  // Show overdue + due this week
  var urgentGlass = glassAlerts.overdue.concat(glassAlerts.dueThisWeek);
  var allUrgent = [];
  urgentGlass.forEach(function(o){allUrgent.push(Object.assign({},o,{urgentType:'glass'}));});
  profileNotOrdered.forEach(function(o){if(!allUrgent.find(function(u){return u.id===o.id;}))allUrgent.push(Object.assign({},o,{urgentType:'profile'}));else{var ex=allUrgent.find(function(u){return u.id===o.id;});if(ex)ex.urgentType='both';}});
  if(allUrgent.length > 0) {
    h+='<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Frames</th><th class="th">Needs</th><th class="th"></th></tr></thead><tbody>';
    allUrgent.forEach(function(o,i){
      var needsGlass = (o.glassStatus||'not_ordered')==='not_ordered';
      var needsProfile = (o.profileStatus||'not_ordered')==='not_ordered';
      var needsStr = (needsGlass?'\ud83e\ude9f Glass ':'')+(needsProfile?'\ud83d\udce6 Profiles':'');
      h+='<tr style="background:#fef2f2"><td class="td" style="font-weight:700;color:#c41230">'+o.jid+'</td><td class="td">'+o.customer+'</td><td class="td">'+o.frameCount+'</td><td class="td" style="font-weight:700;color:#ef4444">'+needsStr+'</td><td class="td" style="white-space:nowrap">'+(needsGlass?'<button onclick="showGlassOrderModal(\''+o.id+'\')" class="btn-r" style="font-size:9px;padding:2px 8px;margin-right:4px">\ud83e\ude9f Glass</button>':'')+(needsProfile?'<button onclick="showProfileOrderModal(\''+o.id+'\')" class="btn-r" style="font-size:9px;padding:2px 8px;background:#7c3aed">\ud83d\udce6 Profiles</button>':'')+'</td></tr>';
    });
    h+='</tbody></table>';
  }
  h+='</div>';

  if(awaitingProd.length>0){h+='<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px"><div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">\u26a1 Ready to Enter Production ('+awaitingProd.length+')</h4></div><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Suburb</th><th class="th">Value</th><th class="th">Frames</th><th class="th">Signed</th><th class="th"></th></tr></thead><tbody>';
    awaitingProd.forEach(function(j,i){var c=contacts.find(function(ct){return ct.id===j.contactId;});var frames=(j.cadSurveyData||j.cadData||{}).projectItems||[];h+='<tr style="'+(i%2?'background:#fafafa':'')+'"><td class="td" style="font-weight:700;color:#c41230">'+(j.jobNumber||'')+'</td><td class="td">'+(c?c.fn+' '+c.ln:'\u2014')+'</td><td class="td">'+(j.suburb||'')+'</td><td class="td" style="font-weight:600">$'+Number(j.val||0).toLocaleString()+'</td><td class="td">'+frames.length+'</td><td class="td">'+(j.finalSignedAt?new Date(j.finalSignedAt).toLocaleDateString('en-AU'):'\u2014')+'</td><td class="td"><button onclick="pushJobToFactory(\''+j.id+'\')" class="btn-r" style="font-size:10px;padding:4px 14px">\ud83c\udfed Send to Factory</button></td></tr>';});
    h+='</tbody></table></div>';}
  if(inFactory.length>0){h+='<div class="card" style="padding:0;overflow:hidden"><div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">\ud83d\udee0\ufe0f Active Orders ('+inFactory.length+')</h4></div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Frames</th><th class="th">Value</th><th class="th">Status</th><th class="th">\ud83e\ude9f Glass</th><th class="th">\ud83d\udce6 Profiles</th><th class="th">Install</th><th class="th" style="width:140px">Advance</th></tr></thead><tbody>';
    inFactory.forEach(function(o,i){var ps=getFactoryStatusObj(o.status);var gs=getGlassStatusObj(o.glassStatus||'not_ordered');var prs=getProfileStatusObj(o.profileStatus||'not_ordered');var glassOverdue=(o.glassStatus||'not_ordered')==='not_ordered';var profileOverdue=(o.profileStatus||'not_ordered')==='not_ordered';var rowRed=glassOverdue||profileOverdue;var nextIdx=FACTORY_STATUS_ORDER.indexOf(o.status)+1;var nextSt=nextIdx<FACTORY_STATUS_ORDER.length?FACTORY_STATUS_ORDER[nextIdx]:null;h+='<tr style="'+(rowRed?'background:#fef2f2':i%2?'background:#fafafa':'')+'"><td class="td" style="font-weight:700;color:#c41230">'+o.jid+'</td><td class="td">'+o.customer+'</td><td class="td">'+o.frameCount+'</td><td class="td" style="font-weight:600">$'+Number(o.value||0).toLocaleString()+'</td><td class="td"><span class="bdg" style="background:'+ps.col+'20;color:'+ps.col+';border:1px solid '+ps.col+'40;font-size:10px">'+ps.label+'</span></td><td class="td" style="'+(glassOverdue?'background:#fef2f2':'')+'"><span onclick="showGlassOrderModal(\''+o.id+'\')" style="cursor:pointer;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;'+(glassOverdue?'background:#ef4444;color:#fff':'color:'+gs.col)+'">'+gs.icon+' '+gs.label+(glassOverdue?' \ud83d\udea8':'')+'</span></td><td class="td" style="'+(profileOverdue?'background:#fef2f2':'')+'"><span onclick="showProfileOrderModal(\''+o.id+'\')" style="cursor:pointer;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;'+(profileOverdue?'background:#ef4444;color:#fff':'color:'+prs.col)+'">'+prs.icon+' '+prs.label+(profileOverdue?' \ud83d\udea8':'')+'</span></td><td class="td">'+(o.installDate||'\u2014')+'</td><td class="td">'+(nextSt?'<button onclick="advanceFactoryOrder(\''+o.id+'\')" class="btn-w" style="font-size:10px;padding:3px 10px">\u2192 '+getFactoryStatusObj(nextSt).label+'</button>':'<span style="color:#22c55e;font-weight:600">\u2705</span>')+'</td></tr>';});
    h+='</tbody></table></div>';}
  return '<div>'+h+'</div>';
}

function renderProdQueue() {
  var orders=getFactoryOrders();var branch=getState().branch||'all';
  if(branch!=='all')orders=orders.filter(function(o){return o.branch===branch;});
  var h='<div style="margin-bottom:20px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">\ud83d\udccb Production Queue</h2><p style="color:#6b7280;font-size:13px;margin:4px 0 0">All factory orders \u2014 set material delivery dates and advance through production</p></div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">';
  FACTORY_ORDER_STATUSES.forEach(function(s){var count=orders.filter(function(o){return o.status===s.key;}).length;h+='<span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;background:'+s.col+'15;color:'+s.col+';border:1px solid '+s.col+'30">'+s.label+' ('+count+')</span>';});h+='</div>';
  if(orders.length===0){h+='<div class="card" style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:36px;margin-bottom:8px">\ud83c\udfed</div>No orders. Jobs appear after Final Sign Off \u2192 Send to Factory.</div>';}
  else{h+='<div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Frames</th><th class="th">Value</th><th class="th">Status</th><th class="th">\ud83e\ude9f Glass</th><th class="th">\ud83d\udce6 Profiles</th><th class="th">Material Delivery</th><th class="th">Est. Complete</th><th class="th">Install</th><th class="th" style="width:130px">Advance</th></tr></thead><tbody>';
    orders.forEach(function(o,i){
      var ps=getFactoryStatusObj(o.status);
      var gs=getGlassStatusObj(o.glassStatus||'not_ordered');
      var prs=getProfileStatusObj(o.profileStatus||'not_ordered');
      var glassNotOrdered=(o.glassStatus||'not_ordered')==='not_ordered';
      var profileNotOrdered=(o.profileStatus||'not_ordered')==='not_ordered';
      var nextIdx=FACTORY_STATUS_ORDER.indexOf(o.status)+1;
      var nextSt=nextIdx<FACTORY_STATUS_ORDER.length?FACTORY_STATUS_ORDER[nextIdx]:null;
      var pmB=o.paymentMethod==='zip'?'<span style="background:#faf5ff;color:#7c3aed;font-size:9px;font-weight:800;padding:1px 6px;border-radius:4px;border:1px solid #c4b5fd">ZIP</span>':'<span style="background:#f0fdf4;color:#15803d;font-size:9px;font-weight:800;padding:1px 6px;border-radius:4px;border:1px solid #86efac">COD</span>';
      // Estimate completion
      var est=estimateOrderMinutes(o);
      var prodDays=Math.ceil((est.totals[est.bottleneck]||0)/480)||1;
      var estComplete='\u2014';
      if(o.materialDeliveryDate){
        var md=new Date(o.materialDeliveryDate);
        var cd=new Date(md);
        var daysAdded=0;
        while(daysAdded<prodDays){cd.setDate(cd.getDate()+1);if(cd.getDay()!==0&&cd.getDay()!==6)daysAdded++;}
        estComplete='<span style="font-weight:700;color:#3b82f6">'+cd.toLocaleDateString('en-AU')+'</span>';
      } else {
        estComplete='<span style="color:#f59e0b;font-size:10px">\u26a0 Set materials date</span>';
      }
      h+='<tr style="'+(i%2?'background:#fafafa':'')+'">'
        +'<td class="td" style="font-weight:700;color:#c41230">'+o.jid+'</td>'
        +'<td class="td">'+o.customer+'</td>'
        +'<td class="td">'+o.frameCount+'</td>'
        +'<td class="td" style="font-weight:600">$'+Number(o.value||0).toLocaleString()+'</td>'
        +'<td class="td">'+pmB+'</td>'
        +'<td class="td"><span class="bdg" style="background:'+ps.col+'20;color:'+ps.col+';border:1px solid '+ps.col+'40;font-size:10px">'+ps.label+'</span></td>'
        +'<td class="td" style="'+((o.glassStatus||'not_ordered')==='not_ordered'?'background:#fef2f2':'')+'"><span onclick="showGlassOrderModal(\''+o.id+'\')" style="cursor:pointer;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;'+((o.glassStatus||'not_ordered')==='not_ordered'?'background:#ef4444;color:#fff':'color:'+gs.col)+'">'+gs.icon+' '+gs.label+((o.glassStatus||'not_ordered')==='not_ordered'?' \ud83d\udea8':'')+'</span></td>'
        +'<td class="td" style="'+(profileNotOrdered?'background:#fef2f2':'')+'"><span onclick="showProfileOrderModal(\''+o.id+'\')" style="cursor:pointer;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;'+(profileNotOrdered?'background:#ef4444;color:#fff':'color:'+prs.col)+'">'+prs.icon+' '+prs.label+(profileNotOrdered?' \ud83d\udea8':'')+'</span></td>'
        +'<td class="td"><input type="date" class="inp" style="font-size:11px;padding:4px 6px;width:130px" value="'+(o.materialDeliveryDate||'')+'" onchange="updateFactoryOrderField(\''+o.id+'\',\'materialDeliveryDate\',this.value)"></td>'
        +'<td class="td">'+estComplete+'</td>'
        +'<td class="td" style="font-size:11px">'+(o.installDate||'\u2014')+'</td>'
        +'<td class="td">'+(nextSt?'<button onclick="advanceFactoryOrder(\''+o.id+'\')" class="btn-w" style="font-size:10px;padding:3px 10px">\u2192 '+getFactoryStatusObj(nextSt).label+'</button>':'<span style="color:#22c55e;font-weight:600">\u2705 Complete</span>')+'</td></tr>';
    });
    h+='</tbody></table></div></div>';}
  return '<div>'+h+'</div>';
}

function renderProdBoard() {
  var items=getFactoryItems();var branch=getState().branch||'all';
  if(branch!=='all'){var brOrders=getFactoryOrders().filter(function(o){return o.branch===branch;});var brIds=brOrders.map(function(o){return o.jid;});items=items.filter(function(i){return brIds.indexOf(i.orderId)>=0;});}
  var h='<div style="margin-bottom:16px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">\ud83d\udcca Production Board</h2><p style="color:#6b7280;font-size:13px;margin:4px 0 0">Kanban \u2014 move frames between stations</p></div>';
  if(items.length===0){return '<div>'+h+'<div class="card" style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:36px;margin-bottom:8px">\ud83c\udfed</div>No frames in production.</div></div>';}
  h+='<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:10px">';
  FACTORY_STATIONS.forEach(function(stn,sIdx){var stnItems=items.filter(function(i){return i.station===stn.id;});var nextStn=sIdx<FACTORY_STATIONS.length-1?FACTORY_STATIONS[sIdx+1]:null;
    h+='<div style="min-width:200px;flex:1;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;display:flex;flex-direction:column"><div style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center"><span style="font-size:16px">'+stn.icon+'</span><div style="font-size:12px;font-weight:700;margin-top:2px">'+stn.name+'</div><div style="font-size:10px;color:#9ca3af">'+stnItems.length+'/'+stn.cap+'</div></div><div style="flex:1;padding:6px;display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto">';
    if(stnItems.length===0)h+='<div style="color:#d1d5db;font-size:10px;text-align:center;padding:12px">\u2014</div>';
    var PL={awning_window:'AWN',casement_window:'CAS',sliding_window:'SLD',fixed_window:'FIX',tilt_turn_window:'T&T',double_hung_window:'DH',bifold_door:'BFD',sliding_door:'SLD-D',french_door:'FRN',lift_slide_door:'L&S',smart_slide_door:'SMS'};
    stnItems.forEach(function(it){h+='<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px;font-size:10px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;color:#c41230">'+(it.name||'')+'</span><span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#f3f4f6;color:#6b7280">'+(PL[it.productType]||'')+'</span></div><div style="color:#6b7280;margin-top:2px">'+(it.widthMm||0)+'\u00d7'+(it.heightMm||0)+'mm</div><div style="color:#9ca3af;font-size:9px">'+(it.customer||'')+' \u00b7 '+(it.suburb||'')+'</div>'+(it.rework?'<div style="color:#ef4444;font-weight:700;font-size:9px;margin-top:2px">\u26a0\ufe0f REWORK</div>':'')+(nextStn?'<button onclick="moveFactoryItem(\''+it.id+'\',\''+nextStn.id+'\')" style="margin-top:4px;width:100%;padding:3px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;font-size:9px;cursor:pointer;color:#3b82f6;font-weight:600">\u2192 '+nextStn.name+'</button>':'<button onclick="moveFactoryItem(\''+it.id+'\',\'complete\')" style="margin-top:4px;width:100%;padding:3px;border:none;border-radius:4px;background:#22c55e;font-size:9px;cursor:pointer;color:#fff;font-weight:600">\u2705 Complete</button>')+'</div>';});
    h+='</div></div>';});
  h+='</div>';return '<div>'+h+'</div>';
}

// ── BOM & Cut Sheets ────────────────────────────────────────────────────────
function renderFactoryBOM() {
  var orders = getFactoryOrders();
  var branch = getState().branch || 'all';
  if (branch !== 'all') orders = orders.filter(function(o){return o.branch===branch;});

  var h = '<div style="margin-bottom:20px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">\ud83d\udccb BOM & Cut Sheets</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Bill of Materials and cut sheet generation for factory orders</p></div>';

  if (orders.length === 0) {
    h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:36px;margin-bottom:8px">\ud83d\udccb</div>No factory orders yet. Send jobs from the Factory Dashboard after Final Sign Off.</div>';
  } else {
    h += '<div class="card" style="padding:0;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Frames</th><th class="th">Value</th><th class="th">Status</th><th class="th">BOM</th></tr></thead><tbody>';
    orders.forEach(function(o,i){
      var ps = getFactoryStatusObj(o.status);
      var hasBOM = o.status !== 'received';
      h += '<tr style="'+(i%2?'background:#fafafa':'')+'">'
        +'<td class="td" style="font-weight:700;color:#c41230">'+o.jid+'</td>'
        +'<td class="td">'+o.customer+'</td>'
        +'<td class="td">'+o.frameCount+'</td>'
        +'<td class="td" style="font-weight:600">$'+Number(o.value||0).toLocaleString()+'</td>'
        +'<td class="td"><span class="bdg" style="background:'+ps.col+'20;color:'+ps.col+';border:1px solid '+ps.col+'40;font-size:10px">'+ps.label+'</span></td>'
        +'<td class="td">'+(hasBOM?'<span style="color:#22c55e;font-weight:600">\u2705 Generated</span>':'<span style="color:#9ca3af">\u23f3 Pending</span>')+'</td></tr>';
    });
    h += '</tbody></table></div>';
  }

  h += '<div class="card" style="padding:16px;margin-top:16px;border-left:3px solid #3b82f6">'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:4px">\u2139\ufe0f BOM Engine</div>'
    +'<div style="font-size:12px;color:#6b7280">The full BOM engine with profile cut lengths, steel, glass, gasket, and hardware calculations is powered by Spartan CAD\'s pricing engine. BOMs are auto-generated when a factory order advances past "Received" status.</div></div>';

  return '<div>'+h+'</div>';
}

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

function renderFactoryDispatch() {
  var orders=getFactoryOrders();var ready=orders.filter(function(o){return o.status==='ready_dispatch';});var dispatched=orders.filter(function(o){return o.status==='dispatched';});
  var h='<div style="margin-bottom:20px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">\ud83d\ude9a Dispatch</h2><p style="color:#6b7280;font-size:13px;margin:4px 0 0">Jobs ready to ship and dispatch history</p></div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px"><div class="card" style="padding:14px;border-left:4px solid #06b6d4"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Ready</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#06b6d4;margin-top:4px">'+ready.length+'</div></div><div class="card" style="padding:14px;border-left:4px solid #22c55e"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Dispatched</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:4px">'+dispatched.length+'</div></div></div>';
  if(ready.length>0){h+='<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px"><div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;background:#ecfeff"><h4 style="font-size:14px;font-weight:700;margin:0;color:#0e7490">\ud83d\udce6 Ready for Dispatch</h4></div><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Address</th><th class="th">Frames</th><th class="th"></th></tr></thead><tbody>';
    ready.forEach(function(o,i){h+='<tr style="'+(i%2?'background:#fafafa':'')+'"><td class="td" style="font-weight:700;color:#c41230">'+o.jid+'</td><td class="td">'+o.customer+'</td><td class="td">'+o.address+'</td><td class="td">'+o.frameCount+'</td><td class="td"><button onclick="advanceFactoryOrder(\''+o.id+'\')" class="btn-r" style="font-size:10px;padding:3px 12px">\ud83d\ude9a Dispatch</button></td></tr>';});h+='</tbody></table></div>';}
  if(dispatched.length>0){h+='<div class="card" style="padding:0;overflow:hidden"><div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;background:#f0fdf4"><h4 style="font-size:14px;font-weight:700;margin:0;color:#15803d">\u2705 Dispatched</h4></div><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job</th><th class="th">Client</th><th class="th">Address</th><th class="th">Frames</th><th class="th">Value</th></tr></thead><tbody>';
    dispatched.forEach(function(o,i){h+='<tr style="'+(i%2?'background:#fafafa':'')+'"><td class="td" style="font-weight:700;color:#22c55e">'+o.jid+'</td><td class="td">'+o.customer+'</td><td class="td">'+o.address+'</td><td class="td">'+o.frameCount+'</td><td class="td" style="font-weight:600">$'+Number(o.value||0).toLocaleString()+'</td></tr>';});h+='</tbody></table></div>';}
  return '<div>'+h+'</div>';
}


// FINAL SIGN OFF — Queue of jobs awaiting sales manager approval
// ══════════════════════════════════════════════════════════════════════════════

function renderFinalSignOff() {
  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var branch = getState().branch || 'all';
  if (branch !== 'all') jobs = jobs.filter(function(j){return j.branch===branch;});
  var now = new Date();

  var awaitingSignOff = jobs.filter(function(j){return j.cmCompletedAt && !j.finalSignedAt && j.status!=='h_completed_standard' && j.status!=='i_cancelled';});
  var recentlySigned = jobs.filter(function(j){return j.finalSignedAt;}).sort(function(a,b){return (b.finalSignedAt||'').localeCompare(a.finalSignedAt||'');}).slice(0,15);
  var cmInProgress = jobs.filter(function(j){return !j.cmCompletedAt && (j.cadSurveyData || j.cmBookedDate) && j.status!=='h_completed_standard' && j.status!=='i_cancelled';});
  var totalAwaitingVal = awaitingSignOff.reduce(function(s,j){return s+(j.val||0);},0);
  var signedThisMonth = recentlySigned.filter(function(j){return j.finalSignedAt&&j.finalSignedAt.slice(0,7)===now.toISOString().slice(0,7);});

  var h = '<div style="margin-bottom:20px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">\u270d\ufe0f Final Sign Off</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Jobs with completed check measures awaiting sales manager approval'+(branch!=='all'?' \u2014 '+branch:'')+'</p></div>';

  // KPIs
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">'
    +'<div class="card" style="padding:14px 18px;border-left:4px solid #c41230"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Awaiting Sign Off</div><div style="font-size:24px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:4px">'+awaitingSignOff.length+'</div></div>'
    +'<div class="card" style="padding:14px 18px;border-left:4px solid #f59e0b"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">CM In Progress</div><div style="font-size:24px;font-weight:800;font-family:Syne,sans-serif;color:#f59e0b;margin-top:4px">'+cmInProgress.length+'</div></div>'
    +'<div class="card" style="padding:14px 18px;border-left:4px solid #22c55e"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Signed This Month</div><div style="font-size:24px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:4px">'+signedThisMonth.length+'</div></div>'
    +'<div class="card" style="padding:14px 18px;border-left:4px solid #3b82f6"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Value Awaiting</div><div style="font-size:24px;font-weight:800;font-family:Syne,sans-serif;color:#3b82f6;margin-top:4px">$'+Math.round(totalAwaitingVal/1000)+'k</div></div></div>';

  // ── Awaiting Sign Off table ───────────────────────────────────────────────
  h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">'
    +'<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#fef2f2">'
    +'<h4 style="font-size:14px;font-weight:700;margin:0;color:#c41230">\u26a1 Awaiting Your Approval ('+awaitingSignOff.length+')</h4></div>';

  if (awaitingSignOff.length === 0) {
    h += '<div style="padding:40px;text-align:center;color:#22c55e;font-size:13px"><div style="font-size:36px;margin-bottom:8px">\u2705</div>All clear \u2014 no jobs awaiting sign off</div>';
  } else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
      +'<th class="th">Job #</th><th class="th">Client</th><th class="th">Suburb</th><th class="th">Branch</th><th class="th" style="text-align:right">Value</th><th class="th">Payment</th><th class="th">CM Completed</th><th class="th">Waiting</th><th class="th">Frames</th><th class="th" style="width:190px"></th>'
      +'</tr></thead><tbody>';
    awaitingSignOff.sort(function(a,b){return (a.cmCompletedAt||'').localeCompare(b.cmCompletedAt||'');}).forEach(function(j,i){
      var c = contacts.find(function(ct){return ct.id===j.contactId;});
      var cName = c ? c.fn+' '+c.ln : '\u2014';
      var cmDate = j.cmCompletedAt ? new Date(j.cmCompletedAt) : null;
      var waitDays = cmDate ? Math.floor((now-cmDate)/86400000) : 0;
      var waitCol = waitDays>7?'#ef4444':waitDays>3?'#f59e0b':'#22c55e';
      var frames = (j.cadSurveyData&&j.cadSurveyData.projectItems)?j.cadSurveyData.projectItems.length:(j.cadData&&j.cadData.projectItems)?j.cadData.projectItems.length:0;
      var pmBadge = j.paymentMethod==='zip'?'<span style="background:#faf5ff;color:#7c3aed;font-size:9px;font-weight:800;padding:1px 6px;border-radius:4px;border:1px solid #c4b5fd">ZIP</span>':'<span style="background:#f0fdf4;color:#15803d;font-size:9px;font-weight:800;padding:1px 6px;border-radius:4px;border:1px solid #86efac">COD</span>';
      h += '<tr style="'+(i%2?'background:#fafafa':'')+'" onmouseover="this.style.background=\'#f0f9ff\'" onmouseout="this.style.background=\''+(i%2?'#fafafa':'')+'\'">'
        +'<td class="td" style="font-weight:700;color:#c41230;cursor:pointer" onclick="setState({page:\'jobs\',jobDetailId:\''+j.id+'\',jobDetailTab:\'final_design\'})">'+(j.jobNumber||'\u2014')+'</td>'
        +'<td class="td" style="cursor:pointer" onclick="setState({page:\'jobs\',jobDetailId:\''+j.id+'\',jobDetailTab:\'final_design\'})">'+cName+'</td>'
        +'<td class="td">'+(j.suburb||'')+'</td>'
        +'<td class="td">'+(j.branch||'')+'</td>'
        +'<td class="td" style="text-align:right;font-weight:600">$'+Number(j.val||0).toLocaleString()+'</td>'
        +'<td class="td">'+pmBadge+'</td>'
        +'<td class="td">'+(cmDate?cmDate.toLocaleDateString('en-AU'):'\u2014')+'</td>'
        +'<td class="td"><span style="font-weight:700;color:'+waitCol+'">'+waitDays+'d</span></td>'
        +'<td class="td" style="text-align:center">'+frames+'</td>'
        +'<td class="td"><div style="display:flex;gap:4px;justify-content:flex-end">'
        +'<button onclick="openCadDesigner(\'job\',\''+j.id+'\',\'survey\')" class="btn-w" style="font-size:10px;padding:3px 8px">\ud83d\udc41 View</button>'
        +'<button onclick="markFinalDesignSigned(\''+j.id+'\')" class="btn-r" style="font-size:10px;padding:3px 10px">\u270d\ufe0f Sign Off</button>'
        +'</div></td></tr>';
    });
    h += '</tbody></table>';
  }
  h += '</div>';

  // ── CM In Progress (upcoming) ─────────────────────────────────────────────
  if (cmInProgress.length > 0) {
    h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">'
      +'<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#fffbeb">'
      +'<h4 style="font-size:14px;font-weight:700;margin:0;color:#92400e">\ud83d\udccf CM In Progress \u2014 Coming Soon ('+cmInProgress.length+')</h4></div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job #</th><th class="th">Client</th><th class="th">Suburb</th><th class="th">Branch</th><th class="th" style="text-align:right">Value</th><th class="th">CM Booked</th><th class="th">Status</th></tr></thead><tbody>';
    cmInProgress.sort(function(a,b){return (a.cmBookedDate||'zzz').localeCompare(b.cmBookedDate||'zzz');}).slice(0,10).forEach(function(j,i){
      var c = contacts.find(function(ct){return ct.id===j.contactId;});
      var cName = c?c.fn+' '+c.ln:'\u2014';
      var hasSurvey = j.cadSurveyData && j.cadSurveyData.projectItems && j.cadSurveyData.projectItems.length > 0;
      h += '<tr style="'+(i%2?'background:#fafafa':'')+'" onclick="setState({page:\'jobs\',jobDetailId:\''+j.id+'\',jobDetailTab:\'check_measure\'})" style="cursor:pointer" onmouseover="this.style.background=\'#fffbeb\'" onmouseout="this.style.background=\''+(i%2?'#fafafa':'')+'\'">'
        +'<td class="td" style="font-weight:700;color:#c41230">'+(j.jobNumber||'\u2014')+'</td>'
        +'<td class="td">'+cName+'</td>'
        +'<td class="td">'+(j.suburb||'')+'</td>'
        +'<td class="td">'+(j.branch||'')+'</td>'
        +'<td class="td" style="text-align:right;font-weight:600">$'+Number(j.val||0).toLocaleString()+'</td>'
        +'<td class="td">'+(j.cmBookedDate||'\u2014')+'</td>'
        +'<td class="td"><span style="font-size:10px;font-weight:600;color:'+(hasSurvey?'#3b82f6':'#f59e0b')+'">'+(hasSurvey?'\ud83d\udccf Survey started':'\u23f3 Awaiting CM')+'</span></td></tr>';
    });
    h += '</tbody></table></div>';
  }

  // ── Recently Signed ───────────────────────────────────────────────────────
  if (recentlySigned.length > 0) {
    h += '<div class="card" style="padding:0;overflow:hidden">'
      +'<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#f0fdf4">'
      +'<h4 style="font-size:14px;font-weight:700;margin:0;color:#15803d">\u2705 Recently Signed Off ('+recentlySigned.length+')</h4></div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Job #</th><th class="th">Client</th><th class="th">Suburb</th><th class="th" style="text-align:right">Value</th><th class="th">Signed</th><th class="th">Install Date</th><th class="th">Status</th></tr></thead><tbody>';
    recentlySigned.forEach(function(j,i){
      var c = contacts.find(function(ct){return ct.id===j.contactId;});
      var cName = c?c.fn+' '+c.ln:'\u2014';
      var st = getJobStatusObj(j.status);
      h += '<tr style="'+(i%2?'background:#fafafa':'')+'" onclick="setState({page:\'jobs\',jobDetailId:\''+j.id+'\'})" style="cursor:pointer" onmouseover="this.style.background=\'#f0fdf4\'" onmouseout="this.style.background=\''+(i%2?'#fafafa':'')+'\'">'
        +'<td class="td" style="font-weight:700;color:#c41230">'+(j.jobNumber||'\u2014')+'</td>'
        +'<td class="td">'+cName+'</td>'
        +'<td class="td">'+(j.suburb||'')+'</td>'
        +'<td class="td" style="text-align:right;font-weight:600">$'+Number(j.val||0).toLocaleString()+'</td>'
        +'<td class="td">'+new Date(j.finalSignedAt).toLocaleDateString('en-AU')+'</td>'
        +'<td class="td">'+(j.installDate||'\u2014')+'</td>'
        +'<td class="td"><span class="bdg" style="background:'+st.col+'20;color:'+st.col+';font-size:10px">'+st.label+'</span></td></tr>';
    });
    h += '</tbody></table></div>';
  }

  return '<div>'+h+'</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// WEEKLY REVENUE — All invoice streams in one view
// ══════════════════════════════════════════════════════════════════════════════
var revWeekOffset = 0;

function renderWeeklyRevenue() {
  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var branch = getState().branch || 'all';
  var invoices = typeof getInvoices === 'function' ? getInvoices() : [];
  var weekDates = getWeekDates(revWeekOffset);
  var weekStart = isoDate(weekDates[0]);
  var weekEnd = isoDate(weekDates[6]);

  if (branch !== 'all') jobs = jobs.filter(function(j){return j.branch===branch;});

  // Categorise all revenue streams for this week
  var streams = {
    deposit: {label:'5% Deposit (New Sales)', col:'#3b82f6', icon:'\ud83d\udcb0', items:[], total:0},
    cm: {label:'45% Check Measure', col:'#f59e0b', icon:'\ud83d\udccf', items:[], total:0},
    preinstall: {label:'45% Pre-Installation', col:'#a855f7', icon:'\ud83d\udee0\ufe0f', items:[], total:0},
    completion: {label:'5% Completion', col:'#22c55e', icon:'\u2705', items:[], total:0},
  };

  // Scan all jobs for claims activity this week
  jobs.forEach(function(j){
    var claims = getJobClaims(j.id);
    var c = contacts.find(function(ct){return ct.id===j.contactId;});
    var cName = c ? c.fn+' '+c.ln : '\u2014';
    var valExGst = Math.round((j.val||0)/1.1*100)/100;

    claims.forEach(function(cl){
      // Find invoice for this claim
      var inv = cl.invoiceId ? invoices.find(function(i){return i.id===cl.invoiceId;}) : null;
      var invDate = inv ? (inv.issueDate||inv.created||'').slice(0,10) : '';
      if (!invDate || invDate < weekStart || invDate > weekEnd) return;

      var item = {
        jobId:j.id, jobNumber:j.jobNumber||'', contactName:cName, suburb:j.suburb||'',
        amountExGst:cl.amountExGst, amountIncGst:cl.amountIncGst,
        invoiceNumber:cl.invoiceNumber||'', status:cl.status, date:invDate, paidDate:cl.paidDate||''
      };

      if (cl.id === 'cl_dep') { streams.deposit.items.push(item); streams.deposit.total += cl.amountIncGst; }
      else if (cl.id === 'cl_cm') { streams.cm.items.push(item); streams.cm.total += cl.amountIncGst; }
      else if (cl.id === 'cl_preinstall') { streams.preinstall.items.push(item); streams.preinstall.total += cl.amountIncGst; }
      else if (cl.id === 'cl_final') { streams.completion.items.push(item); streams.completion.total += cl.amountIncGst; }
    });
  });

  // Also scan invoices directly (for any that have jobId but might not match claims)
  invoices.forEach(function(inv){
    if (!inv.jobId) return;
    var invDate = (inv.issueDate||inv.created||'').slice(0,10);
    if (!invDate || invDate < weekStart || invDate > weekEnd) return;
    // Check if already counted via claims
    var alreadyCounted = false;
    Object.values(streams).forEach(function(s){
      s.items.forEach(function(it){if(it.invoiceNumber===inv.invoiceNumber) alreadyCounted=true;});
    });
    if (alreadyCounted) return;
    // Categorise by description
    var desc = (inv.description||'').toLowerCase();
    var c = contacts.find(function(ct){return ct.id===inv.contactId;});
    var item = {jobId:inv.jobId,jobNumber:inv.jobNumber||'',contactName:c?c.fn+' '+c.ln:(inv.contactName||''),suburb:'',
      amountExGst:inv.subtotal||0,amountIncGst:inv.total||0,invoiceNumber:inv.invoiceNumber||'',status:inv.status||'sent',date:invDate,paidDate:''};
    if(desc.includes('deposit')||desc.includes('5% dep')){streams.deposit.items.push(item);streams.deposit.total+=inv.total||0;}
    else if(desc.includes('check measure')||desc.includes('45% check')){streams.cm.items.push(item);streams.cm.total+=inv.total||0;}
    else if(desc.includes('pre-install')||desc.includes('pre install')){streams.preinstall.items.push(item);streams.preinstall.total+=inv.total||0;}
    else if(desc.includes('completion')||desc.includes('final')){streams.completion.items.push(item);streams.completion.total+=inv.total||0;}
  });

  var grandTotal = streams.deposit.total + streams.cm.total + streams.preinstall.total + streams.completion.total;
  var totalPaid = 0;
  Object.values(streams).forEach(function(s){s.items.forEach(function(it){if(it.status==='paid') totalPaid+=it.amountIncGst;});});
  var totalItems = streams.deposit.items.length + streams.cm.items.length + streams.preinstall.items.length + streams.completion.items.length;

  // Week nav
  var nav = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px">'
    +'<button onclick="revWeekOffset--;renderPage()" class="btn-w" style="padding:5px 10px;font-size:12px">\u2190</button>'
    +'<button onclick="revWeekOffset=0;renderPage()" class="btn-'+(revWeekOffset===0?'r':'w')+'" style="padding:5px 14px;font-size:12px;font-weight:700">This Week</button>'
    +'<button onclick="revWeekOffset++;renderPage()" class="btn-w" style="padding:5px 10px;font-size:12px">\u2192</button>'
    +'<span style="font-family:Syne,sans-serif;font-weight:700;font-size:14px;margin-left:8px">'+fmtShortDate(weekDates[0])+' \u2014 '+fmtShortDate(weekDates[6])+'</span></div>';

  // KPI
  var kpi = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px">';
  kpi += '<div class="card" style="padding:16px;border-left:4px solid #c41230"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Total Invoiced</div><div style="font-size:24px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:4px">$'+Math.round(grandTotal).toLocaleString()+'</div><div style="font-size:10px;color:#9ca3af">'+totalItems+' invoices this week</div></div>';
  Object.entries(streams).forEach(function(e){
    var key=e[0]; var s=e[1];
    kpi += '<div class="card" style="padding:16px;border-left:4px solid '+s.col+'"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">'+s.icon+' '+key.charAt(0).toUpperCase()+key.slice(1)+'</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:'+s.col+';margin-top:4px">$'+Math.round(s.total).toLocaleString()+'</div><div style="font-size:10px;color:#9ca3af">'+s.items.length+' invoice'+(s.items.length!==1?'s':'')+'</div></div>';
  });
  kpi += '</div>';

  // ── Stacked bar chart: revenue by stream by day ───────────────────────────
  var chart = '<div class="card" style="padding:20px;margin-bottom:16px">';
  chart += '<div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:4px">Revenue by Day & Source</div>'
    +'<div style="font-size:12px;color:#6b7280;margin-bottom:16px">Stacked by invoice type \u2014 showing where your cash flow is coming from</div>';

  // Legend
  chart += '<div style="display:flex;gap:16px;margin-bottom:12px">';
  Object.values(streams).forEach(function(s){
    chart += '<div style="display:flex;align-items:center;gap:4px;font-size:11px"><div style="width:12px;height:12px;border-radius:3px;background:'+s.col+'"></div><span>'+s.label+'</span></div>';
  });
  chart += '</div>';

  // Compute daily totals per stream
  var dayTotals = [];
  var maxDayTotal = 1;
  weekDates.forEach(function(d){
    var ds = isoDate(d);
    var day = {date:d, ds:ds};
    Object.entries(streams).forEach(function(e){
      day[e[0]] = e[1].items.filter(function(it){return it.date===ds;}).reduce(function(s,it){return s+it.amountIncGst;},0);
    });
    day.total = (day.deposit||0)+(day.cm||0)+(day.preinstall||0)+(day.completion||0);
    if (day.total > maxDayTotal) maxDayTotal = day.total;
    dayTotals.push(day);
  });

  // Stacked bars
  var barH = 180;
  chart += '<div style="display:flex;gap:8px;align-items:flex-end;height:'+barH+'px;padding:0 4px;border-bottom:2px solid #e5e7eb">';
  dayTotals.forEach(function(dd){
    var td = isToday(dd.date);
    var stackH = dd.total > 0 ? Math.max(8, Math.round(dd.total/maxDayTotal*barH*0.85)) : 4;
    chart += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    if (dd.total > 0) chart += '<div style="font-size:10px;font-weight:700;color:#374151">$'+Math.round(dd.total/1000)+'k</div>';
    chart += '<div style="width:100%;max-width:65px;height:'+stackH+'px;border-radius:4px 4px 0 0;overflow:hidden;display:flex;flex-direction:column-reverse">';
    var streamKeys = ['deposit','cm','preinstall','completion'];
    var streamCols = [streams.deposit.col, streams.cm.col, streams.preinstall.col, streams.completion.col];
    streamKeys.forEach(function(sk,i){
      var segVal = dd[sk]||0;
      if (segVal <= 0) return;
      var segPct = Math.round(segVal/dd.total*100);
      chart += '<div style="width:100%;height:'+segPct+'%;background:'+streamCols[i]+';min-height:2px" title="'+streams[sk].label+': $'+Math.round(segVal).toLocaleString()+'"></div>';
    });
    chart += '</div></div>';
  });
  chart += '</div>';

  // Day labels
  chart += '<div style="display:flex;gap:8px;padding:6px 4px 0">';
  dayTotals.forEach(function(dd){
    var td = isToday(dd.date);
    chart += '<div style="flex:1;text-align:center;font-size:10px;font-weight:'+(td?'700':'500')+';color:'+(td?'#c41230':'#6b7280')+'">'+fmtShortDate(dd.date)+'</div>';
  });
  chart += '</div></div>';

  // ── Donut / proportion breakdown ──────────────────────────────────────────
  var proportions = '<div class="card" style="padding:20px;margin-bottom:16px">';
  proportions += '<div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:14px">Revenue Composition</div>';
  proportions += '<div style="display:flex;gap:20px;align-items:center">';
  // Visual proportion bar
  proportions += '<div style="flex:1"><div style="height:40px;border-radius:8px;overflow:hidden;display:flex">';
  if (grandTotal > 0) {
    Object.entries(streams).forEach(function(e){
      var pct = Math.round(e[1].total/grandTotal*100);
      if (pct > 0) proportions += '<div style="width:'+pct+'%;background:'+e[1].col+';display:flex;align-items:center;justify-content:center;color:#fff;font-size:'+(pct>10?'12':'9')+'px;font-weight:700;min-width:2px">'+pct+'%</div>';
    });
  } else {
    proportions += '<div style="width:100%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px">No invoices this week</div>';
  }
  proportions += '</div>';
  // Breakdown list
  proportions += '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">';
  Object.entries(streams).forEach(function(e){
    var pct = grandTotal>0?Math.round(e[1].total/grandTotal*100):0;
    proportions += '<div style="display:flex;align-items:center;gap:8px;font-size:12px">'
      +'<div style="width:12px;height:12px;border-radius:3px;background:'+e[1].col+';flex-shrink:0"></div>'
      +'<span style="color:#6b7280">'+e[1].label+'</span>'
      +'<span style="font-weight:700;margin-left:auto">$'+Math.round(e[1].total).toLocaleString()+' ('+pct+'%)</span></div>';
  });
  proportions += '</div></div>';
  // Payment status
  var unpaid = grandTotal - totalPaid;
  proportions += '<div style="width:200px;flex-shrink:0;text-align:center">'
    +'<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Payment Status</div>'
    +'<div style="height:12px;border-radius:6px;overflow:hidden;display:flex;background:#f3f4f6">'
    +(totalPaid>0?'<div style="width:'+Math.round(totalPaid/Math.max(grandTotal,1)*100)+'%;background:#22c55e"></div>':'')
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px"><span style="color:#22c55e;font-weight:600">$'+Math.round(totalPaid).toLocaleString()+' paid</span><span style="color:#c41230;font-weight:600">$'+Math.round(unpaid).toLocaleString()+' owing</span></div></div>';
  proportions += '</div></div>';

  // ── Detailed invoice list per stream ───────────────────────────────────────
  var details = '';
  Object.entries(streams).forEach(function(e){
    var key=e[0]; var s=e[1];
    if (s.items.length === 0) return;
    details += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">'
      +'<div style="padding:12px 20px;background:'+s.col+'08;border-bottom:1px solid '+s.col+'20;display:flex;justify-content:space-between;align-items:center">'
      +'<span style="font-size:13px;font-weight:700;color:'+s.col+'">'+s.icon+' '+s.label+'</span>'
      +'<span style="font-size:14px;font-weight:800;font-family:Syne,sans-serif;color:'+s.col+'">$'+Math.round(s.total).toLocaleString()+'</span></div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th" style="font-size:10px">Invoice</th><th class="th" style="font-size:10px">Job</th><th class="th" style="font-size:10px">Client</th><th class="th" style="font-size:10px">Date</th><th class="th" style="font-size:10px">Status</th><th class="th" style="font-size:10px;text-align:right">Ex GST</th><th class="th" style="font-size:10px;text-align:right">Inc GST</th></tr></thead><tbody>';
    s.items.forEach(function(it){
      var stCol = it.status==='paid'?'#22c55e':it.status==='sent'||it.status==='invoiced'?'#3b82f6':'#9ca3af';
      details += '<tr onclick="setState({page:\'jobs\',jobDetailId:\''+it.jobId+'\',crmMode:\'jobs\'})" style="cursor:pointer" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">'
        +'<td class="td" style="font-weight:600">'+it.invoiceNumber+'</td>'
        +'<td class="td" style="font-weight:700;color:#c41230">'+it.jobNumber+'</td>'
        +'<td class="td">'+it.contactName+'</td>'
        +'<td class="td">'+it.date+'</td>'
        +'<td class="td"><span style="color:'+stCol+';font-weight:600">\u25cf '+(it.status==='paid'?'Paid':it.status==='invoiced'||it.status==='sent'?'Sent':'Pending')+'</span></td>'
        +'<td class="td" style="text-align:right">$'+Math.round(it.amountExGst).toLocaleString()+'</td>'
        +'<td class="td" style="text-align:right;font-weight:700">$'+Math.round(it.amountIncGst).toLocaleString()+'</td></tr>';
    });
    details += '</tbody></table></div>';
  });

  return '<div>'
    +'<div style="margin-bottom:16px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">\ud83d\udcb0 Weekly Revenue</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">All invoice streams \u2014 deposits, check measures, pre-installation, and completion</p></div>'
    +nav+kpi+chart+proportions+details
    +'</div>';
}

