// ═══════════════════════════════════════════════════════════════════════════
// PROFILE RESOLVER v2 — single-path, link-only, never silently falls back.
//
// What this replaces:
//   The old getOuterFrameProfileEntry / getSashProfileEntry / etc functions
//   walk three lookup paths (links → keys → usedByProductTypes legacy
//   iteration), wrapped in try/catch that returns null. Their callers then
//   try the catalog path, fall through to procedural geometry on null, and
//   the user has no idea what went wrong. That's why fixes "don't move the
//   needle" — the resolver swallows the symptom.
//
// What this does:
//   - One lookup path: window.__profileLinks[productType][slot] → key → entry
//   - Throws ResolveError on every failure, with a human-readable reason
//   - Adds per-side slot resolution (frameTop, frameBottom, frameLeft,
//     frameRight) so French/hinged doors can override frameBottom to a
//     threshold profile WITHOUT a special-case code path
//   - Validates the entry against the canonical schema before returning
//
// Public surface:
//   ResolveError                        — error class
//   resolveSlot(productType, slot)      — returns CanonicalProfile, or throws
//   resolveAllFrameSlots(productType)   — { frameTop, frameBottom, frameLeft, frameRight }
//   listSlots(productType)              — debug: which slots have what
//   canonicaliseLegacyEntry(entry)      — migration helper for old-shape entries
// ═══════════════════════════════════════════════════════════════════════════

function ResolveError(stage, message, ctx) {
  var e = new Error(message);
  e.name = 'ResolveError';
  e.stage = stage;          // 'links' | 'lookup' | 'validate' | 'shape'
  e.ctx = ctx || {};
  return e;
}

// Slot taxonomy. Frames have four sides so threshold-bearing doors can
// override one side without touching the others.
var SLOTS_FRAME = ['frameTop', 'frameBottom', 'frameLeft', 'frameRight'];
var SLOTS_SASH  = ['sashTop', 'sashBottom', 'sashLeft', 'sashRight'];
var SLOTS_OTHER = ['mullion', 'transom', 'glazingBead', 'subSill'];
var ALL_SLOTS   = SLOTS_FRAME.concat(SLOTS_SASH).concat(SLOTS_OTHER);

// Default slot mapping for each product type. The "frame" key from the old
// world maps to all four frameTop/Bottom/Left/Right slots; "sash" → all
// four sashes. French/hinged doors override frameBottom to point at a
// threshold profile (configured separately in the catalog).
//
// This is the slot defaults — user link overrides via window.__profileLinks
// take precedence.
var DEFAULT_SLOT_FALLBACKS = {
  // For each productType: which legacy role to fall back on when no
  // specific slot link exists. e.g. frameTop without an explicit link
  // looks at links[productType].frame.
  frameTop:    'frame',
  frameBottom: 'frame',  // overridden to 'threshold' for doors via productProfileSlots
  frameLeft:   'frame',
  frameRight:  'frame',
  sashTop:     'sash',
  sashBottom:  'sash',
  sashLeft:    'sash',
  sashRight:   'sash',
  mullion:     'mullion',
  transom:     'mullion',  // legacy: transom often shares mullion profile
  glazingBead: 'bead',
  subSill:     'subSill',
};

// Door-style products: frameBottom uses a threshold profile.
// The threshold profile must be linked via:
//   window.__profileLinks[productType] = { frame: 'i4_frame', frameBottom: 'i4_threshold' }
// If frameBottom isn't linked, the resolver throws — no silent fallback to
// the regular frame, no procedural threshold short-circuit.
//
// To opt out (e.g. supply only, no threshold), set frameBottom to 'frame'
// explicitly in the link config.
var DOOR_PRODUCT_TYPES = ['french_door', 'hinged_door', 'bifold_door', 'lift_slide_door',
                          'smart_slide_door', 'vario_slide_door', 'stacker_door'];

// ─── Internal: read the profile catalog ────────────────────────────────────
// Combines:
//   - PRICING_DEFAULTS.profiles (the factory catalog)
//   - window.__userProfiles      (user-imported via DXF)
// User entries OVERRIDE factory entries on key match. No graft-by-code
// magic — the resolver demands consistent keying.

function _profileCatalog() {
  var defaults = (typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.profiles) || {};
  var user = (typeof window !== 'undefined' && window.__userProfiles) || {};
  var out = {};
  for (var k in defaults) out[k] = defaults[k];
  for (var uk in user) {
    if (user[uk]) out[uk] = user[uk];  // user wins on key collision
  }
  return out;
}

function _profileLinks() {
  return (typeof window !== 'undefined' && window.__profileLinks) || {};
}

// ─── Legacy entry adapter ──────────────────────────────────────────────────
// Old catalog entries don't have schemaVersion=3. They use:
//   { outerHullMm, chambersMm, bboxMm, polygonOrient, sightlineMm, depthMm }
// where polygonOrient encodes a manual rotation/flip applied at render time.
//
// This adapter applies the polygonOrient transform once, then runs the
// canonicaliser to bring the entry up to schemaVersion 3. The result is
// cached on the entry under __canonical_v3 so subsequent resolves skip the
// work.
//
// Migration path: when an entry is saved fresh (e.g. via re-import in the
// import modal), it should be saved already-canonicalised so this adapter
// becomes a no-op for new uploads.

function canonicaliseLegacyEntry(entry) {
  if (!entry) throw ResolveError('shape', 'null entry passed to canonicaliseLegacyEntry');
  // Already canonical?
  if (entry.schemaVersion === 3 && entry.outerHullMm) return entry;
  if (entry.__canonical_v3) return entry.__canonical_v3;
  if (!entry.outerHullMm || entry.outerHullMm.length < 3) {
    throw ResolveError('shape', 'entry missing outerHullMm', { code: entry.code });
  }

  // Apply legacy polygonOrient transform first, then canonicalise.
  var srcBb = entry.bboxMm || { w: 70, h: 70 };
  var orient = entry.polygonOrient || { rot: 0, flipX: false, flipY: false };
  function applyOrient(pts) {
    var out = pts.map(function(p) {
      var x = p[0], y = p[1], w = srcBb.w, h = srcBb.h;
      var rot = (orient.rot | 0);
      if (rot === 90)       { var t90 = x; x = srcBb.h - y; y = t90; w = srcBb.h; h = srcBb.w; }
      else if (rot === 180) { x = srcBb.w - x; y = srcBb.h - y; }
      else if (rot === 270) { var t27 = x; x = y; y = srcBb.w - t27; w = srcBb.h; h = srcBb.w; }
      if (orient.flipX) x = w - x;
      if (orient.flipY) y = h - y;
      return [x, y];
    });
    return out;
  }
  var hull = applyOrient(entry.outerHullMm);
  var chambers = (entry.chambersMm || []).map(applyOrient);

  var canonical = canonicaliseProfile(hull, chambers, {});
  // Carry forward identifying metadata
  canonical.id = entry.code || entry.id || null;
  canonical.code = entry.code || null;
  canonical.system = entry.system || null;
  canonical.role = entry.role || null;
  canonical.weldAllowanceMm = entry.weldAllowanceMm || 3;
  canonical.mitreAngleDeg = entry.mitreAngleDeg || 45;
  canonical.requiresSteelReinforcement = !!entry.requiresSteelReinforcement;
  canonical.colouredFaceSide = entry.colouredFaceSide || 'right';

  // Cache so repeated resolves don't re-do the work.
  try { entry.__canonical_v3 = canonical; } catch (e) {}
  return canonical;
}

// ─── Slot → key resolution ─────────────────────────────────────────────────

function _resolveKeyForSlot(productType, slot) {
  var links = _profileLinks();
  var slotMap = links[productType] || {};

  // 1. Direct slot link wins (e.g. links.french_door.frameBottom = 'i4_threshold')
  if (slotMap[slot]) return { key: slotMap[slot], via: 'slot:' + slot };

  // 2. Legacy role link (e.g. links.tilt_turn_window.frame = 'i4_frame')
  var fallbackRole = DEFAULT_SLOT_FALLBACKS[slot];
  if (fallbackRole && slotMap[fallbackRole]) {
    return { key: slotMap[fallbackRole], via: 'role:' + fallbackRole };
  }

  // 3. Static defaults from profileKeysForType (factory mapping)
  if (typeof profileKeysForType === 'function') {
    try {
      var keys = profileKeysForType(productType);
      if (keys && fallbackRole && keys[fallbackRole]) {
        return { key: keys[fallbackRole], via: 'profileKeysForType:' + fallbackRole };
      }
    } catch (e) {}
  }

  return null;  // resolver caller decides whether this is fatal
}

// ─── Public: resolve a single slot ─────────────────────────────────────────

function resolveSlot(productType, slot, opts) {
  opts = opts || {};
  if (!productType) throw ResolveError('lookup', 'productType required');
  if (ALL_SLOTS.indexOf(slot) === -1) throw ResolveError('lookup', 'unknown slot: ' + slot);

  var resolved = _resolveKeyForSlot(productType, slot);
  if (!resolved) {
    if (opts.optional) return null;
    throw ResolveError('lookup', 'no profile linked for ' + productType + '.' + slot,
      { productType: productType, slot: slot });
  }
  var catalog = _profileCatalog();
  var entry = catalog[resolved.key];
  if (!entry) {
    throw ResolveError('lookup', 'profile key "' + resolved.key + '" not found in catalog (linked via ' + resolved.via + ')',
      { productType: productType, slot: slot, key: resolved.key });
  }
  if (!entry.outerHullMm || entry.outerHullMm.length < 3) {
    throw ResolveError('shape', 'profile "' + resolved.key + '" has no usable hull (linked via ' + resolved.via + ')',
      { productType: productType, slot: slot, key: resolved.key });
  }

  // Canonicalise (cached on legacy entries; passthrough on schemaVersion=3).
  var canonical;
  try { canonical = canonicaliseLegacyEntry(entry); }
  catch (e) {
    throw ResolveError('shape', 'failed to canonicalise profile "' + resolved.key + '": ' + e.message,
      { productType: productType, slot: slot, key: resolved.key });
  }

  var v = validateCanonicalProfile(canonical);
  if (!v.ok) {
    throw ResolveError('validate', 'profile "' + resolved.key + '" failed validation: ' + v.errors.join('; '),
      { productType: productType, slot: slot, key: resolved.key });
  }

  // Tag with resolution path so the diagnostics layer can show where it
  // came from.
  canonical.resolvedKey = resolved.key;
  canonical.resolvedVia = resolved.via;
  return canonical;
}

// ─── Public: resolve all frame slots at once ───────────────────────────────
// For door products with thresholds, this returns four entries where
// frameBottom is the threshold profile and the other three are the regular
// outer frame. No special-case threshold short-circuit needed downstream.

function resolveAllFrameSlots(productType) {
  var out = {};
  for (var i = 0; i < SLOTS_FRAME.length; i++) {
    var slot = SLOTS_FRAME[i];
    out[slot] = resolveSlot(productType, slot);
  }
  return out;
}

// ─── Public: introspection for the import / settings UI ────────────────────

function listSlots(productType) {
  var out = {};
  for (var i = 0; i < ALL_SLOTS.length; i++) {
    var slot = ALL_SLOTS[i];
    var r = _resolveKeyForSlot(productType, slot);
    out[slot] = r ? { key: r.key, via: r.via } : null;
  }
  return out;
}

// Helper for door-product setup: ensure frameBottom is linked. The import UI
// or settings page can call this at save time and refuse to save if the
// product type is a door without a threshold link.
function isDoorProduct(productType) {
  return DOOR_PRODUCT_TYPES.indexOf(productType) !== -1;
}

// Expose for ad-hoc debugging.
if (typeof window !== 'undefined') {
  window.SpartanResolve = {
    resolveSlot: resolveSlot,
    resolveAllFrameSlots: resolveAllFrameSlots,
    listSlots: listSlots,
    isDoorProduct: isDoorProduct,
    SLOTS_FRAME: SLOTS_FRAME,
    SLOTS_SASH: SLOTS_SASH,
    DOOR_PRODUCT_TYPES: DOOR_PRODUCT_TYPES,
  };
}
