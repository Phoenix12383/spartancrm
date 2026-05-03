// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 16b-factory-profile.js
// Aluplast profile ordering subsystem (split out of 16-factory-crm.js).
// Self-contained: status enum, status updater, modal.
// Loads after 16-factory-crm.js so it can use getFactoryOrders / saveFactoryOrders.
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event Action Handlers ────────────────────────────────────────────────────
defineAction('factory-profile-modal-bg-close', function(target, ev) {
  if (ev.target === target) {
    target.remove();
  }
});

defineAction('factory-profile-modal-close', function(target, ev) {
  target.closest('.modal-bg').remove();
});

defineAction('factory-profile-delivery-date-change', function(target, ev) {
  var orderId = target.dataset.orderId;
  updateProfileOrder(orderId, 'profileDeliveryDate', target.value);
});


defineAction('factory-profile-file-remove', function(target, ev) {
  var orderId = target.dataset.orderId;
  updateProfileOrder(orderId, 'profileOrderFile', null);
});

defineAction('factory-profile-file-upload', function(target, ev) {
  var file = target.files[0];
  if (!file) return;
  var orderId = target.dataset.orderId;
  var reader = new FileReader();
  reader.onload = function(e) {
    updateProfileOrder(orderId, 'profileOrderFile', {name: file.name, dataUrl: e.target.result, uploadedAt: new Date().toISOString()});
    document.getElementById('profileModal').remove();
    showProfileOrderModal(orderId);
  };
  reader.readAsDataURL(file);
});

defineAction('factory-profile-email-send', function(target, ev) {
  var emailTo = document.getElementById('profileEmailTo').value;
  if (!emailTo) {
    alert('Enter email');
    ev.preventDefault();
    return false;
  }
  var emailSubject = target.dataset.emailSubject;
  var emailBody = target.dataset.emailBody;
  target.href = 'mailto:' + emailTo + '?subject=' + emailSubject + '&body=' + emailBody;
});

defineAction('factory-profile-mark-ordered', function(target, ev) {
  var orderId = target.dataset.orderId;
  if (!getFactoryOrders().find(function(o) { return o.id === orderId; }).profileOrderFile) {
    addToast('⚠️ Upload the Aluplast order PDF first', 'error');
    return;
  }
  updateProfileOrder(orderId, 'profileStatus', 'ordered');
  target.closest('.modal-bg').remove();
});

defineAction('factory-profile-mark-received', function(target, ev) {
  var orderId = target.dataset.orderId;
  updateProfileOrder(orderId, 'profileStatus', 'received');
  target.closest('.modal-bg').remove();
});

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

  var m = '<div class="modal-bg" id="profileModal" data-action="factory-profile-modal-bg-close"><div class="modal" style="max-width:620px">'
    +'<div class="modal-header" style="'+(isOverdue?'background:#fef2f2':'')+'"><h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">\ud83d\udce6 Profile Order \u2014 '+order.jid+(isOverdue?' <span style="color:#ef4444;font-size:12px">\ud83d\udea8 NOT ORDERED</span>':'')+'</h3><button data-action="factory-profile-modal-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px">\u00d7</button></div>'
    +'<div class="modal-body">';

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
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Delivery Date</label><input type="date" class="inp" style="font-size:12px" value="'+(order.profileDeliveryDate||'')+'" data-action="factory-profile-delivery-date-change" data-order-id="'+order.id+'"></div></div>';

  // Profile order file upload (MANDATORY)
  m += '<div style="padding:14px;background:'+(order.profileOrderFile?'#f0fdf4':'#fef2f2')+';border:1.5px solid '+(order.profileOrderFile?'#86efac':'#fca5a5')+';border-radius:10px;margin-bottom:14px">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:8px">\ud83d\udcc4 Aluplast Order PDF <span style="color:#ef4444">*mandatory</span></div>';
  if (order.profileOrderFile) {
    m += '<div style="display:flex;align-items:center;gap:8px"><a href="'+order.profileOrderFile.dataUrl+'" target="_blank" download="'+order.profileOrderFile.name+'" style="color:#3b82f6;text-decoration:none;font-weight:600;font-size:12px">\ud83d\udcce '+order.profileOrderFile.name+'</a>'
      +'<span style="font-size:10px;color:#6b7280">Uploaded '+(order.profileOrderFile.uploadedAt?new Date(order.profileOrderFile.uploadedAt).toLocaleDateString('en-AU'):'')+'</span>'
      +'<button data-action="factory-profile-file-remove" data-order-id="'+order.id+'" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:10px;font-weight:600">\u2715 Remove</button></div>';
  } else {
    m += '<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#fff;border:1.5px dashed #fca5a5;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;color:#ef4444">\ud83d\udcc4 Upload Aluplast Order PDF'
      +'<input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv" style="display:none" data-action="factory-profile-file-upload" data-order-id="'+order.id+'"></label>';
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
    +'<a href="mailto:sales@aluplast.com.au?subject='+emailSubject+'&body='+emailBody+'" data-action="factory-profile-email-send" data-email-subject="'+emailSubject+'" data-email-body="'+emailBody+'" style="display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:#c41230;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap">\ud83d\udce7 Send Email</a></div>'
    +(order.profileOrderFile?'<div style="font-size:10px;color:#0369a1;margin-top:6px">\u2139\ufe0f Attach <strong>'+order.profileOrderFile.name+'</strong> to the email.</div>':'<div style="font-size:10px;color:#ef4444;margin-top:6px">\u26a0\ufe0f Upload the Aluplast order PDF above first.</div>')
    +'</div>';

  // Action buttons
  m += '<div style="display:flex;gap:8px">';
  if ((order.profileStatus||'not_ordered') === 'not_ordered') {
    m += '<button data-action="factory-profile-mark-ordered" data-order-id="'+order.id+'" class="btn-r" style="flex:1;justify-content:center">\ud83d\udce6 Mark Profiles as Ordered</button>';
  } else if (order.profileStatus === 'ordered') {
    m += '<button data-action="factory-profile-mark-received" data-order-id="'+order.id+'" class="btn-r" style="flex:1;justify-content:center;background:#22c55e">\u2705 Mark Profiles as Received</button>';
  } else {
    m += '<div style="flex:1;padding:10px;text-align:center;background:#f0fdf4;border-radius:8px;color:#15803d;font-weight:700">\u2705 Profiles received</div>';
  }
  m += '</div></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', m);
}
