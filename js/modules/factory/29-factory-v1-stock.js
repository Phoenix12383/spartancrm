// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/29-factory-v1-stock.js
// Factory CRM Base Class Diagram v1.5 §3 — Stock, locations, physical tracking
//
// Today there is no stock system at all (walkthrough §2.1). QR codes are
// generated and physically applied but never scanned (§2.7). Stock locations
// are unknown (§2.6 — live floor map needed). The base introduces stock
// items, locations, QR tags, and scan events as first-class entities.
//
// Phase 1 SCOPE:
//   - StockMovement is APPEND-ONLY; current quantities and locations on
//     StockItem are projections — the truth is the event stream.
//   - StockCategory retains v1's 11 values. Phase 2 aligns to manual's 7
//     (Aluplast Profiles, Steel Reinforcement, Hardware Siegenia, Fly Screen
//     Materials, Timber, Glazing Beads, Ancillaries).
//   - Location carries Coordinates + floorMap so the live floor map (§2.6)
//     is possible.
//   - QRTag abstracts via TagSubject so the same infrastructure works for
//     frames, stock pallets, locations, and pallet groupings.
//   - MovementType.OFFCUT_RETAINED vs WASTE_DISPOSAL is the foundation for
//     waste analytics (walkthrough §2.4).
//
// Globals exposed:
//   FactoryStockCategory, FactoryUnitOfMeasure, FactoryMovementType,
//   FactoryLocationType, FactoryScanContext (enums)
//   FactoryStockItem, FactoryStockMovement, FactoryLocation,
//   FactoryCoordinates, FactoryQRTag, FactoryTagSubject, FactoryFrameTag,
//   FactoryStockTag, FactoryLocationTag, FactoryPalletTag, FactoryScanEvent
// ═════════════════════════════════════════════════════════════════════════════

// ── Enums ────────────────────────────────────────────────────────────────────

// v1.5 keeps v1's 11-category list. Phase 2 reduces to manual's 7.
var FactoryStockCategory = Object.freeze({
  PROFILE:     'PROFILE',
  GLASS:       'GLASS',
  HARDWARE:    'HARDWARE',
  STEEL:       'STEEL',
  REVEAL:      'REVEAL',
  BEAD:        'BEAD',
  GASKET:      'GASKET',
  TIMBER:      'TIMBER',
  CONSUMABLE:  'CONSUMABLE',
  FLYSCREEN:   'FLYSCREEN',
  ANCILLARY:   'ANCILLARY',
});

var FactoryUnitOfMeasure = Object.freeze({
  EACH:       'EACH',
  LENGTH_MM:  'LENGTH_MM',
  AREA_M2:    'AREA_M2',
  WEIGHT_KG:  'WEIGHT_KG',
});

var FactoryMovementType = Object.freeze({
  INWARD_DELIVERY:     'INWARD_DELIVERY',
  ALLOCATION_TO_JOB:   'ALLOCATION_TO_JOB',
  CONSUMPTION:         'CONSUMPTION',
  OFFCUT_RETAINED:     'OFFCUT_RETAINED',     // §2.4 — kept stock
  WASTE_DISPOSAL:      'WASTE_DISPOSAL',      // §2.4 — gone
  TRANSFER:            'TRANSFER',
  ADJUSTMENT_UP:       'ADJUSTMENT_UP',
  ADJUSTMENT_DOWN:     'ADJUSTMENT_DOWN',
  RETURN_TO_SUPPLIER:  'RETURN_TO_SUPPLIER',
});

var FactoryLocationType = Object.freeze({
  STORAGE_RACK:  'STORAGE_RACK',
  FLOOR_BAY:     'FLOOR_BAY',
  STAGING_AREA:  'STAGING_AREA',
  WORKSTATION:   'WORKSTATION',
  QC_AREA:       'QC_AREA',
  DISPATCH_BAY:  'DISPATCH_BAY',
  TRUCK:         'TRUCK',
  OFFCUT_BIN:    'OFFCUT_BIN',
  WASTE_BIN:     'WASTE_BIN',
  EXTERNAL:      'EXTERNAL',
});

var FactoryScanContext = Object.freeze({
  STOCK_RECEIVED:    'STOCK_RECEIVED',
  STOCK_PUT_AWAY:    'STOCK_PUT_AWAY',
  STOCK_PICKED:      'STOCK_PICKED',
  FRAME_STARTED:     'FRAME_STARTED',
  FRAME_COMPLETED:   'FRAME_COMPLETED',
  FRAME_QC_PASS:     'FRAME_QC_PASS',
  FRAME_QC_FAIL:     'FRAME_QC_FAIL',
  FRAME_DISPATCHED:  'FRAME_DISPATCHED',
  LOCATION_AUDIT:    'LOCATION_AUDIT',
  UNKNOWN:           'UNKNOWN',
});

// ── Value objects ────────────────────────────────────────────────────────────

class FactoryCoordinates {
  constructor(opts) {
    opts = opts || {};
    this.x        = Number(opts.x) || 0;
    this.y        = Number(opts.y) || 0;
    this.floorMap = opts.floorMap || null;   // identifier of the floor map this point is on
  }
}

// ── Stock ────────────────────────────────────────────────────────────────────

class FactoryStockItem {
  constructor(opts) {
    opts = opts || {};
    this.sku           = opts.sku || ('sku_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.description   = opts.description || '';
    this.category      = opts.category || FactoryStockCategory.ANCILLARY;
    this.uom           = opts.uom      || FactoryUnitOfMeasure.EACH;
    // Projections — the truth is the StockMovement event stream.
    this.currentQty    = Number(opts.currentQty)   || 0;
    this.allocatedQty  = Number(opts.allocatedQty) || 0;
    this.availableQty  = (typeof opts.availableQty === 'number')
      ? opts.availableQty
      : Math.max(0, this.currentQty - this.allocatedQty);
  }
  recomputeAvailable() {
    this.availableQty = Math.max(0, this.currentQty - this.allocatedQty);
    return this.availableQty;
  }
}

// Append-only — every state change writes a movement.
class FactoryStockMovement {
  constructor(opts) {
    opts = opts || {};
    this.movementId   = opts.movementId || ('sm_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.item         = opts.item || null;                    // FactoryStockItem
    this.quantity     = Number(opts.quantity) || 0;           // signed: negative for outflow
    this.type         = opts.type || FactoryMovementType.ADJUSTMENT_UP;
    this.occurredAt   = opts.occurredAt || new Date().toISOString();
    this.actor        = opts.actor || null;                   // FactoryUser
    this.reference    = opts.reference || '';                 // PO number, job ref, etc.
    this.fromLocation = opts.fromLocation || null;            // nullable — INWARD_DELIVERY has no from
    this.toLocation   = opts.toLocation   || null;            // nullable — RETURN_TO_SUPPLIER has no to
  }

  // Apply this movement to its StockItem's projections.
  // Caller is responsible for persisting both the movement and the item.
  applyTo(item) {
    var target = item || this.item;
    if (!(target instanceof FactoryStockItem)) return;
    var delta = Number(this.quantity) || 0;
    switch (this.type) {
      case FactoryMovementType.INWARD_DELIVERY:
      case FactoryMovementType.ADJUSTMENT_UP:
        target.currentQty += Math.abs(delta);
        break;
      case FactoryMovementType.CONSUMPTION:
      case FactoryMovementType.WASTE_DISPOSAL:
      case FactoryMovementType.ADJUSTMENT_DOWN:
      case FactoryMovementType.RETURN_TO_SUPPLIER:
        target.currentQty = Math.max(0, target.currentQty - Math.abs(delta));
        break;
      case FactoryMovementType.ALLOCATION_TO_JOB:
        target.allocatedQty += Math.abs(delta);
        break;
      case FactoryMovementType.OFFCUT_RETAINED:
        // Offcuts are kept stock — increment current.
        target.currentQty += Math.abs(delta);
        break;
      case FactoryMovementType.TRANSFER:
        // Transfers don't change quantities, only locations.
        break;
    }
    target.recomputeAvailable();
    return target;
  }
}

// ── Location ─────────────────────────────────────────────────────────────────

class FactoryLocation {
  constructor(opts) {
    opts = opts || {};
    this.locationId       = opts.locationId || ('loc_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.name             = opts.name || '';
    this.type             = opts.type || FactoryLocationType.STORAGE_RACK;
    this.floorCoordinates = opts.floorCoordinates instanceof FactoryCoordinates
      ? opts.floorCoordinates
      : new FactoryCoordinates(opts.floorCoordinates || {});
    this.isPickupZone     = !!opts.isPickupZone;
    this.isStorageZone    = !!opts.isStorageZone;
    this.isProductionZone = !!opts.isProductionZone;
  }
}

// ── QR tagging (abstract subject + 4 concrete subjects) ─────────────────────

class FactoryTagSubject {
  constructor(kind) { this.kind = kind; }   // 'frame'|'stock'|'location'|'pallet'
}

class FactoryFrameTag extends FactoryTagSubject {
  constructor(opts) {
    super('frame');
    this.frame = (opts && opts.frame) || null;            // FactoryFrame
  }
}

class FactoryStockTag extends FactoryTagSubject {
  constructor(opts) {
    super('stock');
    opts = opts || {};
    this.item             = opts.item || null;            // FactoryStockItem
    this.quantityCovered  = Number(opts.quantityCovered) || 0;
    this.batchReference   = opts.batchReference || '';
  }
}

class FactoryLocationTag extends FactoryTagSubject {
  constructor(opts) {
    super('location');
    this.location = (opts && opts.location) || null;      // FactoryLocation
  }
}

class FactoryPalletTag extends FactoryTagSubject {
  constructor(opts) {
    super('pallet');
    this.palletReference = (opts && opts.palletReference) || '';
  }
}

class FactoryQRTag {
  constructor(opts) {
    opts = opts || {};
    this.tagId      = opts.tagId || ('qr_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.subject    = opts.subject instanceof FactoryTagSubject ? opts.subject : null;
    this.printedAt  = opts.printedAt || new Date().toISOString();
    this.printedBy  = opts.printedBy || null;             // FactoryUser
    this.printedAtWorkstation = opts.printedAtWorkstation || null;  // Workstation
    this.active     = (opts.active !== false);
  }
  deactivate() { this.active = false; }
}

// ── ScanEvent ────────────────────────────────────────────────────────────────

class FactoryScanEvent {
  constructor(opts) {
    opts = opts || {};
    this.scanId            = opts.scanId || ('scan_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.tag               = opts.tag || null;                    // FactoryQRTag
    this.scannedAt         = opts.scannedAt || new Date().toISOString();
    this.scanner           = opts.scanner || null;                // FactoryUser
    this.scannedAtWorkstation = opts.scannedAtWorkstation || null;
    this.scannedAtLocation = opts.scannedAtLocation || null;      // FactoryLocation
    this.context           = opts.context || FactoryScanContext.UNKNOWN;
  }
}
