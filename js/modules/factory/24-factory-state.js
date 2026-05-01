// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/24-factory-state.js
// Factory-local state container. Mirrors the global state contract
// (getState / setState / subscribe) but scoped to factory data so that
// production-board updates don't trigger re-renders of unrelated CRM pages.
//
// Concepts encoded from the Operations Manual v3.1 (Spartan Double Glazing):
//   - Status flow d.1 → d.2 → d.3 → d.4 → d.5 → e → e.1  (Ch. 4 §2)
//   - Naming convention 'O' (Original) / 'S' (Service)   (Ch. 3 §2.1)
//   - The "ORDER LOCK" tag                                (Ch. 2 §4.3)
//   - The "HOLD / VARIATION PENDING" red-tag state        (App. A §2.1)
//
// Globals exposed (per CONTRACT.md "public API of each file"):
//   _factoryState, FactoryState, getFactoryState, setFactoryState,
//   subscribeFactory, factorySubscribers
//
// NOT YET wired into index.html. To enable, add a <script> tag for this
// file BEFORE js/modules/factory/25-factory-persistence.js.
// ═════════════════════════════════════════════════════════════════════════════

// ── Manual-derived enumerations ──────────────────────────────────────────────

// Ascora production statuses, exactly as named in the Operations Manual.
// Comments cite the section that defines each transition.
var FACTORY_ASCORA_STATUSES = [
  // Ch. 2 §2.2 / Ch. 4 §2.1
  { key: 'd1_awaiting_material',   label: 'd.1 Awaiting Material',                  col: '#6b7280', phase: 'pre' },
  { key: 'd2_material_at_factory', label: 'd.2 Material at Factory',                col: '#3b82f6', phase: 'pre' },
  // Ch. 4 §2.2 — manufacturing line
  { key: 'd3_cutting',             label: 'd.3 Cutting',                            col: '#7c3aed', phase: 'production' },
  { key: 'd4_milling_welding',     label: 'd.4 Milling / Steel / Welding',          col: '#f59e0b', phase: 'production' },
  { key: 'd5_hardware_reveal',     label: 'd.5 Hardware / Revealing / Screens',     col: '#10b981', phase: 'production' },
  // Ch. 4 §5 / Ch. 5 §1.4
  { key: 'e_dispatch_standard',    label: 'e. In Dispatch (Standard Job)',          col: '#06b6d4', phase: 'dispatch' },
  { key: 'e1_dispatch_service',    label: 'e.1 Dispatch (Service Work)',            col: '#0891b2', phase: 'dispatch' },
  { key: 'f_installing',           label: 'f. Installing in Progress',              col: '#22c55e', phase: 'install' },
  // Service-only (Ch. 3 §2.3)
  { key: 'd11_awaiting_service',   label: 'd.11 Awaiting service work material',    col: '#a855f7', phase: 'pre' },
];

// Order classification — see Ch. 3 §2.1 "Naming Convention".
var FACTORY_ORDER_KIND = {
  ORIGINAL: 'O',  // Standard new-build / house lot
  SERVICE:  'S',  // Service / remake order
};

// Tags used to lock or quarantine an order. See Ch. 2 §4.3 and App. A §2.1.
var FACTORY_TAGS = {
  ORDER_LOCK:   'ORDER_LOCK',     // Ch. 2 §4.3 — "No further changes allowed."
  HOLD:         'HOLD',           // App. A §2.1 — RED HOLD TAG on physical frames
  VARIATION:    'VARIATION',      // App. A §2 — variation re-quote required
  RED_TAG:      'RED_TAG',        // Ch. 4 §3.2 — Red Tag Loss Sheet entry
  ZIP_CAP:      'ZIP_CAP',        // Ch. 2 §3.1 — Zip Money Cap respected (<$20k)
};

// ── FactoryState class ───────────────────────────────────────────────────────
// A pub-sub container for factory-scoped state. Pattern intentionally mirrors
// the global setState/subscribe in 05-state-auth-rbac.js so factory modules
// stay consistent with the rest of the CRM.

class FactoryState {
  constructor(seed) {
    this._state = Object.assign({
      // Active production data (mirrors what's persisted in localStorage
      // 'spartan_factory_orders' / 'spartan_factory_items' — see 25-factory-persistence.js)
      orders:           [],
      items:            [],

      // The "VIC Job Traveler" sheets currently circulating at the
      // Wednesday Scheduling Meeting (Ch. 2 §3.2). Indexed by jobNumber.
      travelers:        {},

      // Red Tag Loss Sheet entries for the day (Ch. 4 §3.2).
      redTags:          [],

      // Audit trail of station moves and status changes for the
      // Production Manager's End-Of-Day Audit (Ch. 4 §4.1).
      auditLog:         [],

      // Hold / Variation queue (App. A §2). Job IDs currently red-tagged.
      holds:            [],

      // Capacity snapshot computed from items + station caps. See
      // CapacityCalculator in 23-factory-helpers.js.
      capacitySnapshot: null,

      // Currently-selected board view: 'queue' | 'kanban' | 'capacity' | 'dispatch'
      view:             'queue',

      // Filters
      branchFilter:     'all',
      stationFilter:    null,
    }, seed || {});

    this._subscribers = [];
  }

  get()           { return this._state; }
  patch(partial)  { this._state = Object.assign({}, this._state, partial); this._notify(); return this._state; }
  set(partial)    { return this.patch(partial); }   // alias

  subscribe(fn) {
    if (typeof fn !== 'function') return function noop(){};
    this._subscribers.push(fn);
    var subs = this._subscribers;
    return function unsubscribe() {
      var i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  _notify() {
    var s = this._state;
    this._subscribers.slice().forEach(function(fn){
      try { fn(s); } catch (e) { console.warn('[FactoryState] subscriber error:', e); }
    });
  }

  // Convenience mutators used by the renderers / helpers.
  upsertOrder(order) {
    var orders = (this._state.orders || []).slice();
    var idx = orders.findIndex(function(o){ return o.id === order.id; });
    if (idx >= 0) orders[idx] = Object.assign({}, orders[idx], order); else orders.push(order);
    return this.patch({ orders: orders });
  }

  upsertItem(item) {
    var items = (this._state.items || []).slice();
    var idx = items.findIndex(function(i){ return i.id === item.id; });
    if (idx >= 0) items[idx] = Object.assign({}, items[idx], item); else items.push(item);
    return this.patch({ items: items });
  }

  removeOrder(orderId) {
    return this.patch({ orders: (this._state.orders || []).filter(function(o){ return o.id !== orderId; }) });
  }

  appendAudit(entry) {
    var log = (this._state.auditLog || []).slice();
    log.push(Object.assign({ at: new Date().toISOString() }, entry));
    return this.patch({ auditLog: log });
  }
}

// ── Singleton + global wrappers (CONTRACT.md "public API") ──────────────────

var _factoryState     = new FactoryState();
var factorySubscribers = _factoryState._subscribers;

function getFactoryState()           { return _factoryState.get(); }
function setFactoryState(partial)    { return _factoryState.patch(partial); }
function subscribeFactory(fn)        { return _factoryState.subscribe(fn); }

// NOTE: deliberately NO bridge to global setState. Callers that need the
// CRM to re-render should call renderPage() themselves after a factory
// state mutation. The legacy modules/16*-factory-*.js files already do this
// and we don't want to fire a redundant re-render cycle on every patch.
