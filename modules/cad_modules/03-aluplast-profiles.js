// ═══════════════════════════════════════════════════════════════════════════
// ALUPLAST PROFILE DIMENSIONS — Verified from Aluplast Ideal 4000 catalog
// PDF: eurotechwindows.net.au/Aluplast-Ideal-4000.pdf
// ═══════════════════════════════════════════════════════════════════════════
//
// Ideal 4000 Tilt & Turn system:
//   Frame 140007:  depth 70mm, sightline 65mm, 5-chamber
//   Z77 Sash 140020: width 77mm, visible 57mm (tilt-turn, fixed)
//   T Sash (casement): width 75.5mm (outward-opening awning & casement)
//   Z97 Sash 140028: width 97mm, visible 77mm (larger glazing)
//   T105/Z105 Sash 140030/31: width 105mm, visible 85mm (doors)
//   Mullion/Transom 140041: width 84mm
//   False Mullion 140066: width 64mm
//   Sash overlap on frame rebate: 12mm
//   Sash step proud of frame: 5mm
//   Glazing rebate: 24mm standard, up to 42mm
//   Steel reinforcement: 1.5mm or 2.0mm galvanised
//   Weld allowance (V-weld): 5mm per corner
//
// Ideal 4000 Casement system (AU market):
//   Frame: 75mm sightline option (standard for Australian awning/casement)
//   T Sash: 75.5mm (outward-opening, T-shaped cross section)
//   Mullion: 70mm or 80mm options
//
// HST 85 Lift & Slide system:
//   Frame: depth 85mm
//   Sash: heavy-duty, max 400kg
//   Max glazing: 51mm
//   Max dimensions: 6500x2800mm (scheme A: 3500x2500mm)
//   Threshold options: Basic (48mm), Standard, Premium
//
// Profile dimension lookup per product type:

const PROFILE_DIMS = {
  // Ideal 4000 Tilt & Turn: Z77 sash, 65mm frame sightline
  // Small face inside (15mm), large face outside (50mm), glazed internally
  tilt_turn_window:  { frameW: 65, sashW: 77, depth: 70, mullionW: 84, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Ideal 4000 T&T', intFace: 15, extFace: 50, rebateSide: 'int' },
  // Fixed window: same frame as T&T, small face inside, glazed internally
  fixed_window:      { frameW: 65, sashW: 0, depth: 70, mullionW: 84, falseMullionW: 64, sashOverlap: 0, sashStep: 0, glazingRebate: 24, system: 'Ideal 4000 T&T', intFace: 15, extFace: 50, rebateSide: 'int' },

  // Ideal 4000 Casement: 75.5mm T sash, 75mm frame sightline (AU)
  // Large face inside (50mm), small face outside (25mm), glazed externally
  awning_window:     { frameW: 75, sashW: 75.5, depth: 70, mullionW: 80, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Ideal 4000 Casement', intFace: 50, extFace: 25, rebateSide: 'ext' },
  casement_window:   { frameW: 75, sashW: 75.5, depth: 70, mullionW: 80, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Ideal 4000 Casement', intFace: 50, extFace: 25, rebateSide: 'ext' },
  // Sliding window — uses Vario-Slide platform same as vario_slide_door.
  // 3-track default (frame depth 123mm, face 50mm). Window sash is 72mm wide.
  sliding_window:    { frameW: 50, sashW: 72, depth: 123, mullionW: 20, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Vario-Slide 3T', intFace: 15, extFace: 50, rebateSide: 'int' },

  // Ideal 4000 Doors: T105 sash 105mm, 65mm frame
  french_door:       { frameW: 65, sashW: 105, depth: 70, mullionW: 84, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Ideal 4000 Door', intFace: 15, extFace: 50, rebateSide: 'int' },
  hinged_door:       { frameW: 65, sashW: 105, depth: 70, mullionW: 84, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Ideal 4000 Door', intFace: 15, extFace: 50, rebateSide: 'int' },
  bifold_door:       { frameW: 65, sashW: 105, depth: 70, mullionW: 84, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Ideal 4000 Door', intFace: 15, extFace: 50, rebateSide: 'int' },

  // HST 85 Lift & Slide
  lift_slide_door:   { frameW: 85, sashW: 105, depth: 85, mullionW: 84, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'HST 85', intFace: 15, extFace: 65, rebateSide: 'int' },

  // Vario-Slide / Smart-Slide / Stacker (Ideal 4000 sliding platform)
  smart_slide_door:  { frameW: 70, sashW: 85, depth: 70, mullionW: 84, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Smart-Slide 70', intFace: 15, extFace: 50, rebateSide: 'int' },
  // Vario-Slide / Stacker (Aluplast Vario-Slide platform). Frame: 3-track
  // default — 10x084, 123mm deep × 50mm visible face. 2-track (10x087) is
  // 70mm deep × 50mm face, selected via frame.tracks=2. Door sash 10x386 is
  // 90mm wide (heavier than the 72mm window sash).
  vario_slide_door:  { frameW: 50, sashW: 90, depth: 123, mullionW: 20, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Vario-Slide 3T', intFace: 15, extFace: 50, rebateSide: 'int' },
  stacker_door:      { frameW: 50, sashW: 90, depth: 123, mullionW: 20, falseMullionW: 64, sashOverlap: 12, sashStep: 5, glazingRebate: 24, system: 'Vario-Slide 3T', intFace: 15, extFace: 50, rebateSide: 'int' },

};

function getProfileDims(productType) {
  return PROFILE_DIMS[productType] || PROFILE_DIMS.tilt_turn_window;
}

// ─── getResolvedProfileDims ─────────────────────────────────────────────────
// Bridge between the hardcoded PROFILE_DIMS table and the user-managed
// Profile Manager catalog. Returns PROFILE_DIMS for the productType with
// frameW/sashW/mullionW overridden by the catalog sightline of the resolved
// (linked or per-frame-overridden) profile.
//
// Lookup order for each role (frame / sash / mullion):
//   1. profileOverrides[role]                       — per-frame editor override
//   2. pricingConfig.profileLinks[productType][role] — Settings → Products →
//                                                     Profiles "Linked Products"
//   3. profileKeysForType(productType)[role]         — canonical system default
//
// If the resolved profile has sightlineMm (or bboxMm.w) in the catalog
// (pricingConfig.profiles or PRICING_DEFAULTS.profiles), that wins. Else the
// PROFILE_DIMS value is kept — that's the legacy fallback for product types
// whose "real" profile catalog entry hasn't been imported yet.
//
// Callers that don't have a pricingConfig handy can pass null/undefined and
// will get the same hardcoded result as the legacy getProfileDims(productType).
function getResolvedProfileDims(productType, pricingConfig, profileOverrides) {
  var base = getProfileDims(productType);
  if (!pricingConfig) return base;
  var pd = Object.assign({}, base);
  var pc = pricingConfig;
  var po = profileOverrides || {};
  var links = (pc.profileLinks && pc.profileLinks[productType]) || {};
  var sysDefault = (typeof profileKeysForType === 'function')
    ? profileKeysForType(productType) : { frame:null, sash:null, mullion:null };
  function resolveKey(role) {
    if (po[role]) return po[role];
    if (links[role]) return links[role];
    return sysDefault[role];
  }
  function catalogSightline(profileKey) {
    if (!profileKey) return null;
    var catalog = (pc.profiles) || (typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.profiles) || {};
    var entry = catalog[profileKey];
    if (!entry) return null;
    if (typeof entry.sightlineMm === 'number') return entry.sightlineMm;
    if (entry.bboxMm && typeof entry.bboxMm.w === 'number') return entry.bboxMm.w;
    return null;
  }
  var sFrame   = catalogSightline(resolveKey('frame'));
  var sSash    = catalogSightline(resolveKey('sash'));
  var sMullion = catalogSightline(resolveKey('mullion'));
  if (sFrame   != null) pd.frameW   = sFrame;
  if (sSash    != null) pd.sashW    = sSash;
  if (sMullion != null) pd.mullionW = sMullion;
  return pd;
}

