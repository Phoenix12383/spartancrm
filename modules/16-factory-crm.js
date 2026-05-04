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

// FACTORY-CRM-CONTRACT.md §6.3: factory_order.status → job.status mapping.
// 'received' is null on purpose: per the contract that status is the entry
// point and "no change" to job.status (the job stays at
// c2_order_schedule_standard, which Job CRM owns).
var FACTORY_TO_JOB_STATUS_MAP = {
  received:          null,
  bom_generated:     'c2_order_schedule_standard',
  materials_ordered: 'd1_awaiting_material',
  in_production:     'd3_cutting',
  qc_check:          'd5_hardware_revealing',
  ready_dispatch:    'e_dispatch_standard',
  dispatched:        'f_installing',
};

// FACTORY-CRM-CONTRACT.md §6.1: Factory CRM writes back to the linked job
// whenever factory_order state changes. Three field categories propagate:
//   • productionStatus           ← order.status (raw, for UI)
//   • factoryMaterialDeliveryDate← order.materialDeliveryDate (Aluplast-confirmed)
//   • factoryDispatchReadyDate   ← order.dispatchReadyDate (capacity-planner output)
//   • status (workflow)          ← FACTORY_TO_JOB_STATUS_MAP[order.status]
//
// Diff-and-skip pattern: only fields that actually change get written, so
// we don't churn dbUpdate or trigger spurious renderPage cycles. The
// dispatchReadyDate writeback is a no-op until the capacity planner is
// extended to persist that field on the order — until then this helper
// just propagates whatever's already there (typically null).
function _mirrorFactoryOrderToJob(order) {
  if (!order) return;
  if (typeof getState !== 'function' || typeof setState !== 'function') return;
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){ return j.factoryOrderId === order.id || j.id === order.crmJobId; });
  if (!job) return;

  var changes = {
    productionStatus:            order.status || null,
    factoryMaterialDeliveryDate: order.materialDeliveryDate || null,
    factoryDispatchReadyDate:    order.dispatchReadyDate || null,
  };
  var mappedStatus = FACTORY_TO_JOB_STATUS_MAP[order.status];
  if (mappedStatus && job.status !== mappedStatus) {
    changes.status = mappedStatus;
  }

  var actual = {};
  Object.keys(changes).forEach(function(k){
    if ((job[k] || null) !== (changes[k] || null)) actual[k] = changes[k];
  });
  if (Object.keys(actual).length === 0) return;

  setState({
    jobs: jobs.map(function(j){ return j.id === job.id ? Object.assign({}, j, actual) : j; })
  });
  if (typeof dbUpdate === 'function') {
    dbUpdate('jobs', job.id, actual);
  }
}

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

// One-time migration: legacy short-name station ids → current FACTORY_STATIONS
// ids. Frames pushed via the old cadFrameToFactoryItem initialised at
// 'cutting' (legacy 6-stage); the kanban filters by 'frame_cutting'
// (current 7-station). Same goes for the QC-pass that wrote 'dispatch' →
// the current id is 'packing'. Both legacy ids would leave a frame in a
// non-existent column. Translation here is the minimum to surface them on
// the kanban; ambiguous legacy ids ('milling', 'reveals') are NOT touched
// — they're not currently produced by any code path.
(function migrateLegacyStationIds(){
  try {
    if (localStorage.getItem('spartan_station_ids_migration_v1') === 'done') return;
    var items = JSON.parse(localStorage.getItem('spartan_factory_items')||'[]');
    var legacyMap = { cutting: 'frame_cutting', dispatch: 'packing' };
    var changed = 0;
    items.forEach(function(it){
      if (legacyMap[it.station]) { it.station = legacyMap[it.station]; changed++; }
      if (Array.isArray(it.stationHistory)) {
        it.stationHistory.forEach(function(h){
          if (h && legacyMap[h.station]) h.station = legacyMap[h.station];
        });
      }
    });
    if (changed > 0) {
      localStorage.setItem('spartan_factory_items', JSON.stringify(items));
      console.log('[Migration] Renamed '+changed+' frame(s) from legacy station ids to current FACTORY_STATIONS ids');
    }
    localStorage.setItem('spartan_station_ids_migration_v1', 'done');
  } catch(e) { console.warn('[Migration] Station-id migration skipped:', e); }
})();

function cadFrameToFactoryItem(frame, idx, orderJid, customer, suburb, due) {
  return {id:'fi_'+Date.now()+'_'+idx, orderId:orderJid,
    name:frame.name||((frame.productType||'').indexOf('door')>=0?'D':'W')+String(idx+1).padStart(2,'0'),
    productType:frame.productType||'awning_window', widthMm:frame.width||frame.widthMm||900, heightMm:frame.height||frame.heightMm||900,
    colour:frame.colour||'white_body', colourInt:frame.colourInt||'white_body',
    glassSpec:frame.glassSpec||'dgu_4_12_4', profileSystem:frame.profileSystem||'ideal_4000',
    panelCount:frame.panelCount||1, customer:customer||'', suburb:suburb||'', due:due||'',
    installationType:frame.installationType||'retrofit',
    stationTimes:frame.stationTimes||null,
    installMinutes:frame.installMinutes||0, productionMinutes:frame.productionMinutes||0,
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
  // First-time factoryOrderId link: must be set before _mirrorFactoryOrderToJob
  // can find the job by factoryOrderId. The contract \u00a76.1 productionStatus +
  // dates writeback then runs through the centralized helper.
  setState({jobs:getState().jobs.map(function(j){return j.id===jobId?Object.assign({},j,{factoryOrderId:order.id}):j;})});
  if (typeof dbUpdate === 'function') {
    dbUpdate('jobs', jobId, { factoryOrderId: order.id });
  }
  _mirrorFactoryOrderToJob(order);
  logJobAudit(jobId,'Sent to Factory',cadData.projectItems.length+' frames');
  addToast('\ud83c\udfed '+cadData.projectItems.length+' frames sent to factory','success');renderPage();
}

function updateFactoryOrderField(orderId, field, value) {
  var orders = getFactoryOrders();
  orders = orders.map(function(o) { if (o.id !== orderId) return o; var u = {}; u[field] = value; return Object.assign({}, o, u); });
  saveFactoryOrders(orders);
  // §6.1: when materialDeliveryDate or dispatchReadyDate is mutated, propagate
  // to the linked job. Other fields don't trigger a job-side change but the
  // helper diffs internally and no-ops if nothing changed, so the call is safe.
  if (field === 'materialDeliveryDate' || field === 'dispatchReadyDate') {
    var updated = orders.find(function(o){ return o.id === orderId; });
    _mirrorFactoryOrderToJob(updated);
  }
  renderPage();
}

function advanceFactoryOrder(orderId) {
  var orders=getFactoryOrders(); var order=orders.find(function(o){return o.id===orderId;});
  if(!order)return; var idx=FACTORY_STATUS_ORDER.indexOf(order.status);
  if(idx<0||idx>=FACTORY_STATUS_ORDER.length-1)return;
  var nextStatus = FACTORY_STATUS_ORDER[idx+1];
  // BOM AUTO-GENERATION: when advancing past 'Received' to 'BOM Generated',
  // run the BOM engine on the linked job's CAD data and persist on order.bom.
  // The engine returns null if no CAD data is reachable — in that case we
  // still allow the advance but warn so the user knows to check the job.
  if (nextStatus === 'bom_generated' && !order.bom && typeof generateBomForOrder === 'function') {
    var bom = generateBomForOrder(orderId);
    if (bom) {
      setOrderBom(orderId, bom);
      // Re-read the orders array since setOrderBom mutated localStorage.
      orders = getFactoryOrders();
      order = orders.find(function(o){return o.id === orderId;});
      addToast('📋 BOM generated: ' + bom.totals.frameCount + ' frames · ' + bom.totals.profileLm + 'lm profile · ' + bom.totals.glassPanes + ' panes · ' + bom.totals.hardwareLines + ' hardware lines', 'success');
    } else {
      addToast('⚠️ BOM not generated — no CAD data found on this job. Advance still allowed.', 'warning');
    }
  }
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
  // §6.1 + §6.3: centralized writeback handles productionStatus, the
  // workflow status mapping, and the date fields in one shot.
  _mirrorFactoryOrderToJob(order);
  if (order.status === 'dispatched') {
    var crmJob = (getState().jobs||[]).find(function(j){ return j.factoryOrderId === orderId || j.id === order.crmJobId; });
    if (crmJob) logJobAudit(crmJob.id, 'Dispatched', 'All frames dispatched');
  }
  renderPage();
}

function moveFactoryItem(itemId, toStation) {
  var items=getFactoryItems();
  var movedItem = null;
  items=items.map(function(it){
    if(it.id!==itemId)return it;
    var hist=it.stationHistory||[];
    hist.push({station:toStation,at:new Date().toISOString()});
    movedItem = Object.assign({},it,{station:toStation,stationHistory:hist});
    return movedItem;
  });
  saveFactoryItems(items);
  // §6 auto-advance: first frame at QC bumps order in_production → qc_check.
  if (toStation === 'qc' && movedItem && movedItem.orderId) {
    _checkOrderAutoAdvance(movedItem.orderId, 'frame_at_qc');
  }
  renderPage();
}

// Move every frame of order `jid` currently at `fromStation` forward by one
// FACTORY_STATIONS column. Used by the job-sized chip on the production
// board (renderProdBoard in 16d): the chip's advance button moves the
// whole group at once. Frames of the same order that are already past
// `fromStation` are left alone — covers the legacy mixed-station case
// as the kanban realigns. At the final column, "advance" writes the
// 'complete' sentinel station so the frame leaves the board.
function moveFactoryOrderToNextStation(jid, fromStation) {
  if (!jid || !fromStation) return;
  var stations = (typeof FACTORY_STATIONS_FROM_MANUAL !== 'undefined') ? FACTORY_STATIONS_FROM_MANUAL : FACTORY_STATIONS;
  var idx = -1;
  for (var i = 0; i < stations.length; i++) {
    if (stations[i].id === fromStation) { idx = i; break; }
  }
  if (idx < 0) return;
  var toStation = (idx >= stations.length - 1) ? 'complete' : stations[idx + 1].id;

  var nowIso = new Date().toISOString();
  var items = getFactoryItems();
  var moved = 0;
  items = items.map(function(it){
    if (it.orderId !== jid || it.station !== fromStation) return it;
    var hist = (it.stationHistory || []).concat([{station: toStation, at: nowIso}]);
    moved++;
    return Object.assign({}, it, { station: toStation, stationHistory: hist });
  });
  if (moved === 0) return;
  saveFactoryItems(items);

  // §6 auto-advance: any frame entering QC bumps the order
  // in_production → qc_check. Bulk move means many frames hit QC at
  // once, but the helper is idempotent so a single call covers it.
  if (toStation === 'qc' && typeof _checkOrderAutoAdvance === 'function') {
    _checkOrderAutoAdvance(jid, 'frame_at_qc');
  }
  renderPage();
}
window.moveFactoryOrderToNextStation = moveFactoryOrderToNextStation;

// FACTORY-CRM-CONTRACT.md §6 (implicit, derived from §6.3 mapping):
// frame-level kanban movement should auto-advance the order-level status
// when the appropriate threshold is reached, so the §6.3 writeback fires
// without requiring a manual "→ QC Check" / "→ Ready for Dispatch" click.
//
// Two auto-cases (everything else stays manual):
//   trigger='frame_at_qc' — any frame just arrived at QC station →
//                            advance in_production → qc_check
//   trigger='qc_pass'      — every frame on the order is QC-passed →
//                            advance qc_check → ready_dispatch
//
// Both no-op when the order is already past the relevant gate, so the
// manual advance buttons remain the source of truth — this just catches
// the cases where the order should follow the floor.
//
// Note: orderId on a factory_item is the order's `jid` string (the job
// number, e.g. 'VIC-4017'), not the factory_order id. Both forms are
// matched here so callers can pass whichever they have.
function _checkOrderAutoAdvance(orderRef, trigger) {
  if (!orderRef) return;
  var orders = getFactoryOrders();
  var order = orders.find(function(o){ return o.id === orderRef || o.jid === orderRef; });
  if (!order) return;

  if (trigger === 'frame_at_qc' && order.status === 'in_production') {
    advanceFactoryOrder(order.id);
    return;
  }

  if (trigger === 'qc_pass' && order.status === 'qc_check') {
    var orderFrames = getFactoryItems().filter(function(it){
      return it.orderId === order.jid;
    });
    if (orderFrames.length === 0) return;
    var allPassed = orderFrames.every(function(it){ return !!it.qcPassedAt; });
    if (allPassed) advanceFactoryOrder(order.id);
  }
}
window._checkOrderAutoAdvance = _checkOrderAutoAdvance;
