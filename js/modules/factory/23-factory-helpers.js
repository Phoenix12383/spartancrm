// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/23-factory-helpers.js
// Factory protocol classes and helper functions, derived directly from the
// Spartan Double Glazing Operations Manual v3.1 (January 2026).
//
// Each class encodes a real-world protocol step from the manual so the CRM
// can validate, prompt, and audit the same way the floor expects. Section
// citations like "Ch. 4 §1.2" refer to the manual's chapter / phase numbering.
//
// Globals exposed (per CONTRACT.md):
//   - Classes:   JobTraveler, MorningGateChecklist, ProductionStation,
//                DispatchChecklist, ServiceTriageJob, RedTag, HoldVariation,
//                CapacityCalculator, BOMGenerator, KlaesOrderPair
//   - Functions: getFactoryOrders, getFactoryItems, updateFactoryOrder,
//                generateBOM, calculateCapacity, assignToStation,
//                completeStation, getStationQueue
//
// Depends on globals from 24-factory-state.js (FACTORY_TAGS, _factoryState,
// FACTORY_ASCORA_STATUSES, FACTORY_ORDER_KIND) and 25-factory-persistence.js.
// ═════════════════════════════════════════════════════════════════════════════

// ── Manual-derived constants ────────────────────────────────────────────────

// Ch. 5 §2.1 "Weekly Revenue Target".
var KPI_WEEKLY_REVENUE_TARGET = 175000;     // AUD per week
var KPI_WINDOWS_PER_INSTALLER = 2;          // fully-finished windows per installer per day

// Ch. 2 §4.1 "Critical Delivery Rules".
var SUPPLIER_LEAD_DAYS = {
  PROFILE_BEFORE_DISPATCH: 14,              // Profiles arrive 2 weeks prior to dispatch
  GLASS_TO_SITE_BEFORE_INSTALL: 0,          // Glass delivered direct to site on install date
};

// Ch. 3 §3.1 "The 2-Day Buffer Rule" — service tech booked at least 2 business
// days after the dispatch date.
var SERVICE_BOOKING_BUFFER_BUSINESS_DAYS = 2;

// Ch. 1 §1.2 "The 5% Rule" — initial deposit before measure is booked.
var FINANCIAL_GATE_PERCENTAGES = {
  INITIAL_DEPOSIT: 5,
  PROGRESS_AT_MEASURE: 45,
  FINAL: 50,
};

// Ch. 2 §3.1 — Zip Money cap.
var ZIP_MONEY_CAP = 20000;

// Ch. 2 §1.2 — Klaes reveal calculation deductions.
var KLAES_REVEAL_DEDUCTIONS_MM = {
  STANDARD_VARIO_2T: 70,
  VARIO_3T: 126,
};

// ── Class: JobTraveler (Ch. 2 §3.2) ──────────────────────────────────────────
// The four-zone "VIC Job Traveler" sheet that circulates at the Wednesday
// Scheduling Meeting. Each zone must be signed by its responsible role before
// the order can be locked in.

class JobTraveler {
  constructor(jobNumber, opts) {
    this.jobNumber = jobNumber;
    this.createdAt = new Date().toISOString();
    this.zones = {
      // Zone 1: Earliest availability dates from suppliers (Estimator)
      1: { role: 'Estimator',           signedBy: null, signedAt: null, data: { profileEarliest: null, glassEarliest: null } },
      // Zone 2: Confirmed dispatch date (Production Manager)
      2: { role: 'Production Manager',  signedBy: null, signedAt: null, data: { dispatchDate: null, weldingCapacityOk: null, glazingCapacityOk: null } },
      // Zone 3: Crew availability (Installation Manager)
      3: { role: 'Installation Manager', signedBy: null, signedAt: null, data: { crewAssigned: null, jobSize: null } },
      // Zone 4: Calendar booking (Scheduler)
      4: { role: 'Scheduler',           signedBy: null, signedAt: null, data: { installDate: null, emailSentAt: null } },
    };
    Object.assign(this, opts || {});
  }

  // Sign a zone. Throws if signed out of order — Ch. 2 §3.2 mandates the
  // sequence Zone 1 → 2 → 3 → 4.
  signZone(zoneNumber, signerName, data) {
    var z = this.zones[zoneNumber];
    if (!z) throw new Error('JobTraveler: invalid zone ' + zoneNumber);
    for (var i = 1; i < zoneNumber; i++) {
      if (!this.zones[i].signedAt) {
        throw new Error('JobTraveler: cannot sign zone ' + zoneNumber + ' before zone ' + i);
      }
    }
    z.signedBy = signerName;
    z.signedAt = new Date().toISOString();
    if (data) z.data = Object.assign({}, z.data, data);
    return z;
  }

  isFullySigned() { return [1,2,3,4].every(function(z){ return !!this.zones[z].signedAt; }, this); }

  dispatchDate() { return this.zones[2].data.dispatchDate; }
  installDate()  { return this.zones[4].data.installDate; }

  // Returns the order-lock readiness check result.
  canLockOrder() {
    if (!this.isFullySigned()) return { ok: false, reason: 'Job Traveler not fully signed (Zones 1–4)' };
    if (!this.dispatchDate())  return { ok: false, reason: 'Zone 2 missing dispatch date' };
    return { ok: true };
  }
}

// ── Class: MorningGateChecklist (Ch. 4 §1) ───────────────────────────────────
// 06:15–09:00 Production Manager pre-start protocol.

class MorningGateChecklist {
  constructor(date) {
    this.date = date || new Date().toISOString().slice(0,10);
    this.checks = {
      arrival_0615:        { label: '06:15 staff arrival',                 done: false, at: null },
      toolbox_0630:        { label: '06:30 5-min toolbox talk',            done: false, at: null, notes: '' },
      ppe_check:           { label: 'Safety glasses & steel caps verified', done: false, at: null },
      ordering_gate:       { label: 'No production without Final Signed Order', done: false, at: null },
      stock_check:         { label: 'Rack stock physically checked',       done: false, at: null },
      delivery_chase:      { label: 'd.1 Awaiting Material — suppliers chased', done: false, at: null },
    };
  }

  tick(key, notes) {
    if (!this.checks[key]) throw new Error('MorningGate: unknown check ' + key);
    this.checks[key].done = true;
    this.checks[key].at   = new Date().toISOString();
    if (notes != null) this.checks[key].notes = notes;
    return this.checks[key];
  }

  isComplete() {
    var keys = Object.keys(this.checks);
    return keys.every(function(k){ return this.checks[k].done; }, this);
  }

  // Ch. 4 §1.2 CRITICAL RULE — production blocked without signed order.
  static canStartProductionToday(checklist) {
    return checklist && checklist.checks.ordering_gate.done && checklist.checks.ppe_check.done;
  }
}

// ── Class: ProductionStation (Ch. 4 §2.2) ────────────────────────────────────
// One physical station on the manufacturing line. Status changes as the first
// piece of work hits the station ("trigger") not when the previous station
// "ends". This mirrors the manual's flow exactly.

class ProductionStation {
  constructor(def) {
    this.id        = def.id;
    this.name      = def.name;
    this.statusKey = def.statusKey;       // e.g. 'd3_cutting' from FACTORY_ASCORA_STATUSES
    this.cap       = def.cap || 0;        // daily capacity
    this.icon      = def.icon || '';
    this.role      = def.role || 'Operator';
    this.queue     = [];                  // factory item ids currently here
  }

  // Trigger entry: first piece arrives at this station. Per Ch. 4 §2.2,
  // the operator changes the order's Ascora status when this happens.
  enter(itemId, opts) {
    if (this.queue.indexOf(itemId) >= 0) return;
    this.queue.push(itemId);
    if (typeof _factoryState !== 'undefined' && _factoryState) {
      _factoryState.appendAudit({
        type: 'station_enter', station: this.id, itemId: itemId,
        operator: (opts && opts.operator) || null,
      });
    }
    return this.statusKey;     // caller should advance the order's Ascora status
  }

  exit(itemId) {
    var i = this.queue.indexOf(itemId);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    if (typeof _factoryState !== 'undefined' && _factoryState) {
      _factoryState.appendAudit({ type: 'station_exit', station: this.id, itemId: itemId });
    }
    return true;
  }

  loadPercent() { return this.cap > 0 ? Math.round(this.queue.length / this.cap * 100) : 0; }
}

// Default station roster, derived from Ch. 4 §2.2.
// NOTE: v1.5 base diagram §4 specifies a 9-value generic WorkstationType enum
// (defined in 30-factory-v1-workstations-tasks.js). The 12-station alignment
// to the manual's specific tablet apps (PROFILE_SAW / STEEL_SAW / CNC_MILLING
// / etc.) is deliberately deferred to Phase 2 per v1.5 §10. This roster keeps
// the legacy 4-station compaction; expand only when Phase 2 lands.
var FACTORY_STATIONS_FROM_MANUAL = [
  new ProductionStation({ id:'cutting',  name:'Cutting',                       statusKey:'d3_cutting',         cap:20, icon:'✂️', role:'Saw Operator' }),
  new ProductionStation({ id:'milling',  name:'Milling / Steel / Welding',     statusKey:'d4_milling_welding', cap:12, icon:'🔥', role:'Operator' }),
  new ProductionStation({ id:'assembly', name:'Hardware / Revealing / Screens',statusKey:'d5_hardware_reveal', cap:18, icon:'🔧', role:'Assembly Team' }),
  new ProductionStation({ id:'dispatch', name:'Packing & Dispatch',            statusKey:'e_dispatch_standard',cap:25, icon:'📦', role:'Dispatch Team' }),
];

// ── Class: DispatchChecklist (Ch. 4 §5.1 — "Cut Tick" Protocol) ─────────────

class DispatchChecklist {
  constructor(jobNumber, kind) {
    this.jobNumber = jobNumber;
    this.kind      = kind || FACTORY_ORDER_KIND.ORIGINAL;       // 'O' or 'S'
    this.items = {
      frames:         { label: 'Frames',                       packed: false },
      flyscreens:     { label: 'Flyscreens',                   packed: false },
      architraves:    { label: 'Architraves',                  packed: false },
      trims:          { label: 'Trims',                        packed: false },
      glazingBeads:   { label: 'Glazing Beads & covers',       packed: false },
      cornerHinges:   { label: 'Corner Hinges',                packed: false },
      drainCaps:      { label: 'Drain caps',                   packed: false },
      strikerPlates:  { label: 'Striker plates',               packed: false },
    };
    this.signedBy   = null;
    this.signedAt   = null;
    this.bayNumber  = null;
    this.uploadedTo = null;       // Ascora filename — see Ch. 4 §5.1 step 5
  }

  tick(key) {
    if (!this.items[key]) throw new Error('DispatchChecklist: unknown item ' + key);
    this.items[key].packed = true;
    return this.items[key];
  }

  sign(name) {
    if (!this.allPacked()) throw new Error('DispatchChecklist: cannot sign — items remain unpacked');
    this.signedBy = name;
    this.signedAt = new Date().toISOString();
  }

  allPacked() {
    return Object.keys(this.items).every(function(k){ return this.items[k].packed; }, this);
  }

  ascoraFilename() {
    if (this.kind === FACTORY_ORDER_KIND.SERVICE) {
      return 'Service Checklist for Dispatch (' + this.jobNumber + ')';
    }
    return 'Completed Dispatch List Production (' + this.jobNumber + ')';
  }

  // Ch. 4 §5.3 COMPLETION TRIGGER — only change status when 100% of items
  // are physically in the bay.
  canMarkInBay() { return this.allPacked() && !!this.signedAt && !!this.bayNumber; }
}

// ── Class: ServiceTriageJob (Ch. 3 §1–§2) ────────────────────────────────────
// Implements the One-by-One Triage protocol and the Two-Order Rule.

class ServiceTriageJob {
  constructor(jobNumber) {
    this.jobNumber  = jobNumber;
    this.createdAt  = new Date().toISOString();
    this.path       = null;     // 'A' (complete) | 'B_stock' | 'B_remake'
    this.triageSheet = {
      diagramCircled: false, dimensionsExact: null, partsList: [],
      legibleHandwriting: null, photosAttached: false,
    };
    this.orders = { master: null, production: null }; // see makeTwoOrders()
  }

  // Ch. 3 §1.3 The Decision.
  decidePath(opts) {
    if (opts.complete)         { this.path = 'A'; return 'g_final_payment'; }     // Ch. 3 §1.3 Path A
    if (opts.partsInStock)     { this.path = 'B_stock';  return 'phase3_scheduling'; }
    if (opts.factoryRemake)    { this.path = 'B_remake'; return 'phase2_estimator'; }
    throw new Error('ServiceTriageJob: cannot decide path without disposition');
  }

  // Ch. 3 §2.2 The "Two-Order" Strategy. Returns {master, production} order
  // shells ready to hand to Klaes / persistence.
  makeTwoOrders(allWindows) {
    var remakes = allWindows.filter(function(w){ return w.requiresManufacturing; });
    var master = {
      klaesNumber: this.jobNumber + 'S',                                    // Ch. 3 §2.1 'S' suffix
      kind: 'master',
      windows: allWindows,                                                  // remakes + parts-only
      purpose: 'Service Checklist for Dispatch (master packing list)',
    };
    var production = {
      klaesNumber: this.jobNumber + 'S-P',
      kind: 'production',
      windows: remakes,                                                     // ONLY full manufacturing
      purpose: 'Cut/Glass/Profile lists for factory floor',
    };
    this.orders.master = master;
    this.orders.production = production;
    return this.orders;
  }
}

// ── Class: RedTag (Ch. 4 §3.2) ───────────────────────────────────────────────

class RedTag {
  constructor(opts) {
    this.id        = 'rt_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    this.at        = new Date().toISOString();
    this.jobNumber = opts.jobNumber || null;
    this.itemId    = opts.itemId || null;
    this.station   = opts.station || null;
    this.cause     = opts.cause || 'human';      // 'human' | 'machine'
    this.category  = opts.category || 'other';   // 'cut_short' | 'scratched_glass' | 'wrong_spec' | 'other'
    this.lossValue = Number(opts.lossValue) || 0;
    this.notes     = opts.notes || '';
    this.loggedBy  = opts.loggedBy || null;
  }

  static log(opts) {
    var rt = new RedTag(opts);
    if (typeof saveFactoryRedTag === 'function') saveFactoryRedTag(rt);
    if (typeof _factoryState !== 'undefined' && _factoryState) {
      var existing = (_factoryState.get().redTags || []).slice();
      existing.push(rt);
      _factoryState.patch({ redTags: existing });
    }
    if (typeof addToast === 'function') addToast('🔴 Red Tag logged: ' + rt.category, 'info');
    return rt;
  }
}

// ── Class: HoldVariation (App. A §2 — Hard Stop Rule) ────────────────────────

class HoldVariation {
  constructor(jobNumber, reason) {
    this.jobNumber = jobNumber;
    this.reason    = reason;
    this.placedAt  = new Date().toISOString();
    this.releasedAt = null;
    this.physicalTagApplied = false;     // Red HOLD TAG on frames/profile
    this.variationQuoted   = false;
    this.clientSigned      = false;
    this.variationPaid     = false;
    this.klaesUpdated      = false;
    this.documentsSwapped  = false;
  }

  // App. A §2.2 Financial gate: variation invoice must be PAID before work
  // resumes.
  canRelease() {
    return this.variationQuoted && this.clientSigned &&
           this.variationPaid && this.klaesUpdated && this.documentsSwapped;
  }

  release() {
    var check = this.canRelease();
    if (!check) throw new Error('HoldVariation: prerequisites not met (App. A §2.2/§2.3)');
    this.releasedAt = new Date().toISOString();
    return this.releasedAt;
  }
}

// ── Class: CapacityCalculator (Ch. 5 §2.1, Ch. 4 station caps) ──────────────

class CapacityCalculator {
  // Compute weekly load given install schedule (jobs[]) against the $175k/wk
  // target and the 2-windows/installer/day rule.
  static weeklyRevenueLoad(jobsThisWeek) {
    var revenue = (jobsThisWeek || []).reduce(function(s, j){ return s + (Number(j.val) || 0); }, 0);
    return {
      revenue: revenue,
      target: KPI_WEEKLY_REVENUE_TARGET,
      pctOfTarget: KPI_WEEKLY_REVENUE_TARGET > 0 ? Math.round(revenue / KPI_WEEKLY_REVENUE_TARGET * 100) : 0,
      meetsTarget: revenue >= KPI_WEEKLY_REVENUE_TARGET,
    };
  }

  // Per-station load using FACTORY_STATIONS_FROM_MANUAL.
  static stationLoad(items, stations) {
    var stns = stations || FACTORY_STATIONS_FROM_MANUAL;
    var load = {};
    stns.forEach(function(s){
      var count = (items || []).filter(function(i){ return i.station === s.id; }).length;
      load[s.id] = { count: count, cap: s.cap, pct: s.cap ? Math.round(count / s.cap * 100) : 0 };
    });
    return load;
  }

  // Per-installer expected windows-per-day.
  static installerLoad(installer, windowsAssignedToday) {
    return {
      installer: installer,
      assigned: windowsAssignedToday,
      target: KPI_WINDOWS_PER_INSTALLER,
      meetsKPI: windowsAssignedToday >= KPI_WINDOWS_PER_INSTALLER,
    };
  }

  // Zip Money cap check (Ch. 2 §3.1 selection criteria).
  static zipCapOk(jobValue) { return Number(jobValue) < ZIP_MONEY_CAP; }
}

// ── Class: BOMGenerator (Ch. 2 §5.2) ─────────────────────────────────────────
// Generates the documents released to the floor: Cutting List, Assembly List,
// Glass List, E-Control List, plus the master "Checklist for Dispatch".

class BOMGenerator {
  constructor(cadFrames, opts) {
    this.frames = cadFrames || [];
    this.opts = Object.assign({
      profileSystem: 'ideal_4000',     // 'ideal_4000' = Standard/Vario 2T
      revealDeductionMm: KLAES_REVEAL_DEDUCTIONS_MM.STANDARD_VARIO_2T,
    }, opts || {});
  }

  // Returns a structured BOM grouped by document type.
  generate() {
    var profileSystem = this.opts.profileSystem;
    var deduction = profileSystem === 'vario_3t'
      ? KLAES_REVEAL_DEDUCTIONS_MM.VARIO_3T
      : KLAES_REVEAL_DEDUCTIONS_MM.STANDARD_VARIO_2T;

    return {
      cuttingList:    this._cuttingList(deduction),
      assemblyList:   this._assemblyList(),
      glassList:      this._glassList(deduction),
      eControlList:   this._eControlList(),
      masterChecklist: this._masterChecklist(),
      profileSystem:  profileSystem,
      revealDeductionMm: deduction,
    };
  }

  _cuttingList(deduction) {
    return this.frames.map(function(f, idx){
      return {
        line: idx + 1,
        frameName: f.name || ('W' + String(idx + 1).padStart(2, '0')),
        widthMm: f.width || 0,
        heightMm: f.height || 0,
        // Ch. 2 §1.2 reveal calc: subtract -70mm or -126mm for the reveal.
        outerWidthMm: (f.width || 0),
        outerHeightMm: (f.height || 0),
        sashCutWidthMm: Math.max(0, (f.width || 0) - deduction),
        sashCutHeightMm: Math.max(0, (f.height || 0) - deduction),
        profileSystem: f.profileSystem || 'ideal_4000',
      };
    });
  }

  _assemblyList() {
    return this.frames.map(function(f, idx){
      return {
        line: idx + 1,
        frameName: f.name || ('W' + String(idx + 1).padStart(2, '0')),
        productType: f.productType || 'awning_window',
        panelCount: f.panelCount || 1,
        hardware: BOMGenerator._inferHardware(f),
        handleHeightMm: 1075,                       // Ch. 2 §1.1 standard
      };
    });
  }

  _glassList() {
    // Ch. 2 §1.2 Glass Specs: never select Float Glass. Validate here.
    return this.frames.map(function(f, idx){
      var spec = f.glassSpec || 'dgu_4_12_4';
      if (/float/i.test(spec)) {
        throw new Error('BOMGenerator: float glass not permitted (Ch. 2 §1.2). Frame ' + (f.name || idx));
      }
      return {
        line: idx + 1,
        frameName: f.name || ('W' + String(idx + 1).padStart(2, '0')),
        glassSpec: spec,
        widthMm: Math.max(0, (f.width || 0) - 100),
        heightMm: Math.max(0, (f.height || 0) - 100),
        deliverTo: 'site',                          // Ch. 2 §4.1 default
      };
    });
  }

  _eControlList() {
    return this.frames.map(function(f, idx){
      return { line: idx+1, frameName: f.name || ('W'+String(idx+1).padStart(2,'0')), checks: ['size','square','reveal','hardware','glass'] };
    });
  }

  // Ch. 2 §5.2 — "Checklist for Dispatch" master list.
  _masterChecklist() {
    return {
      frames: this.frames.length,
      profileSystem: this.opts.profileSystem,
      includes: ['Frames','Flyscreens','Architraves','Trims','Glazing Beads & covers','Corner Hinges','Drain caps','Striker plates'],
    };
  }

  static _inferHardware(frame) {
    var t = (frame.productType || '').toLowerCase();
    if (t.indexOf('awning') >= 0)   return ['awning_stay', 'cam_handle'];
    if (t.indexOf('casement') >= 0) return ['casement_hinge', 'cam_handle'];
    if (t.indexOf('sliding') >= 0)  return ['rollers','striker_plate','interlock'];
    if (t.indexOf('tilt') >= 0)     return ['tilt_turn_gear','tt_handle'];
    return ['generic_hardware'];
  }
}

// ── Class: KlaesOrderPair (Ch. 3 §2.2 / Ch. 1 §1.2) ──────────────────────────
// Encodes the 'O' / 'S' suffix split and the "Two-Order" strategy.

class KlaesOrderPair {
  constructor(jobNumber) {
    this.jobNumber = jobNumber;
    this.original  = { number: jobNumber + FACTORY_ORDER_KIND.ORIGINAL, kind: 'original',  windows: [] };
    this.service   = null;        // populated only when service work begins
  }

  attachWindow(orderKind, win) {
    if (orderKind === FACTORY_ORDER_KIND.ORIGINAL) this.original.windows.push(win);
    else {
      if (!this.service) this.service = { number: this.jobNumber + FACTORY_ORDER_KIND.SERVICE, kind: 'service', windows: [] };
      this.service.windows.push(win);
    }
  }
}

// ── Function-style helpers (CONTRACT.md "public API") ───────────────────────
// Both-files-coexist mode: getFactoryOrders / getFactoryItems are owned by
// the legacy modules/16-factory-crm.js. Do NOT redefine here or the later
// load order will silently override the working implementation with an
// empty-by-default container (see MEMORY note "stale_duplicate_vars").
//
// The helpers below are the NEW additions only — names that the old factory
// split does not provide.

function updateFactoryOrder(orderId, patch) {
  // Read via the legacy global; write via the legacy plural setter so the
  // existing localStorage + Supabase fanout still happens.
  var orders = (typeof getFactoryOrders === 'function') ? getFactoryOrders() : [];
  var order = orders.find(function(o){ return o.id === orderId; });
  if (!order) throw new Error('updateFactoryOrder: not found ' + orderId);
  var updated = Object.assign({}, order, patch);
  var nextOrders = orders.map(function(o){ return o.id === orderId ? updated : o; });
  if (typeof saveFactoryOrders === 'function') saveFactoryOrders(nextOrders);
  return updated;
}

function generateBOM(orderOrFrames, opts) {
  var frames = Array.isArray(orderOrFrames) ? orderOrFrames :
               (orderOrFrames && orderOrFrames.frames) ? orderOrFrames.frames :
               [];
  return new BOMGenerator(frames, opts).generate();
}

function calculateCapacity(items, stations) {
  var src = items || ((typeof getFactoryItems === 'function') ? getFactoryItems() : []);
  return CapacityCalculator.stationLoad(src, stations);
}

function assignToStation(itemId, stationId, opts) {
  // Defer to the legacy moveFactoryItem if it exists — same mutation, same
  // history-stamping, same renderPage().
  if (typeof moveFactoryItem === 'function') {
    moveFactoryItem(itemId, stationId);
    return { id: itemId, station: stationId, operator: (opts && opts.operator) || null };
  }
  // Standalone fallback (when this file is loaded without the legacy split).
  var items = (typeof getFactoryItems === 'function') ? getFactoryItems() : [];
  var item = items.find(function(i){ return i.id === itemId; });
  if (!item) throw new Error('assignToStation: item not found ' + itemId);
  var hist = (item.stationHistory || []).slice();
  hist.push({ station: stationId, at: new Date().toISOString(), operator: (opts && opts.operator) || null });
  var updated = Object.assign({}, item, { station: stationId, stationHistory: hist });
  if (typeof saveFactoryItem === 'function') saveFactoryItem(updated);
  return updated;
}

function completeStation(itemId, opts) {
  return assignToStation(itemId, 'complete', opts);
}

function getStationQueue(stationId) {
  var src = (typeof getFactoryItems === 'function') ? getFactoryItems() : [];
  return src.filter(function(i){ return i.station === stationId; });
}
