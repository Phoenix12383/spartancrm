// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 16-factory-crm.js (core foundation)
// Originally a 1,165-line monolith — now split across 16, 16a (glass),
// 16b (profile/Aluplast), 16c (capacity), 16d (pages). This file is the
// foundation everything else uses: constants, persistence wrappers, data
// transforms, and the basic order-state mutators.
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
