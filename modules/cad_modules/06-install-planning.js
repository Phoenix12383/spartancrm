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

