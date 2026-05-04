// ════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 04-cad-bom-extractor.js
// BOM (Bill of Materials) engine for factory orders.
//
// Triggered automatically when a factory order advances past 'Received' to
// 'BOM Generated' status (see advanceFactoryOrder in 16-factory-crm.js).
// Reads the linked job's CAD data (cadFinalData||cadSurveyData||cadData),
// walks projectItems, and emits aggregate counts/lengths for:
//
//   profile    — outer frame, sash, glazing-bead linear meters per system
//   steel      — frame/sash reinforcement bars (productType lookup)
//   glass      — pane spec + dimensions + qty, grouped
//   gasket     — EPDM wedge gasket linear meters (outer + inner seal)
//   hardware   — kit components per HARDWARE_KITS_CRM, multiplied by sash count
//
// SOURCE OF TRUTH NOTE: this is a CRM-side aggregator. It uses the same
// HARDWARE_KITS catalog Spartan CAD ships with (replicated below) and
// perimeter-based linear-meter math. The authoritative cutlist with FFD
// bar-pack optimisation lives in cad_modules/22-trim-cutlist.js +
// 22a-profile-cutlist.js inside the CAD iframe — once the CAD bridge ships
// M3 the save payload can include the optimised cutlist directly and we
// switch this to consume it. Until then, treat profile lengths here as
// nominal-required (no offcut waste factor applied).
// ════════════════════════════════════════════════════════════════════════════

// ── Hardware kits — replica of cad_modules/06a-hardware-glass-kits.js ────────
var HARDWARE_KITS_CRM = {
  awning_window: {
    label: 'Awning window kit',
    notes: 'Top-hung sash, side-friction stays, single handle.',
    components: [
      { name: 'Friction stay (pair)',          code: 'TS-300',        supplier: 'Truth/Whitco',  qty: 1, per: 'perSash', description: 'Stainless side-mount stays, sized to sash height' },
      { name: 'Cockspur handle',               code: 'CSH-W',         supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Handle + keeper plate' },
      { name: 'Restrictor (child safety)',     code: 'RS-1',          supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Optional — fit if Mode 2 child-safe' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'EPDM perimeter gasket' },
    ],
  },
  casement_window: {
    label: 'Casement window kit',
    notes: 'Side-hung sash, friction stays, espagnolette lock.',
    components: [
      { name: 'Friction stay (pair)',          code: 'TS-400',        supplier: 'Truth/Whitco',  qty: 1, per: 'perSash', description: 'Heavy-duty stays for side-hung' },
      { name: 'Espag lock + handle',           code: 'ESP-W',         supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Single-point espag, key-locking option' },
      { name: 'Strike plate',                  code: 'SP-1',          supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Frame-side strike' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'EPDM perimeter gasket' },
    ],
  },
  tilt_turn_window: {
    label: 'Tilt & Turn window kit',
    notes: 'Siegenia DIN 18267 gear set — verify backplate / pitch against actual gear family.',
    components: [
      { name: 'TBT handle + spindle',          code: 'SI-TBT-H',      supplier: 'Siegenia',      qty: 1, per: 'perSash', description: '7mm spindle, white/silver/anthracite' },
      { name: 'Gearbox (handle stile)',        code: 'SI-GBX-S',      supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Centre lock unit, height-adjustable' },
      { name: 'Top corner drive',              code: 'SI-TCD',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Connects handle stile to head transmission' },
      { name: 'Bottom corner drive',           code: 'SI-BCD',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Connects handle stile to sill transmission' },
      { name: 'Top hinge (head)',              code: 'SI-TH',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Tilt hinge at sash head' },
      { name: 'Bottom corner hinge',           code: 'SI-BCH',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Turn hinge at hinge stile / sill corner' },
      { name: 'Striker plate set (4)',         code: 'SI-STR-4',      supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Frame-side strikers — 4 typical for 1.2m sash' },
      { name: 'Restrictor (limiter)',          code: 'SI-RS',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Optional — opening limiter' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'EPDM perimeter gasket' },
    ],
  },
  fixed_window: {
    label: 'Fixed window kit',
    notes: 'No moving hardware — gasket and glazing-bead clips only.',
    components: [
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
      { name: 'Glazing packers (set)',         code: 'GP-SET',        supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'Bridge / location packers for DGU' },
    ],
  },
  sliding_window: {
    label: 'Sliding window kit',
    notes: '2-track or 3-track horizontal sliding sash.',
    components: [
      { name: 'Bottom roller (pair)',          code: 'SW-BR',         supplier: 'Yale/Whitco',   qty: 1, per: 'perSash', description: 'Wheel carriage, height-adjustable' },
      { name: 'Top guide',                     code: 'SW-TG',         supplier: 'Yale/Whitco',   qty: 1, per: 'perSash', description: 'Top channel guide' },
      { name: 'Sliding sash lock',             code: 'SW-LOCK',       supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Snib + keeper' },
      { name: 'Pull handle',                   code: 'SW-PH',         supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Recessed or surface-mount' },
      { name: 'Anti-lift block',               code: 'SW-ALB',        supplier: 'Whitco',        qty: 2, per: 'perSash', description: 'Prevents sash being lifted from outside' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  french_door: {
    label: 'French door kit',
    notes: 'Active + passive leaf, multipoint lock on active, shoot bolts on passive.',
    components: [
      { name: 'Multipoint lock body',          code: 'MP-3PT',        supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: 'Active leaf — 3-point or 5-point' },
      { name: 'Lever handle pair',             code: 'LVR-PR',        supplier: 'Hoppe',         qty: 1, per: 'perFrame', description: 'Internal + external on active leaf' },
      { name: 'Shoot bolt set (top + btm)',    code: 'SHB-SET',       supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: 'Passive leaf flush bolts' },
      { name: 'Door hinge (3-knuckle)',        code: 'DH-3K',         supplier: 'Roto/Maco',     qty: 3, per: 'perSash', description: '3 hinges per leaf for 2.1m doors' },
      { name: 'Strike plate set',              code: 'SP-FR',         supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: 'Lock + shoot-bolt strikes' },
      { name: 'Threshold connector pair',      code: '446071',        supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'L+R end caps for alu threshold' },
      { name: 'Cylinder (euro)',               code: 'CYL-EU',        supplier: 'Lockwood',      qty: 1, per: 'perFrame', description: 'Keyed both sides' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  hinged_door: {
    label: 'Hinged door kit',
    notes: 'Single leaf, multipoint lock, lever set, 3 hinges.',
    components: [
      { name: 'Multipoint lock body',          code: 'MP-3PT',        supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: '3-point or 5-point' },
      { name: 'Lever handle pair',             code: 'LVR-PR',        supplier: 'Hoppe',         qty: 1, per: 'perFrame', description: 'Internal + external' },
      { name: 'Door hinge (3-knuckle)',        code: 'DH-3K',         supplier: 'Roto/Maco',     qty: 3, per: 'perFrame', description: '3 hinges per leaf' },
      { name: 'Strike plate',                  code: 'SP-HD',         supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: 'Lock keeper' },
      { name: 'Threshold connector pair',      code: '446071',        supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'L+R end caps for alu threshold' },
      { name: 'Cylinder (euro)',               code: 'CYL-EU',        supplier: 'Lockwood',      qty: 1, per: 'perFrame', description: 'Keyed both sides' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  bifold_door: {
    label: 'Bifold door kit',
    notes: 'Top-hung folding sash track + carriers per leaf.',
    components: [
      { name: 'Top track + bottom guide',      code: 'BF-TRACK',      supplier: 'SunFold',       qty: 1, per: 'perFrame', description: 'Cut to opening width' },
      { name: 'Carrier wheel (pair per leaf)', code: 'BF-CW',         supplier: 'SunFold',       qty: 1, per: 'perSash', description: 'Top + bottom rollers per leaf' },
      { name: 'Hinge set (sash-to-sash)',      code: 'BF-HINGE',      supplier: 'SunFold',       qty: 2, per: 'perSash', description: '2 inter-leaf hinges per leaf' },
      { name: 'Multipoint lock (master leaf)', code: 'BF-MP',         supplier: 'SunFold',       qty: 1, per: 'perFrame', description: 'On the locking-master leaf' },
      { name: 'Lever handle pair (master)',    code: 'BF-LVR',        supplier: 'Hoppe',         qty: 1, per: 'perFrame', description: 'Master leaf only' },
      { name: 'Shoot bolt (slave leaves)',     code: 'BF-SHB',        supplier: 'SunFold',       qty: 1, per: 'perSash', description: 'Each non-master leaf' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  lift_slide_door: {
    label: 'Lift & Slide (HST85) kit',
    notes: 'Siegenia HS-Portal gear — heavy lift mechanism, large opening sashes.',
    components: [
      { name: 'HS-Portal gearbox',             code: 'SI-HSP',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Lift mechanism + lock' },
      { name: 'HS handle (large)',             code: 'SI-HSH',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Lift-slide handle, 200mm' },
      { name: 'Trolley carriage (pair)',       code: 'SI-HST',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Twin-roller heavy carriage' },
      { name: 'Track (alu, cut to size)',      code: 'SI-TRK',        supplier: 'Siegenia',      qty: 1, per: 'perFrame', description: 'Bottom rolling track' },
      { name: 'Top guide rail',                code: 'SI-TGR',        supplier: 'Siegenia',      qty: 1, per: 'perFrame', description: 'Top guide' },
      { name: 'End cap pair',                  code: 'SI-EC',         supplier: 'Siegenia',      qty: 1, per: 'perFrame', description: 'Track end caps L+R' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  smart_slide_door: {
    label: 'Smart-Slide door kit',
    notes: 'Light-medium sliding system with PSK option.',
    components: [
      { name: 'Sliding handle + lock',         code: 'SS-HL',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Surface-mount lever, key option' },
      { name: 'Bottom roller carriage',        code: 'SS-RC',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Adjustable carriage' },
      { name: 'Top guide',                     code: 'SS-TG',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Top channel guide' },
      { name: 'Track (alu)',                   code: 'SS-TRK',        supplier: 'Siegenia',      qty: 1, per: 'perFrame', description: 'Cut to opening width' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  vario_slide_door: {
    label: 'Vario-Slide door kit',
    notes: '3-track configurable sliding panel system.',
    components: [
      { name: 'Vario handle set',              code: 'VS-H',          supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Recessed pull + lock' },
      { name: 'Roller carriage',               code: 'VS-RC',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Per moving panel' },
      { name: 'Top guide',                     code: 'VS-TG',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Top guide block per panel' },
      { name: 'Track (3-channel alu)',         code: 'VS-TRK3',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'Cut to opening width' },
      { name: 'Interlock seal',                code: 'VS-IL',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Brush + fin seal between panels' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  stacker_door: {
    label: 'Stacker door kit',
    notes: 'Stacking sliding panels — same gear as Vario-Slide with additional carriages.',
    components: [
      { name: 'Stacker handle set',            code: 'ST-H',          supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Recessed pull + lock' },
      { name: 'Roller carriage',               code: 'ST-RC',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Per stacking panel' },
      { name: 'Top guide',                     code: 'ST-TG',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Per panel' },
      { name: 'Track (3-channel alu)',         code: 'ST-TRK3',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'Cut to opening width' },
      { name: 'Interlock seal',                code: 'ST-IL',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Brush + fin seal' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
};

// ── Steel reinforcement rules ────────────────────────────────────────────────
// Productype-driven approximation of jamb / sash steel insert requirements
// in linear meters per frame. Numbers follow Aluplast's recommended steel
// reinforcement table for typical Australian residential frame sizes; for
// non-residential / oversized frames the CAD pricing engine produces the
// authoritative cutlist (see SOURCE OF TRUTH NOTE in the file header).
var STEEL_REINFORCEMENT_RULES = {
  french_door:    { name: 'Frame steel reinforcement', code: 'STL-FR', perFrameLm: 6.4, notes: '2x vertical jamb + 1x head' },
  hinged_door:    { name: 'Frame steel reinforcement', code: 'STL-HD', perFrameLm: 4.2, notes: '2x vertical jamb' },
  sliding_window: { name: 'Sash steel rail',           code: 'STL-SW', perFrameLm: 2.4, notes: 'Sash interlock steel' },
  sliding_door:   { name: 'Sash steel rail',           code: 'STL-SD', perFrameLm: 4.8, notes: 'Sash interlock + frame' },
  bifold_door:    { name: 'Bifold reinforcement',      code: 'STL-BF', perFrameLm: 6.0, notes: 'Per-leaf steel insert' },
  // Other product types: no steel reinforcement required at this size class.
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function _bomSashCount(frame) {
  if (typeof frame.panelCount === 'number' && frame.panelCount > 0) return frame.panelCount;
  switch (frame.productType) {
    case 'fixed_window':       return 0;
    case 'awning_window':
    case 'casement_window':
    case 'tilt_turn_window':
    case 'hinged_door':        return 1;
    case 'french_door':
    case 'sliding_window':
    case 'sliding_door':       return 2;
    case 'bifold_door':        return 3;
    default:                   return 1;
  }
}

function _bomPerimMm(frame) {
  var w = Number(frame.widthMm || frame.width || 0);
  var h = Number(frame.heightMm || frame.height || 0);
  return 2 * (w + h);
}

// ── Engine ───────────────────────────────────────────────────────────────────
function computeBomFromProjectItems(projectItems, opts) {
  opts = opts || {};
  var bom = {
    generatedAt: new Date().toISOString(),
    sourceJobId: opts.sourceJobId || null,
    profile: [], steel: [], glass: [], gasket: [], hardware: [],
    totals: {},
  };
  var profileAcc = {}, steelAcc = {}, glassAcc = {}, gasketAcc = {}, hardwareAcc = {};

  (projectItems || []).forEach(function(frame) {
    var pt      = frame.productType || 'unknown';
    var system  = frame.profileSystem || 'Aluplast Ideal 4000';
    var sashes  = _bomSashCount(frame);
    var perim   = _bomPerimMm(frame);
    var w       = Number(frame.widthMm || frame.width || 0);
    var h       = Number(frame.heightMm || frame.height || 0);
    var glassSpec = frame.glassSpec || 'Unspecified glass';

    // Profile — outer frame perimeter
    var pkO = 'outer_frame|' + system;
    profileAcc[pkO] = profileAcc[pkO] || { type: 'outer_frame', system: system, lengthMm: 0, frames: 0 };
    profileAcc[pkO].lengthMm += perim;
    profileAcc[pkO].frames   += 1;

    // Profile — sash members (skip fixed)
    if (sashes > 0) {
      var pkS = 'sash|' + system;
      profileAcc[pkS] = profileAcc[pkS] || { type: 'sash', system: system, lengthMm: 0, frames: 0 };
      // Horizontal-divide products (sliding/bifold): each sash is 1/N of the
      // frame width × full height. Other products have a single sash inside
      // a fixed frame and the sash is approximately the frame perim.
      var sashPerim = (pt === 'sliding_window' || pt === 'sliding_door' || pt === 'bifold_door' || pt === 'french_door')
        ? 2 * ((w / sashes) + h)
        : 2 * (w + h);
      profileAcc[pkS].lengthMm += sashPerim * sashes;
      profileAcc[pkS].frames   += 1;
    }

    // Profile — glazing bead (perimeter of each glazed opening)
    var pkB = 'glazing_bead|' + system;
    profileAcc[pkB] = profileAcc[pkB] || { type: 'glazing_bead', system: system, lengthMm: 0, frames: 0 };
    profileAcc[pkB].lengthMm += perim;
    profileAcc[pkB].frames   += 1;

    // Steel reinforcement
    var sr = STEEL_REINFORCEMENT_RULES[pt];
    if (sr) {
      steelAcc[sr.code] = steelAcc[sr.code] || { name: sr.name, code: sr.code, lengthMm: 0, applies: pt, notes: sr.notes };
      steelAcc[sr.code].lengthMm += sr.perFrameLm * 1000;
    }

    // Glass — pane size approximation (subtract a typical 80mm of profile each side)
    var paneCount = sashes > 0 ? sashes : 1;
    var paneW = Math.max(0, w - 80);
    var paneH = Math.max(0, h - 80);
    if (sashes > 1 && (pt === 'sliding_window' || pt === 'sliding_door' || pt === 'bifold_door' || pt === 'french_door')) {
      paneW = Math.max(0, Math.round(w / sashes) - 60);
    }
    var gk = glassSpec + '|' + paneW + 'x' + paneH;
    glassAcc[gk] = glassAcc[gk] || { spec: glassSpec, widthMm: paneW, heightMm: paneH, qty: 0 };
    glassAcc[gk].qty += paneCount;

    // Gasket — outer (frame) + inner (per-sash)
    var gskCode = 'WG-EPDM';
    gasketAcc[gskCode] = gasketAcc[gskCode] || { name: 'EPDM wedge gasket', code: gskCode, lengthMm: 0, role: 'outer + inner seal' };
    gasketAcc[gskCode].lengthMm += perim;
    if (sashes > 0) gasketAcc[gskCode].lengthMm += perim * sashes;

    // Hardware — kit lookup, qty multiplied by sash count for 'perSash'
    var kit = HARDWARE_KITS_CRM[pt];
    if (kit && Array.isArray(kit.components)) {
      kit.components.forEach(function(comp) {
        var multiplier = comp.per === 'perSash' ? Math.max(sashes, 1) : 1;
        var key = comp.code + '|' + comp.name;
        hardwareAcc[key] = hardwareAcc[key] || {
          name: comp.name, code: comp.code, supplier: comp.supplier,
          description: comp.description || '', qty: 0,
        };
        hardwareAcc[key].qty += comp.qty * multiplier;
      });
    }
  });

  bom.profile  = Object.keys(profileAcc).map(function(k){return profileAcc[k];});
  bom.steel    = Object.keys(steelAcc).map(function(k){return steelAcc[k];});
  bom.glass    = Object.keys(glassAcc).map(function(k){return glassAcc[k];});
  bom.gasket   = Object.keys(gasketAcc).map(function(k){return gasketAcc[k];});
  bom.hardware = Object.keys(hardwareAcc).map(function(k){return hardwareAcc[k];});

  bom.totals = {
    profileLm:     +(bom.profile.reduce(function(s,p){return s+p.lengthMm;},0) / 1000).toFixed(2),
    steelLm:       +(bom.steel.reduce(function(s,p){return s+p.lengthMm;},0)   / 1000).toFixed(2),
    glassPanes:    bom.glass.reduce(function(s,g){return s+g.qty;},0),
    gasketLm:      +(bom.gasket.reduce(function(s,g){return s+g.lengthMm;},0)  / 1000).toFixed(2),
    hardwareLines: bom.hardware.length,
    hardwareUnits: bom.hardware.reduce(function(s,h){return s+h.qty;},0),
    frameCount:    (projectItems || []).length,
  };

  return bom;
}

// Find the linked job's CAD data and run the engine. Returns null if the
// order doesn't exist, has no CRM job, or the job has no CAD data.
function generateBomForOrder(orderId) {
  if (typeof getFactoryOrders !== 'function') return null;
  var order = getFactoryOrders().find(function(o){return o.id === orderId;});
  if (!order) return null;

  var st = (typeof getState === 'function') ? getState() : { jobs: [] };
  var crmJob = (st.jobs || []).find(function(j) {
    return j.factoryOrderId === orderId || j.id === order.crmJobId;
  });
  if (!crmJob) return null;

  var cadData = crmJob.cadFinalData || crmJob.cadSurveyData || crmJob.cadData;
  if (!cadData || !Array.isArray(cadData.projectItems) || cadData.projectItems.length === 0) return null;

  return computeBomFromProjectItems(cadData.projectItems, { sourceJobId: crmJob.id });
}

// Persist a BOM onto a factory order. Mirrors the in-memory + Supabase
// pattern used elsewhere in 16-factory-crm.js.
function setOrderBom(orderId, bom) {
  if (typeof getFactoryOrders !== 'function' || typeof saveFactoryOrders !== 'function') return false;
  var orders = getFactoryOrders().map(function(o){
    return o.id === orderId ? Object.assign({}, o, { bom: bom }) : o;
  });
  saveFactoryOrders(orders);
  return true;
}

// Expose for inline-onclick handlers in the BOM page.
window.computeBomFromProjectItems = computeBomFromProjectItems;
window.generateBomForOrder        = generateBomForOrder;
window.setOrderBom                = setOrderBom;
window.HARDWARE_KITS_CRM          = HARDWARE_KITS_CRM;
window.STEEL_REINFORCEMENT_RULES  = STEEL_REINFORCEMENT_RULES;
