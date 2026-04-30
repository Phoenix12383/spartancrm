// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 16a-factory-glass.js
// Glass ordering subsystem (split out of 16-factory-crm.js).
// Self-contained: status enum, due-date math, alerts, status updater, modal.
// Loads after 16-factory-crm.js so it can use getFactoryOrders / saveFactoryOrders.
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

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

  var m = '<div class="modal-bg" id="glassModal" onclick="if(event.target===this){this.remove();}"><div class="modal" style="max-width:620px">'
    +'<div class="modal-header" style="'+(isOverdue?'background:#fef2f2':'')+'"><h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">\ud83e\ude9f Glass Order \u2014 '+order.jid+(isOverdue?' <span style="color:#ef4444;font-size:12px">\ud83d\udea8 NOT ORDERED</span>':'')+'</h3><button onclick="this.closest(\'.modal-bg\').remove()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px">\u00d7</button></div>'
    +'<div class="modal-body">';

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
