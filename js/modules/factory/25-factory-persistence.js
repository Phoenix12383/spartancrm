// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/25-factory-persistence.js
// Database & localStorage operations for the Factory CRM.
//
// Mirrors the dbUpsert / dbToJob / jobToDb pattern from 01-persistence.js but
// scoped to factory tables (factory_orders, factory_items, factory_red_tags,
// factory_travelers).
//
// Concepts encoded from the Operations Manual v3.1:
//   - Ch. 1 §3.3 "Source of Truth" ceremony — Final Signed Order overrides
//     the quotation; persisted to Ascora as PDF + status flag.
//   - Ch. 2 §4.3 ORDER LOCK tag — when present, persistence layer rejects
//     mutations to product-spec fields.
//   - Ch. 4 §3.2 Red Tag Loss Sheet — persists every breach with cause flag
//     (Human vs Machine).
//
// Globals exposed (per CONTRACT.md):
//   FactoryPersistence (class), saveFactoryOrder, saveFactoryItem,
//   loadFactoryOrders, loadFactoryItems, syncFactoryToSupabase
//
// Depends on globals from 01-persistence.js: _sb, dbUpsert
// Depends on globals from 24-factory-state.js: setFactoryState, getFactoryState
// ═════════════════════════════════════════════════════════════════════════════

// LocalStorage keys — kept stable so the existing data in browsers survives.
var FACTORY_STORAGE_KEYS = {
  ORDERS:    'spartan_factory_orders',     // matches 16-factory-crm.js
  ITEMS:     'spartan_factory_items',      // matches 16-factory-crm.js
  RED_TAGS:  'spartan_factory_red_tags',
  TRAVELERS: 'spartan_factory_travelers',
};

// Fields that are LOCKED once a job is tagged ORDER_LOCK (Ch. 2 §4.3).
// Attempts to update these via FactoryPersistence will be rejected.
var FACTORY_LOCKED_FIELDS = [
  'frameCount', 'glassSpec', 'profileSystem', 'colour',
  'widthMm', 'heightMm', 'panelCount', 'productType',
];

class FactoryPersistence {
  // ── Order CRUD ─────────────────────────────────────────────────────────────

  static saveFactoryOrder(order) {
    if (!order || !order.id) throw new Error('FactoryPersistence.saveFactoryOrder: order.id required');

    var existing = FactoryPersistence.loadFactoryOrders();
    var prior = existing.find(function(o){ return o.id === order.id; });

    // ORDER LOCK gate (Ch. 2 §4.3). Reject changes to locked fields.
    if (prior && Array.isArray(prior.tags) && prior.tags.indexOf(FACTORY_TAGS.ORDER_LOCK) >= 0) {
      var changed = FACTORY_LOCKED_FIELDS.filter(function(f){
        return order[f] !== undefined && order[f] !== prior[f];
      });
      if (changed.length > 0) {
        var msg = 'ORDER LOCK: cannot change [' + changed.join(', ') + '] — clear ORDER_LOCK tag first';
        if (typeof addToast === 'function') addToast('🔒 ' + msg, 'error');
        throw new Error(msg);
      }
    }

    var updated;
    if (prior) {
      updated = existing.map(function(o){ return o.id === order.id ? Object.assign({}, o, order) : o; });
    } else {
      updated = existing.concat([order]);
    }

    localStorage.setItem(FACTORY_STORAGE_KEYS.ORDERS, JSON.stringify(updated));
    if (typeof _sb !== 'undefined' && _sb && typeof dbUpsert === 'function') {
      dbUpsert('factory_orders', order);
    }

    // Mirror into FactoryState if available.
    if (typeof _factoryState !== 'undefined' && _factoryState) {
      _factoryState.upsertOrder(order);
    }

    return order;
  }

  static loadFactoryOrders() {
    try { return JSON.parse(localStorage.getItem(FACTORY_STORAGE_KEYS.ORDERS) || '[]'); }
    catch (e) { console.warn('[FactoryPersistence] loadFactoryOrders parse failed:', e); return []; }
  }

  static deleteFactoryOrder(orderId) {
    var orders = FactoryPersistence.loadFactoryOrders().filter(function(o){ return o.id !== orderId; });
    localStorage.setItem(FACTORY_STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    if (typeof _factoryState !== 'undefined' && _factoryState) _factoryState.removeOrder(orderId);
  }

  // ── Item CRUD (per-frame records) ──────────────────────────────────────────

  static saveFactoryItem(item) {
    if (!item || !item.id) throw new Error('FactoryPersistence.saveFactoryItem: item.id required');

    var items = FactoryPersistence.loadFactoryItems();
    var idx   = items.findIndex(function(i){ return i.id === item.id; });
    if (idx >= 0) items[idx] = Object.assign({}, items[idx], item);
    else items.push(item);

    localStorage.setItem(FACTORY_STORAGE_KEYS.ITEMS, JSON.stringify(items));
    if (typeof _sb !== 'undefined' && _sb && typeof dbUpsert === 'function') {
      dbUpsert('factory_items', item);
    }
    if (typeof _factoryState !== 'undefined' && _factoryState) _factoryState.upsertItem(item);
    return item;
  }

  static loadFactoryItems() {
    try { return JSON.parse(localStorage.getItem(FACTORY_STORAGE_KEYS.ITEMS) || '[]'); }
    catch (e) { console.warn('[FactoryPersistence] loadFactoryItems parse failed:', e); return []; }
  }

  // ── Red Tag persistence (Ch. 4 §3.2) ───────────────────────────────────────

  static saveRedTag(redTag) {
    if (!redTag || !redTag.id) throw new Error('FactoryPersistence.saveRedTag: id required');
    var all = FactoryPersistence.loadRedTags();
    all.push(redTag);
    localStorage.setItem(FACTORY_STORAGE_KEYS.RED_TAGS, JSON.stringify(all));
    if (typeof _sb !== 'undefined' && _sb && typeof dbUpsert === 'function') {
      dbUpsert('factory_red_tags', redTag);
    }
    return redTag;
  }

  static loadRedTags() {
    try { return JSON.parse(localStorage.getItem(FACTORY_STORAGE_KEYS.RED_TAGS) || '[]'); }
    catch (e) { return []; }
  }

  // ── Job Traveler persistence (Ch. 2 §3.2) ──────────────────────────────────

  static saveTraveler(traveler) {
    if (!traveler || !traveler.jobNumber) throw new Error('FactoryPersistence.saveTraveler: jobNumber required');
    var all = FactoryPersistence.loadTravelers();
    all[traveler.jobNumber] = traveler;
    localStorage.setItem(FACTORY_STORAGE_KEYS.TRAVELERS, JSON.stringify(all));
    if (typeof _sb !== 'undefined' && _sb && typeof dbUpsert === 'function') {
      dbUpsert('factory_travelers', traveler);
    }
    return traveler;
  }

  static loadTravelers() {
    try { return JSON.parse(localStorage.getItem(FACTORY_STORAGE_KEYS.TRAVELERS) || '{}'); }
    catch (e) { return {}; }
  }

  // ── Bulk sync ──────────────────────────────────────────────────────────────

  // Push everything in localStorage to Supabase. Used after coming back online.
  // Returns a Promise resolving to {orders, items, redTags, travelers} counts.
  static syncFactoryToSupabase() {
    if (typeof _sb === 'undefined' || !_sb || typeof dbUpsert !== 'function') {
      return Promise.resolve({ skipped: 'offline' });
    }
    var orders    = FactoryPersistence.loadFactoryOrders();
    var items     = FactoryPersistence.loadFactoryItems();
    var redTags   = FactoryPersistence.loadRedTags();
    var travelers = Object.values(FactoryPersistence.loadTravelers());

    return Promise.allSettled([].concat(
      orders.map(function(o){ return dbUpsert('factory_orders', o); }),
      items.map(function(i){ return dbUpsert('factory_items', i); }),
      redTags.map(function(r){ return dbUpsert('factory_red_tags', r); }),
      travelers.map(function(t){ return dbUpsert('factory_travelers', t); })
    )).then(function(results){
      return {
        orders: orders.length, items: items.length,
        redTags: redTags.length, travelers: travelers.length,
        rejected: results.filter(function(r){ return r.status === 'rejected'; }).length,
      };
    });
  }
}

// ── Function-style global wrappers (CONTRACT.md "public API") ───────────────

function saveFactoryOrder(o)        { return FactoryPersistence.saveFactoryOrder(o); }
function saveFactoryItem(i)         { return FactoryPersistence.saveFactoryItem(i); }
function loadFactoryOrders()        { return FactoryPersistence.loadFactoryOrders(); }
function loadFactoryItems()         { return FactoryPersistence.loadFactoryItems(); }
function deleteFactoryOrder(id)     { return FactoryPersistence.deleteFactoryOrder(id); }
function saveFactoryRedTag(r)       { return FactoryPersistence.saveRedTag(r); }
function loadFactoryRedTags()       { return FactoryPersistence.loadRedTags(); }
function saveFactoryTraveler(t)     { return FactoryPersistence.saveTraveler(t); }
function loadFactoryTravelers()     { return FactoryPersistence.loadTravelers(); }
function syncFactoryToSupabase()    { return FactoryPersistence.syncFactoryToSupabase(); }
