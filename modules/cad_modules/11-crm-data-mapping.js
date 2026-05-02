// ═══════════════════════════════════════════════════════════════════════════
// CRM INTEGRATION HELPERS — align CAD data shape with Spartan CRM Supabase schema
// (see SPARTANCAD_CRM_INTEGRATION.md v1.0, 2026-04-18).
//
// These helpers do NOT directly talk to Supabase — the actual sync layer is
// added separately. They just produce the exact shapes the CRM expects so
// the sync is a thin mapping pass, not a transform.
// ═══════════════════════════════════════════════════════════════════════════

// Maps Spartan CAD internal productType → CRM frame_type enum (§5.4 / §7.3).
// CRM uses simplified values; CAD's tilt_turn_window maps to 'casement' because
// it's a swing-opener from the CRM's planning perspective (same install
// profile). Refine if the CRM adds more specific enums later.
function mapProductTypeToCrmFrameType(productType) {
  var m = {
    awning_window:     'awning',
    casement_window:   'casement',
    tilt_turn_window:  'casement',  // swing + tilt, same install profile for CRM
    fixed_window:      'fixed',
    sliding_window:    'sliding',
    french_door:       'door_hinged',
    hinged_door:       'door_hinged',
    bifold_door:       'door_sliding',
    lift_slide_door:   'door_sliding',
    smart_slide_door:  'door_sliding',
    vario_slide_door:  'door_sliding',
    stacker_door:      'door_sliding',
  };
  return m[productType] || 'fixed';
}

// Maps a CAD colour id to a human-readable label for the design_items.profile_colour column.
function mapColourToLabel(id) {
  if (!id || id === 'white_body' || id === 'creme') return 'White';
  return String(id).replace(/_/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}

// Maps a glass spec id to a human-readable label.
function mapGlassSpecToLabel(id) {
  var pc = (window.PRICING_DEFAULTS && PRICING_DEFAULTS.glassCosts) || {};
  var entry = pc[id];
  return (entry && entry.name) || (id ? String(id) : 'DGU 4/20/4 Low-E');
}

// Estimates frame weight in kg from the BOM (§5.4 weight_kg column, used for
// crew-size calculation per CRM §5.5). Industry linear masses for Aluplast
// uPVC profiles with 2mm galvanised steel reinforcement:
//   uPVC profile:   ~1.4 kg/m   (70mm 5-chamber, averaged across frame/sash/mull)
//   Steel insert:   ~0.9 kg/m   (2mm galv flat rebate)
//   IGU glass:      ~25 kg/m²   (4/16/4 DGU), ~30 for TGU or 6.38 laminated
//   Aluminium threshold: ~1.9 kg/m
//   Aluminium guide rail: ~0.6 kg/m
// Values can be overridden via pc.weights.{...} in the future.
function calcFrameWeightKg(priced) {
  if (!priced || !priced.bom) return null;
  var w = 0;
  priced.bom.forEach(function(ln){
    var lenM = (ln.lenMm || 0) / 1000;
    var qty = ln.qty || 1;
    if (ln.category === 'profile') {
      // Threshold / guide rail = aluminium, different mass
      if (ln.keySuffix && (ln.keySuffix.indexOf('threshold') >= 0 || ln.keySuffix.indexOf('guideRail') >= 0)) {
        w += lenM * qty * 1.9;
      } else {
        w += lenM * qty * 1.4;  // uPVC profile
      }
    } else if (ln.category === 'steel') {
      w += lenM * qty * 0.9;
    } else if (ln.category === 'glass') {
      // IGU thickness matters; rough heuristic: 25kg/m² for DGU, 30 for TGU/lam
      var kgPerSqm = 25;
      if (ln.label && (ln.label.indexOf('TGU') >= 0 || ln.label.indexOf('6.38') >= 0 || ln.label.indexOf('laminated') >= 0 || ln.label.indexOf('acoustic') >= 0)) {
        kgPerSqm = 30;
      }
      w += (ln.areaM2 || 0) * kgPerSqm;
    } else if (ln.category === 'hardware') {
      w += qty * 0.6;  // average Siegenia set mass per sash (~0.6kg incl. espag + handle + hinges)
    } else if (ln.category === 'gasket') {
      w += lenM * 0.05;  // EPDM
    }
    // Ancillaries + beads — negligible mass, skip
  });
  return +w.toFixed(1);
}

// Maps a CAD frame + calculated price result to the Supabase `design_items`
// row shape (§2.1). Returns camelCase for in-app state; a thin adapter
// converts to snake_case on write.
function frameToDesignItem(frame, priced, position) {
  var fp = priced || {};
  var prod = fp.production || {};
  var inst = fp.installation || {};
  var mat = fp.materials || {};
  var pd = getProfileDims(frame.productType) || {};
  return {
    id: frame.id || ('DI_' + Date.now() + '_' + (position || 0)),
    position: position || 0,
    room: frame.room || '',
    frameType: mapProductTypeToCrmFrameType(frame.productType),
    widthMm: frame.width,
    heightMm: frame.height,
    depthMm: pd.depth || 70,
    profileSeries: pd.system || 'Aluplast Ideal 4000',
    profileColour: mapColourToLabel(frame.colour),
    profileColourInt: mapColourToLabel(frame.colourInt),
    glassSpec: mapGlassSpecToLabel(frame.glassSpec),
    hardwareSpec: (frame.hardwareColour || 'white') + ' Siegenia set',
    revealType: frame.revealType || null,
    flashing: !!frame.flashing,
    weightKg: calcFrameWeightKg(priced),
    floorLevel: typeof frame.floorLevel === 'number' ? frame.floorLevel : 0,
    accessMethod: frame.accessMethod || null,
    surroundType: frame.surroundType || null,
    siteHazards: frame.siteHazards || null,
    propertyType:  frame.propertyType || null,
    installationType: frame.installationType || (frame.supplyOnly ? 'supply_only' : null),  // WIP26 bug fix: was missing from save shape, causing data loss on reload
    // WIP27: Special-order colour flag for CRM alerts. Computed at save-time
    // so the CRM picks it up on every round-trip — no need to store separately.
    isSpecialColour: (function(){ var c = isStandardColourCombo(frame.colour, frame.colourInt); return !c.standard; })(),
    specialColourReason: (function(){ var c = isStandardColourCombo(frame.colour, frame.colourInt); return c.standard ? null : c.reason; })(),
    materialCost:      mat.totalMaterial || 0,
    labourProdHours:   +((prod.factoryMinutes || 0) / 60).toFixed(2),
    labourInstallHours:+((inst.minutes || 0) / 60).toFixed(2),
    // salePrice filled in by caller (needs the selected price list)
    salePrice: null,
    // Check-measure overrides (populated later in CM mode)
    cmWidthMm:  frame.cmWidthMm || null,
    cmHeightMm: frame.cmHeightMm || null,
    cmNotes:    frame.cmNotes || null,
    cmConfirmed:!!frame.cmConfirmed,
  };
}

// Builds the denormalised `cad_data` JSONB payload (§4.4 shape) that gets
// written to the parent entity row (leads/deals/jobs). Called whenever the
// project state changes.
function buildCadDataCache(designId, projectItems, appSettings, selectedPriceListId) {
  var pc = appSettings && appSettings.pricingConfig;
  var items = [];
  var totalPrice = 0, totalMaterial = 0, totalLabour = 0;
  var prodHours = 0, installHours = 0, totalCost = 0;
  (projectItems || []).forEach(function(f, i){
    try {
      var fp = calculateFramePrice(f, pc);
      var di = frameToDesignItem(f, fp, i + 1);
      var priceListId = selectedPriceListId || 'trade';
      di.salePrice = (fp.priceLists && fp.priceLists[priceListId]) || fp.fullCost || 0;
      items.push(di);
      totalPrice    += di.salePrice;
      totalMaterial += (fp.materials && fp.materials.totalMaterial) || 0;
      totalLabour   += (fp.production && fp.production.factoryLabour) || 0;
      totalLabour   += (fp.installation && fp.installation.costMarked) || 0;
      totalCost     += fp.fullCost || fp.costPrice || 0;
      prodHours     += (fp.production && fp.production.factoryMinutes) ? fp.production.factoryMinutes / 60 : 0;
      installHours  += (fp.installation && fp.installation.minutes) ? fp.installation.minutes / 60 : 0;
    } catch(e) { /* skip broken frames */ }
  });
  var grossMarginPct = (totalPrice > 0) ? +((100 * (totalPrice - totalCost) / totalPrice)).toFixed(2) : 0;
  return {
    designId: designId || null,
    projectItems: items,
    itemCount: items.length,
    totalPrice: +totalPrice.toFixed(2),
    totalMaterialCost: +totalMaterial.toFixed(2),
    totalLabourCost: +totalLabour.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    grossMarginPct: grossMarginPct,
    estimatedProductionHours: +prodHours.toFixed(2),
    estimatedInstallHours: +installHours.toFixed(2),
    status: 'draft',  // caller overrides when design is finalised/signed
    stage: 'design',
    updatedAt: new Date().toISOString(),
  };
}

// v2.0: readCrmHandoffParams + notifyCrmOpener deleted in M2. URL-param
// handoff and cross-window opener postMessage are both retired — CAD is
// iframe-embedded now and uses the spartan-cad-* protocol via handleCrmMessage
// and postToCrm below.

// Expose for debugging / future sync layer.
if (typeof window !== 'undefined') {
  window.mapProductTypeToCrmFrameType = mapProductTypeToCrmFrameType;
  window.frameToDesignItem = frameToDesignItem;
  window.buildCadDataCache = buildCadDataCache;
  window.calcFrameWeightKg = calcFrameWeightKg;
}

