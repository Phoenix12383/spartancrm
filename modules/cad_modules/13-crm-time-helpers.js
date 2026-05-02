// ═══════════════════════════════════════════════════════════════════════════
// M2 TIME ESTIMATION HELPERS (contract §5.2, §5.3)
//
// These are THIN ADAPTERS over the existing calculateFramePrice and
// autoCalcInstallPlanning machinery. They do NOT reimplement timing logic —
// they map existing per-station minutes (tuned in Settings → Pricing →
// Production times) into the contract's 11-key payload shape.
//
// Station key mapping (existing CAD → contract FACTORY_STATIONS_TIMES):
//   S1_profileSaw   → S1_saw
//   S2_steelSaw     → S2_steel
//   S4A_cncMill     → S4A_cnc
//   S4B_steelScrew  → S4B_screw
//   S_welder        → S_weld
//   S_cornerClean   → S_clean
//   S5_hardware     → S5_hw
//   S6_reveals      → S6_reveal
//   S7_flyScreen    → S7_fly
//   S_qc            → S_qc
//   S_dispatch      → S_disp
//
// NOT mapped (deliberately excluded per contract):
//   S_glazing — contract §5.2 explicitly excludes S_glaze. Glazing minutes
//               are dropped from productionMinutes.
//   S_install — not a factory station; contributes to installMinutes via
//               autoCalcInstallPlanning, not productionMinutes.
// ═══════════════════════════════════════════════════════════════════════════

var M2_STATION_KEY_MAP = {
  S1_profileSaw:  'S1_saw',
  S2_steelSaw:    'S2_steel',
  S4A_cncMill:    'S4A_cnc',
  S4B_steelScrew: 'S4B_screw',
  S_welder:       'S_weld',
  S_cornerClean:  'S_clean',
  S5_hardware:    'S5_hw',
  S6_reveals:     'S6_reveal',
  S7_flyScreen:   'S7_fly',
  S_qc:           'S_qc',
  S_dispatch:     'S_disp'
};

function estimateStationTimes(frame, appSettings) {
  var zero = {
    S1_saw: 0, S2_steel: 0, S4A_cnc: 0, S4B_screw: 0, S_weld: 0,
    S_clean: 0, S5_hw: 0, S6_reveal: 0, S7_fly: 0, S_qc: 0, S_disp: 0
  };
  if (!frame) return zero;
  var pc = (appSettings && appSettings.pricingConfig)
    || (typeof window !== 'undefined' && window.PRICING_DEFAULTS)
    || null;
  if (!pc || typeof calculateFramePrice !== 'function') return zero;
  var breakdown;
  try {
    var result = calculateFramePrice(frame, pc);
    breakdown = result && result.stations;
  } catch (e) { return zero; }
  if (!breakdown) return zero;
  var out = Object.assign({}, zero);
  for (var existingKey in M2_STATION_KEY_MAP) {
    if (!M2_STATION_KEY_MAP.hasOwnProperty(existingKey)) continue;
    var contractKey = M2_STATION_KEY_MAP[existingKey];
    var entry = breakdown[existingKey];
    if (entry && typeof entry.mins === 'number' && isFinite(entry.mins)) {
      out[contractKey] = Math.round(entry.mins);
    }
  }
  return out;
}

function estimateProductionMinutes(frame, appSettings) {
  var times = estimateStationTimes(frame, appSettings);
  var sum = 0;
  for (var k in times) if (times.hasOwnProperty(k)) sum += (times[k] || 0);
  return Math.round(sum);
}

function estimateInstallMinutes(frame, appSettings) {
  if (!frame || typeof autoCalcInstallPlanning !== 'function') return 0;
  try {
    var plan = autoCalcInstallPlanning([frame], appSettings);
    // WIP9 fix: WIP8 read plan.totalInstallHours (never returned), so this
    // wrapper silently returned 0 for every frame. The return key is
    // estimatedInstallHours — see autoCalcInstallPlanning.
    var hours = (plan && typeof plan.estimatedInstallHours === 'number') ? plan.estimatedInstallHours : 0;
    return Math.round(hours * 60);
  } catch (e) { return 0; }
}

if (typeof window !== 'undefined') {
  window.estimateStationTimes     = estimateStationTimes;
  window.estimateProductionMinutes = estimateProductionMinutes;
  window.estimateInstallMinutes   = estimateInstallMinutes;
}

