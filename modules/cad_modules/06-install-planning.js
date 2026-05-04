// ═══════════════════════════════════════════════════════════════════════════
// INSTALL PLANNING CONSTANTS — lookup keys for per-frame install time
// (WIP9). Values keyed on PRICING_DEFAULTS.installPlanning tables.
// ═══════════════════════════════════════════════════════════════════════════

const PROPERTY_TYPES = [
  { id: 'brick_veneer',          label: 'Brick Veneer' },
  { id: 'double_brick',          label: 'Double Brick' },
  { id: 'weatherboard_cladding', label: 'Weatherboard / Cladding' },
];

const FLOOR_LEVELS = [
  { id: 'ground', label: 'Ground floor', n: 0 },
  { id: 'first',  label: 'First floor',  n: 1 },
  { id: 'second', label: 'Second floor', n: 2 },
  { id: 'third',  label: 'Third floor',  n: 3 },
  { id: 'above3', label: 'Above 3rd floor', n: 4 },
];

// WIP23: Installation type — determines which install-time table to use in
// S_install calculations, and whether install is priced at all.
// - retrofit: default, existing residence with demo of old window
// - supply_only: no install cost at all (factory-only delivery)
// - new_construction: reduced times, no demo required
const INSTALLATION_TYPES = [
  { id: 'retrofit',         label: 'Retrofit' },
  { id: 'supply_only',      label: 'Supply Only' },
  { id: 'new_construction', label: 'New Construction' },
];

// WIP27: Standard-colour rules. Any combination not on this list triggers
// special-order warnings (CAD caution banner + CRM alert flag).
// Rules agreed with Phoenix 2026-04:
//   1. White both sides
//   2. Jet Black exterior + White interior
//   3. Monument exterior + White interior
//   4. Jet Black both sides
//   5. Monument both sides
//   6. Timber/wood colour on both sides (any wood on either side, matching
//      or not) — because asymmetric wood laminate is still bilateral-coated
//      at the factory and doesn't attract a special-order premium
//
// Returns { standard: boolean, reason: string|null } where reason is a human
// description when non-standard (useful for CRM payload + tooltip text).
function isStandardColourCombo(exteriorId, interiorId) {
  var ext = exteriorId || 'white_body';
  var intr = interiorId || 'white_body';
  // Find colour records for cat lookup
  var allColours = (typeof COLOURS !== 'undefined') ? COLOURS : [];
  var extRec = allColours.find(function(c){ return c.id === ext; });
  var intRec = allColours.find(function(c){ return c.id === intr; });
  var extCat = extRec && extRec.cat;
  var intCat = intRec && intRec.cat;
  // Rule 1: white_body both sides
  if (ext === 'white_body' && intr === 'white_body') return { standard: true, reason: null };
  // Rule 2: jet_black ext + white int
  if (ext === 'jet_black' && intr === 'white_body') return { standard: true, reason: null };
  // Rule 3: monument ext + white int
  if (ext === 'monument' && intr === 'white_body') return { standard: true, reason: null };
  // Rule 4: jet_black both sides
  if (ext === 'jet_black' && intr === 'jet_black') return { standard: true, reason: null };
  // Rule 5: monument both sides
  if (ext === 'monument' && intr === 'monument') return { standard: true, reason: null };
  // Rule 6: same wood/timber on both sides (must match — asymmetric wood
  // laminate is a special-order item even though both sides are coloured)
  if (extCat === 'wood' && intCat === 'wood' && ext === intr) return { standard: true, reason: null };
  // Everything else is special-order
  var extLabel = (extRec && extRec.label) || ext;
  var intLabel = (intRec && intRec.label) || intr;
  return {
    standard: false,
    reason: 'Special-order colour combination: ' + extLabel + ' exterior / ' + intLabel + ' interior. Extended lead time + surcharge may apply.',
  };
}

// Map numeric floorLevel (0..4+) to floor-bucket id used by installPlanning.
function floorLevelToBucket(n) {
  var v = Number(n) || 0;
  if (v <= 0) return 'ground';
  if (v === 1) return 'first';
  if (v === 2) return 'second';
  if (v === 3) return 'third';
  return 'above3';
}

// Reverse: bucket id → numeric floorLevel.
function floorBucketToLevel(id) {
  for (var i = 0; i < FLOOR_LEVELS.length; i++) {
    if (FLOOR_LEVELS[i].id === id) return FLOOR_LEVELS[i].n;
  }
  return 0;
}

if (typeof window !== 'undefined') {
  window.PROPERTY_TYPES = PROPERTY_TYPES;
  window.FLOOR_LEVELS = FLOOR_LEVELS;
  window.floorLevelToBucket = floorLevelToBucket;
  window.floorBucketToLevel = floorBucketToLevel;
}

// ═══════════════════════════════════════════════════════════════════════════
// computeFrameInstallMinutes — SINGLE SOURCE OF TRUTH for per-frame install
// minutes. Both calculateFramePrice (for the install COST in the price) and
// autoCalcInstallPlanning (for the saved installMinutes field on the frame
// + Check Measure hours/days) must call this. Until WIP38 they each had their
// own formula reading different parts of the settings tree, so editing the
// Install Times Matrix moved the price but not the saved minutes, and editing
// Install Planning baseMinutes/floorAddOn moved the saved minutes but not the
// price. supply_only frames also still saved 60 minutes — wrong by definition.
//
// Formula (all parts read from the same pc object the Settings UI writes to):
//
//   if installationType === 'supply_only': return 0
//
//   matrixBase = pc.stations.S_install.installTimes[installType][productType].t
//                (× panels for bifold_door)        ← Install Times Matrix UI
//   + sealTrim + cleanup                          ← S_install ops in Production Times UI
//   + propertyTypeAdd[propertyType][sizeBucket]   ← WIP9 baseMinutes (now additive)
//   + floorAddOn[floorBucket]                     ← WIP9 floor add-on (unchanged)
//
// The WIP9 baseMinutes table previously acted as the absolute base for the
// saved installMinutes. After unification it becomes an ADDITIVE adjustment
// per property-type/size: the matrix gives the product baseline, the WIP9
// table layers site-specific extras on top (double brick takes longer, etc.).
// User edits to the WIP9 table still take effect; the UI label has been
// updated to reflect the additive semantics.
//
// Returns { minutes: Number, detail: String, supplyOnly: Boolean,
//           parts: { matrixBase, panelsMult, sealTrim, cleanup,
//                    propertyTypeAdd, floorAddOn } }
// so callers that want to surface the breakdown can do so without a second
// pass.
// ═══════════════════════════════════════════════════════════════════════════
function computeFrameInstallMinutes(frame, pc) {
  if (!frame) return { minutes: 0, detail: '', supplyOnly: false, parts: {} };
  pc = pc || (typeof PRICING_DEFAULTS !== 'undefined' ? PRICING_DEFAULTS : {})
        || (typeof window !== 'undefined' && window.PRICING_DEFAULTS) || {};

  var installationType = frame.installationType
    || (frame.supplyOnly === true ? 'supply_only' : 'retrofit');

  // supply_only: zero minutes — no install at all. This is what was wrong
  // pre-WIP38: autoCalcInstallPlanning ignored installationType entirely and
  // saved a non-zero installMinutes for supply_only frames.
  if (installationType === 'supply_only') {
    return {
      minutes: 0, detail: 'supply only - no install', supplyOnly: true,
      parts: { matrixBase: 0, panelsMult: 0, sealTrim: 0, cleanup: 0, propertyTypeAdd: 0, floorAddOn: 0 }
    };
  }

  var productType = frame.productType;
  var panels = (typeof frame.panelCount === 'number' && frame.panelCount > 0) ? frame.panelCount : 1;
  var stations = (pc && pc.stations) || {};
  var sInst = stations.S_install || {};
  var ip = (pc && pc.installPlanning) || {};

  // ─── WIP23 matrix base (per install type, per product type) ──────────────
  var itTable = (sInst.installTimes && sInst.installTimes[installationType]) || {};
  var itEntry = itTable[productType];
  var matrixBase = (itEntry && typeof itEntry.t === 'number' && isFinite(itEntry.t))
    ? itEntry.t : 45; // fallback identical to pre-WIP38 calculateFramePrice
  var panelsMult = (productType === 'bifold_door') ? panels : 1;
  var minutes = matrixBase * panelsMult;

  // ─── S_install ops: sealTrim + cleanup (universal add-ons) ───────────────
  var ops = sInst.ops || {};
  var sealTrim = (ops.sealTrim && typeof ops.sealTrim.t === 'number') ? ops.sealTrim.t : 0;
  var cleanup  = (ops.cleanup  && typeof ops.cleanup.t  === 'number') ? ops.cleanup.t  : 0;
  minutes += sealTrim + cleanup;

  // ─── WIP9 property-type adjustment (additive on top of matrix base) ──────
  // Was the absolute base in autoCalcInstallPlanning pre-WIP38; now an
  // additive layer so the Install Times Matrix UI is also respected.
  var threshold = (typeof ip.sizeThresholdSqm === 'number') ? ip.sizeThresholdSqm : 2.0;
  var areaSqm = ((Number(frame.width) || 0) * (Number(frame.height) || 0)) / 1e6;
  var sizeBucket = (areaSqm < threshold) ? 'under' : 'over';
  var ptype = frame.propertyType || 'brick_veneer';
  var baseTable = ip.baseMinutes || {};
  var baseRow = baseTable[ptype] || baseTable.brick_veneer || { under: 0, over: 0 };
  var propertyTypeAdd = Number(baseRow[sizeBucket]) || 0;
  minutes += propertyTypeAdd;

  // ─── WIP9 floor add-on (additive — captures scaffold/crane/access cost) ──
  var floorTable = ip.floorAddOn || {};
  var floorN = Number(frame.floorLevel) || 0;
  var floorBucket = (typeof floorLevelToBucket === 'function')
    ? floorLevelToBucket(floorN)
    : (floorN <= 0 ? 'ground' : floorN === 1 ? 'first' : floorN === 2 ? 'second' : floorN === 3 ? 'third' : 'above3');
  var floorAdd = Number(floorTable[floorBucket]) || 0;
  minutes += floorAdd;

  var detail = installationType + ' · ' + productType
    + (productType === 'bifold_door' ? (' (' + panels + ' panel × ' + matrixBase + ')') : (' base ' + matrixBase + 'min'))
    + ' + seal ' + sealTrim + ' + clean ' + cleanup
    + (propertyTypeAdd ? (' + ' + ptype + '/' + sizeBucket + ' ' + propertyTypeAdd) : '')
    + (floorAdd ? (' + ' + floorBucket + ' ' + floorAdd) : '');

  return {
    minutes: minutes,
    detail: detail,
    supplyOnly: false,
    parts: {
      matrixBase: matrixBase, panelsMult: panelsMult,
      sealTrim: sealTrim, cleanup: cleanup,
      propertyTypeAdd: propertyTypeAdd, floorAddOn: floorAdd
    }
  };
}
if (typeof window !== 'undefined') window.computeFrameInstallMinutes = computeFrameInstallMinutes;

