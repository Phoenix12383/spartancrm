// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/31-factory-v1-suppliers.js
// Factory CRM Base Class Diagram v1.5 §5 — Suppliers and procurement (light)
//
// Phase 1 SCOPE — DELIBERATELY LIGHT:
//   - The walkthrough is rich on procurement issues and these problems deserve
//     a dedicated extension (v3 §3B) and Phase 2 work (BOM, B2B portal, glass-
//     to-site, date-change resend, predicted shortfall). This file models
//     just enough that the eventual extensions have a place to plug in.
//   - JobAllocation is the §2.3 "orders mixing together" answer — modelling
//     allocations explicitly means a goods receipt can be reconciled
//     job-by-job rather than as one undifferentiated pile.
//   - DiscrepancyType.WRONG_ORDER_MIXED_IN is a specific call-out for §2.3.
//   - GoodsReceipt.photos exists for evidence — today nothing visual is
//     captured at receiving.
//
// Phase 2 will add: FactoryBOM + FactoryBOMLine, ProposedSupplierOrder,
// DeliveryDestination (factory vs install site for glass), OrderTrigger,
// IOrderTransport with AluplastB2BPortalAdapter and GlassSiteEmailAdapter,
// IInstallDateChangeListener with GlassOrderResendListener,
// IPredictedShortfallEngine, HardwareBundle and BundleContent.
//
// Globals exposed:
//   FactorySupplierType, FactoryOrderStatus, FactoryReceiptStatus,
//   FactoryDiscrepancyType (enums)
//   FactorySupplier, FactoryMaterialOrder, FactoryOrderLine,
//   FactoryJobAllocation, FactoryGoodsReceipt, FactoryDiscrepancy
// ═════════════════════════════════════════════════════════════════════════════

// ── Enums ────────────────────────────────────────────────────────────────────

var FactorySupplierType = Object.freeze({
  PROFILE_MANUFACTURER:    'PROFILE_MANUFACTURER',
  GLASS_SUPPLIER:          'GLASS_SUPPLIER',
  HARDWARE_SUPPLIER:       'HARDWARE_SUPPLIER',
  STEEL_SUPPLIER:          'STEEL_SUPPLIER',
  TIMBER_SUPPLIER:         'TIMBER_SUPPLIER',
  FLYSCREEN_SUPPLIER:      'FLYSCREEN_SUPPLIER',
  ANCILLARY:               'ANCILLARY',
  OUTSOURCED_MANUFACTURING:'OUTSOURCED_MANUFACTURING',
});

var FactoryOrderStatus = Object.freeze({
  DRAFT:        'DRAFT',
  SUBMITTED:    'SUBMITTED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  IN_TRANSIT:   'IN_TRANSIT',
  DELIVERED:    'DELIVERED',
  VERIFIED:     'VERIFIED',
  DISCREPANCY:  'DISCREPANCY',
  CANCELLED:    'CANCELLED',
});

var FactoryReceiptStatus = Object.freeze({
  AS_EXPECTED:           'AS_EXPECTED',
  SHORT_DELIVERY:        'SHORT_DELIVERY',
  OVER_DELIVERY:         'OVER_DELIVERY',
  WRONG_ITEM:            'WRONG_ITEM',
  DAMAGED:               'DAMAGED',
  MIXED_DISCREPANCIES:   'MIXED_DISCREPANCIES',
});

var FactoryDiscrepancyType = Object.freeze({
  QUANTITY_SHORT:        'QUANTITY_SHORT',
  QUANTITY_OVER:         'QUANTITY_OVER',
  WRONG_SKU:             'WRONG_SKU',
  WRONG_COLOUR:          'WRONG_COLOUR',
  WRONG_DIMENSIONS:      'WRONG_DIMENSIONS',
  DAMAGED:               'DAMAGED',
  WRONG_ORDER_MIXED_IN:  'WRONG_ORDER_MIXED_IN',  // §2.3 specific
});

// ── Supplier ─────────────────────────────────────────────────────────────────

class FactorySupplier {
  constructor(opts) {
    opts = opts || {};
    this.supplierId    = opts.supplierId  || ('sup_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.displayName   = opts.displayName || '';
    this.type          = opts.type        || FactorySupplierType.ANCILLARY;
    this.leadTimeDays  = Number(opts.leadTimeDays) || 0;
    this.contactEmail  = opts.contactEmail || '';
    this.active        = (opts.active !== false);
  }
}

// ── MaterialOrder ────────────────────────────────────────────────────────────

class FactoryMaterialOrder {
  constructor(opts) {
    opts = opts || {};
    this.orderId         = opts.orderId  || ('mo_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.supplier        = opts.supplier || null;
    this.status          = opts.status   || FactoryOrderStatus.DRAFT;
    this.orderedAt       = opts.orderedAt || null;
    this.expectedArrival = opts.expectedArrival || null;
    this.actualArrival   = opts.actualArrival   || null;
    this.orderedBy       = opts.orderedBy || null;        // FactoryUser
    this.totalValue      = Number(opts.totalValue) || 0;
    this.lines           = Array.isArray(opts.lines) ? opts.lines.slice() : [];
    this.receipt         = opts.receipt || null;          // FactoryGoodsReceipt (0..1)
  }

  addLine(line) {
    if (!(line instanceof FactoryOrderLine)) {
      throw new Error('FactoryMaterialOrder.addLine: expected FactoryOrderLine');
    }
    line.order = this;
    this.lines.push(line);
    this.totalValue = this.lines.reduce(function(s,l){
      return s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    }, 0);
    return line;
  }

  submit() {
    if (this.status !== FactoryOrderStatus.DRAFT) {
      throw new Error('FactoryMaterialOrder.submit: only DRAFT orders can be submitted (current: ' + this.status + ')');
    }
    this.status    = FactoryOrderStatus.SUBMITTED;
    this.orderedAt = new Date().toISOString();
    return this;
  }
}

// ── OrderLine + JobAllocation ────────────────────────────────────────────────

class FactoryOrderLine {
  constructor(opts) {
    opts = opts || {};
    this.order             = opts.order || null;          // FactoryMaterialOrder
    this.item              = opts.item || null;            // FactoryStockItem
    this.quantity          = Number(opts.quantity) || 0;
    this.unitPrice         = Number(opts.unitPrice) || 0;
    this.allocatedToJobs   = Array.isArray(opts.allocatedToJobs) ? opts.allocatedToJobs.slice() : [];
  }

  allocateTo(job, quantity, reason) {
    var alloc = new FactoryJobAllocation({
      line: this,
      job: job,
      allocatedQuantity: quantity,
      reason: reason || '',
    });
    this.allocatedToJobs.push(alloc);
    return alloc;
  }

  totalAllocated() {
    return this.allocatedToJobs.reduce(function(s,a){ return s + (a.allocatedQuantity || 0); }, 0);
  }

  unallocated() { return Math.max(0, this.quantity - this.totalAllocated()); }
}

class FactoryJobAllocation {
  constructor(opts) {
    opts = opts || {};
    this.line              = opts.line || null;
    this.job               = opts.job  || null;
    this.allocatedQuantity = Number(opts.allocatedQuantity) || 0;
    this.reason            = opts.reason || '';
  }
}

// ── GoodsReceipt + Discrepancy ──────────────────────────────────────────────

class FactoryGoodsReceipt {
  constructor(opts) {
    opts = opts || {};
    this.receiptId     = opts.receiptId  || ('gr_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.order         = opts.order      || null;
    this.receivedAt    = opts.receivedAt || new Date().toISOString();
    this.receivedBy    = opts.receivedBy || null;          // FactoryUser
    this.status        = opts.status     || FactoryReceiptStatus.AS_EXPECTED;
    this.discrepancies = Array.isArray(opts.discrepancies) ? opts.discrepancies.slice() : [];
    this.photos        = Array.isArray(opts.photos)        ? opts.photos.slice()        : [];
  }

  addDiscrepancy(d) {
    if (!(d instanceof FactoryDiscrepancy)) {
      throw new Error('FactoryGoodsReceipt.addDiscrepancy: expected FactoryDiscrepancy');
    }
    this.discrepancies.push(d);
    // Auto-promote receipt status if it was clean.
    if (this.discrepancies.length === 1) this.status = FactoryReceiptStatus.MIXED_DISCREPANCIES;
    return d;
  }

  attachPhoto(photoRef) {
    if (photoRef) this.photos.push(photoRef);
    return this;
  }
}

class FactoryDiscrepancy {
  constructor(opts) {
    opts = opts || {};
    this.line     = opts.line || null;
    this.expected = Number(opts.expected) || 0;
    this.received = Number(opts.received) || 0;
    this.type     = opts.type  || FactoryDiscrepancyType.QUANTITY_SHORT;
    this.notes    = opts.notes || '';
  }
}
