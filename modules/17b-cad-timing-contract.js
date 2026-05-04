// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/17b-cad-timing-contract.js
// (relocated 2026-05-02 from js/modules/factory/26-cad-timing-contract.js;
//  loads via the bare-filename mechanism right after 17-install-schedule.js)
// Canonical contract for the timing data Spartan CAD emits to the CRM.
// Source: docs/spartan-cad-timing-audit.md (CAD WIP38, audit 2026-05-01).
//
// Purpose:
//   1. Codify the 11-key station contract, the 12-value productType set, and
//      the propertyType/installationType/floorBucket enums in ONE place that
//      every CRM module can read.
//   2. Provide read-side helpers that apply the `supply_only` install-minutes
//      override (audit §4.4 known gap) so legacy data on disk still produces
//      correct schedule-side numbers without a CAD-side fix.
//   3. Provide per-frame timing accessors for CRM features that need to show
//      "this window: 75 min install" etc. — the underlying data is already
//      persisted on cadFinalData/cadSurveyData/cadData.projectItems[i].
//   4. Provide display helpers (minutes → hours, minutes → 8h-shift days)
//      that match the CAD spec §5.2 conversion rules.
//
// What this file does NOT do (deliberately):
//   - Recompute minutes from frame dimensions. Per audit §5.3, only CAD's
//     payload values are correct.
//   - Apply the 1.22× overhead multiplier to minutes. Per audit §5.3, the
//     multiplier is baked into $cost only — minutes are pure clock time.
//   - Add an S_glaze key. Per audit §3.1, Spartan site-glazes; that station
//     never appears in `stationTimes`. validateStationTimes() actively rejects
//     it as a contract violation.
//
// Globals exposed (additive — no collisions with existing CRM symbols):
//   CadTimingContract (class), CAD_STATION_KEYS, CAD_STATION_NAMES,
//   CAD_PRODUCT_TYPES, CAD_LEGACY_FRAME_TYPE_MAP, CAD_PROPERTY_TYPES,
//   CAD_INSTALLATION_TYPES, CAD_FLOOR_BUCKETS,
//   getJobInstallMinutesForCrm, getJobProductionMinutesForCrm,
//   getJobStationTimesForCrm, getFrameInstallMinutes, getFrameProductionMinutes,
//   formatMinutesAsHours, formatMinutesAsDays, formatStationTimes
//
// Decorates (non-destructive): window.readJobInstallMinutes — wraps the
// existing function so the supply_only override applies on every read.
// ═════════════════════════════════════════════════════════════════════════════

// ── Audit §3 — The 11-key station contract ──────────────────────────────────

var CAD_STATION_KEYS = Object.freeze([
  'S1_saw',     // Stn 1 — Double Head Saw          (CAD: S1_profileSaw)
  'S2_steel',   // Stn 2 — Steel Saw                (CAD: S2_steelSaw)
  'S4A_cnc',    // Stn 4A — CNC Mill                (CAD: S4A_cncMill)
  'S4B_screw',  // Stn 4B — Steel Screw             (CAD: S4B_steelScrew)
  'S_weld',     // Welder (2-Head)                  (CAD: S_welder)
  'S_clean',    // Corner Cleaner                   (CAD: S_cornerClean)
  'S5_hw',      // Stn 5 — Siegenia Hardware        (CAD: S5_hardware)
  'S6_reveal',  // Stn 6 — Reveals/Trims            (CAD: S6_reveals)
  'S7_fly',     // Stn 7 — Fly Screens              (CAD: S7_flyScreen)
  'S_qc',       // Quality Control                  (CAD: S_qc)
  'S_disp',     // Dispatch & Packing               (CAD: S_dispatch)
]);

var CAD_STATION_NAMES = Object.freeze({
  S1_saw:    'Stn 1 — Double Head Saw',
  S2_steel:  'Stn 2 — Steel Saw',
  S4A_cnc:   'Stn 4A — CNC Mill',
  S4B_screw: 'Stn 4B — Steel Screw',
  S_weld:    'Welder (2-Head)',
  S_clean:   'Corner Cleaner',
  S5_hw:     'Stn 5 — Siegenia Hardware',
  S6_reveal: 'Stn 6 — Reveals/Trims',
  S7_fly:    'Stn 7 — Fly Screens',
  S_qc:      'Quality Control',
  S_disp:    'Dispatch & Packing',
});

// Stations explicitly EXCLUDED from the contract (audit §3.1).
// If any of these appear in a stationTimes payload, that's a contract violation.
var CAD_EXCLUDED_STATION_KEYS = Object.freeze(['S_glaze', 'S_glazing', 'S_install']);

// ── Audit §2 — The 12 product types ─────────────────────────────────────────

var CAD_PRODUCT_TYPES = Object.freeze([
  'awning_window', 'casement_window', 'tilt_turn_window', 'fixed_window',
  'sliding_window', 'french_door', 'hinged_door', 'bifold_door',
  'lift_slide_door', 'smart_slide_door', 'vario_slide_door', 'stacker_door',
]);

// Audit §2 — display labels for the 12 canonical product types. Use these
// instead of ad-hoc snake-case→space conversions so display stays consistent
// with the CAD UI ("Tilt & Turn" vs. "tilt turn window").
var CAD_PRODUCT_LABELS = Object.freeze({
  awning_window:    'Awning',
  casement_window:  'Casement',
  tilt_turn_window: 'Tilt & Turn',
  fixed_window:     'Fixed',
  sliding_window:   'Sliding',
  french_door:      'French Door',
  hinged_door:      'Hinged Door',
  bifold_door:      'Bifold',
  lift_slide_door:  'Lift & Slide',
  smart_slide_door: 'Smart Slide',
  vario_slide_door: 'Vario Slide',
  stacker_door:     'Stacker',
});

// Audit §2.1 — lossy 12 → 6 collapse for the CRM's legacy `frame_type` column.
// CRMs MUST keep the original `productType` alongside this.
var CAD_LEGACY_FRAME_TYPE_MAP = Object.freeze({
  awning_window:     'awning',
  casement_window:   'casement',
  tilt_turn_window:  'casement',     // ⚠ lossy
  fixed_window:      'fixed',
  sliding_window:    'sliding',
  french_door:       'door_hinged',
  hinged_door:       'door_hinged',
  bifold_door:       'door_sliding', // ⚠ lossy
  lift_slide_door:   'door_sliding', // ⚠ lossy
  smart_slide_door:  'door_sliding', // ⚠ lossy
  vario_slide_door:  'door_sliding', // ⚠ lossy
  stacker_door:      'door_sliding', // ⚠ lossy
});

// ── Audit §4 — Install-timing enums ─────────────────────────────────────────

var CAD_PROPERTY_TYPES     = Object.freeze(['brick_veneer', 'double_brick', 'weatherboard_cladding']);
var CAD_INSTALLATION_TYPES = Object.freeze(['retrofit', 'new_construction', 'supply_only']);
var CAD_FLOOR_BUCKETS      = Object.freeze(['ground', 'first', 'second', 'third', 'above3']);

// Audit §4.1 floor-level → bucket mapping.
function _floorLevelToBucket(level) {
  var n = Number(level) || 0;
  if (n <= 0) return 'ground';
  if (n === 1) return 'first';
  if (n === 2) return 'second';
  if (n === 3) return 'third';
  return 'above3';
}

// ── CadTimingContract class ─────────────────────────────────────────────────

class CadTimingContract {

  // ── Validation ────────────────────────────────────────────────────────────

  // Returns {ok, violations:[]}. Used to guard against contract drift.
  static validateStationTimes(stationTimes) {
    var violations = [];
    if (!stationTimes || typeof stationTimes !== 'object') {
      return { ok: false, violations: ['stationTimes is not an object'] };
    }
    var keys = Object.keys(stationTimes);

    // Reject any excluded key (audit §3.1).
    keys.forEach(function(k){
      if (CAD_EXCLUDED_STATION_KEYS.indexOf(k) >= 0) {
        violations.push('Excluded station key present: ' + k + ' (Spartan site-glazes; S_install travels separately)');
      }
    });

    // Reject any key not in the 11-key contract.
    keys.forEach(function(k){
      if (CAD_STATION_KEYS.indexOf(k) < 0 && CAD_EXCLUDED_STATION_KEYS.indexOf(k) < 0) {
        violations.push('Unknown station key: ' + k);
      }
    });

    // Each value should be a non-negative number.
    keys.forEach(function(k){
      var v = stationTimes[k];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        violations.push('Station ' + k + ': value not a non-negative finite number (' + v + ')');
      }
    });

    return { ok: violations.length === 0, violations: violations };
  }

  // Normalize an arbitrary stationTimes object to the canonical 11-key shape
  // with zero-fill for missing keys. Drops any excluded/unknown keys.
  static normalizeStationTimes(stationTimes) {
    var out = {};
    CAD_STATION_KEYS.forEach(function(k){
      var v = stationTimes && Number(stationTimes[k]);
      out[k] = (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0;
    });
    return out;
  }

  // Audit §2.1 lookup with a guardrail that warns when callers seem to be
  // trying to recompute timing from the lossy enum. Returns the legacy enum
  // value (or null for unknown productTypes).
  static mapProductTypeToLegacyFrameType(productType) {
    return CAD_LEGACY_FRAME_TYPE_MAP[productType] || null;
  }

  // ── Supply-only override (audit §4.4 known gap) ───────────────────────────

  // Returns the install-minutes value for a single frame, applying the
  // supply_only override. Reads frame.installMinutes verbatim per audit §5.1
  // unless installationType === 'supply_only', in which case we override to 0.
  static frameInstallMinutes(frame) {
    if (!frame) return 0;
    if (frame.installationType === 'supply_only') return 0;
    var v = Number(frame.installMinutes);
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0;
  }

  // Per-frame production minutes — no supply_only override applies (factory
  // still makes the frame even if the customer installs it themselves).
  static frameProductionMinutes(frame) {
    if (!frame) return 0;
    var v = Number(frame.productionMinutes);
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0;
  }

  // Apply the supply_only override across an entire `cadFinalData`/
  // `cadSurveyData` snapshot. Returns a new object (does not mutate input).
  // - Zeroes installMinutes on supply_only projectItems
  // - Re-aggregates totals.installMinutes from the corrected per-frame values
  // - Leaves productionMinutes and stationTimes alone (factory still builds it)
  static applySupplyOnlyOverride(cadSnapshot) {
    if (!cadSnapshot || !cadSnapshot.projectItems) return cadSnapshot;
    var items = cadSnapshot.projectItems.map(function(f){
      if (f && f.installationType === 'supply_only') {
        return Object.assign({}, f, { installMinutes: 0 });
      }
      return f;
    });
    var totalInstall = items.reduce(function(s,f){
      return s + (CadTimingContract.frameInstallMinutes(f) || 0);
    }, 0);
    var totals = Object.assign({}, cadSnapshot.totals || {}, {
      installMinutes: totalInstall,
    });
    return Object.assign({}, cadSnapshot, { projectItems: items, totals: totals });
  }

  // ── Per-job accessors (canonical reads) ───────────────────────────────────

  // The schedule-side install minutes for a job, with supply_only override.
  // Mirrors readJobInstallMinutes(job) but corrects supply_only on the way out.
  static getJobInstallMinutes(job) {
    if (!job) return 0;

    // Path 1: pre-aggregated on the job. 04-cad-integration writes this on
    // every save. But we have to subtract supply_only frame minutes if they
    // were rolled into the total before override.
    var stored = Number(job.estimatedInstallMinutes) || 0;
    var snapshot = job.cadFinalData || job.cadSurveyData || job.cadData;
    if (snapshot && snapshot.projectItems) {
      var supplyOnlyCharge = 0;
      snapshot.projectItems.forEach(function(f){
        if (f && f.installationType === 'supply_only') {
          supplyOnlyCharge += Number(f.installMinutes) || 0;
        }
      });
      if (supplyOnlyCharge > 0) {
        return Math.max(0, stored - supplyOnlyCharge);
      }
      if (stored > 0) return stored;
      // Recompute from frames if no aggregate stored.
      return snapshot.projectItems.reduce(function(s,f){
        return s + CadTimingContract.frameInstallMinutes(f);
      }, 0);
    }
    if (stored > 0) return stored;

    // Path 3: legacy manual override (hours).
    var hoursOverride = Number(job.installDurationHours) || 0;
    if (hoursOverride > 0) return Math.round(hoursOverride * 60);

    return 0;
  }

  // Production minutes for a job — sum of stationTimes (or stored aggregate).
  // No supply_only adjustment (factory still builds the frame).
  static getJobProductionMinutes(job) {
    if (!job) return 0;
    var stored = Number(job.estimatedProductionMinutes) || 0;
    if (stored > 0) return stored;
    var st = CadTimingContract.getJobStationTimes(job);
    return CAD_STATION_KEYS.reduce(function(s,k){ return s + (st[k] || 0); }, 0);
  }

  // Returns the canonical 11-key stationTimes object (zero-filled).
  static getJobStationTimes(job) {
    if (!job) return CadTimingContract.normalizeStationTimes({});
    var src = job.stationTimes
      || (job.cadFinalData && job.cadFinalData.totals && job.cadFinalData.totals.stationTimes)
      || (job.cadSurveyData && job.cadSurveyData.totals && job.cadSurveyData.totals.stationTimes)
      || (job.cadData && job.cadData.totals && job.cadData.totals.stationTimes)
      || {};
    return CadTimingContract.normalizeStationTimes(src);
  }

  // ── Per-frame iteration (audit §5.1: trust CAD per-frame values) ─────────

  // Iterates the frames of a job and yields { frame, installMinutes,
  // productionMinutes, productType, frameType } for each. Frames with the
  // supply_only override applied have installMinutes === 0.
  static jobFramesWithTiming(job) {
    var snap = job && (job.cadFinalData || job.cadSurveyData || job.cadData);
    var items = (snap && snap.projectItems) || [];
    return items.map(function(frame){
      return {
        frame: frame,
        installMinutes:    CadTimingContract.frameInstallMinutes(frame),
        productionMinutes: CadTimingContract.frameProductionMinutes(frame),
        productType:       frame.productType || null,
        frameType:         CadTimingContract.mapProductTypeToLegacyFrameType(frame.productType),
        propertyType:      frame.propertyType || null,
        installationType:  frame.installationType || null,
        floorLevel:        frame.floorLevel != null ? Number(frame.floorLevel) : null,
        floorBucket:       _floorLevelToBucket(frame.floorLevel),
        panelCount:        Number(frame.panelCount) || 1,
      };
    });
  }

  // ── Display helpers (audit §5.2) ──────────────────────────────────────────

  // minutes → "Xh Ym" / "X.Yh" / "Xh YYm" / "Xh" depending on style.
  // Styles:
  //   default    "1h 5m"  / "1h" / "30m"  (compact, drops zero parts)
  //   'decimal'  "1.5h"   / "0.5h"        (one-decimal hours, always 'h' suffix)
  //   'integer'  "2h"     / "8h"          (rounded whole hours; KPI/capacity labels)
  //   'padded'   "1h 05m" / "1h 00m"      (always shows hours and zero-padded minutes;
  //                                        legacy display format used by capacity tables)
  static formatMinutesAsHours(min, style) {
    var n = Math.max(0, Math.round(Number(min) || 0));
    if (style === 'decimal') return (n / 60).toFixed(1) + 'h';
    if (style === 'integer') return Math.round(n / 60) + 'h';
    var h = Math.floor(n / 60), m = n % 60;
    if (style === 'padded') {
      return h + 'h ' + (m < 10 ? '0' + m : m) + 'm';
    }
    if (h === 0) return m + 'm';
    if (m === 0) return h + 'h';
    return h + 'h ' + m + 'm';
  }

  // minutes → days, using 8h shifts and a 0.5-day minimum, ceil to nearest 0.5
  // (matches the CRM contract per audit §5.2).
  static formatMinutesAsDays(min) {
    var hours = (Number(min) || 0) / 60;
    var days  = hours / 8;
    var rounded = Math.ceil(days * 2) / 2;
    return Math.max(0.5, rounded);
  }

  // Returns an array of { key, name, minutes, hours } rows for rendering.
  static formatStationTimes(stationTimes) {
    var st = CadTimingContract.normalizeStationTimes(stationTimes);
    return CAD_STATION_KEYS.map(function(k){
      return {
        key:     k,
        name:    CAD_STATION_NAMES[k],
        minutes: st[k],
        hours:   (st[k] / 60),
      };
    });
  }
}

// ── Function-style wrappers (CONTRACT.md "public API") ──────────────────────

function getJobInstallMinutesForCrm(job)    { return CadTimingContract.getJobInstallMinutes(job); }
function getJobProductionMinutesForCrm(job) { return CadTimingContract.getJobProductionMinutes(job); }
function getJobStationTimesForCrm(job)      { return CadTimingContract.getJobStationTimes(job); }
function getFrameInstallMinutes(frame)      { return CadTimingContract.frameInstallMinutes(frame); }
function getFrameProductionMinutes(frame)   { return CadTimingContract.frameProductionMinutes(frame); }

function formatMinutesAsHours(min, style)   { return CadTimingContract.formatMinutesAsHours(min, style); }
function formatMinutesAsDays(min)           { return CadTimingContract.formatMinutesAsDays(min); }
function formatStationTimes(st)             { return CadTimingContract.formatStationTimes(st); }

// Display label for a CAD productType. Uses CAD_PRODUCT_LABELS where available,
// falls back to snake_case→space for unknown types so partial drift still renders
// something readable. Pass a fallback if you want a different blank-string default.
function formatProductType(productType, fallback) {
  if (!productType) return (fallback != null ? fallback : '');
  if (CAD_PRODUCT_LABELS[productType]) return CAD_PRODUCT_LABELS[productType];
  return String(productType).replace(/_/g, ' ');
}

// ── Decorate window.readJobInstallMinutes to apply the supply_only override ─
// Audit §4.4 known gap. The existing reader (in 17-install-schedule.js) is
// the centre of every install-capacity calculation in the CRM; wrapping it
// here propagates the fix everywhere without touching call sites.

(function decorateInstallMinutesReader(){
  if (typeof window === 'undefined') return;
  var original = (typeof window.readJobInstallMinutes === 'function')
    ? window.readJobInstallMinutes
    : (typeof readJobInstallMinutes === 'function' ? readJobInstallMinutes : null);
  if (!original) return;
  if (original.__supplyOnlyDecorated) return;   // idempotent

  var wrapped = function(job){
    // Always defer to the contract's getJobInstallMinutes — it understands the
    // supply_only override, falls back through the same paths the original
    // reader uses (estimatedInstallMinutes → cad totals → installDurationHours).
    var fromContract = CadTimingContract.getJobInstallMinutes(job);
    if (fromContract > 0) return fromContract;
    // Defensive fallback to the original reader for any path the contract
    // doesn't model yet.
    return original(job);
  };
  wrapped.__supplyOnlyDecorated = true;
  wrapped.__original = original;
  window.readJobInstallMinutes = wrapped;
  // Also overwrite the bare global so callers that don't go through `window.`
  // pick up the decorated version.
  try { /* eslint-disable-next-line */ readJobInstallMinutes = wrapped; } catch (e) {}
})();
