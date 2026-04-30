// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 16d-factory-pages.js
// Factory page renderers (split out of 16-factory-crm.js).
// Owns renderFactoryDash, renderProdQueue, renderProdBoard, renderFactoryBOM,
// renderFactoryDispatch. Loads after the core, glass, profile, and capacity
// modules so all of their symbols are available at render time.
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

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
