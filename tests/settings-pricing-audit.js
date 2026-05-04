// Pricing-config audit harness.
// Loads the bundled CAD app and exercises the full chain:
//   Settings UI write -> appSettings.pricingConfig -> calculateFramePrice
//   -> estimateStationTimes / estimateInstallMinutes
// The point is to verify that an edit to a config value (rate, op time,
// installTimes matrix, installPlanning baseMinutes) actually changes the
// numbers that come out the other end. Anything that doesn't change is a bug.

const fs = require('fs');
const path = require('path');

// Stub three.js + DOM. The pricing engine touches none of these but the
// global init code in some modules (R3F bits, profile manager, etc.) does
// at top-level. We don't run that init — we extract just the pure helpers.

// Concatenate modules in numeric order, same as build.sh.
const dir = '/mnt/project';
const files = fs.readdirSync(dir).filter(f => /^\d+[a-z]?-.*\.js$/.test(f)).sort();
let src = '';
for (const f of files) src += fs.readFileSync(path.join(dir, f), 'utf8') + '\n';

// We need: PRICING_DEFAULTS, PRODUCTS, calculateFramePrice, autoCalcInstallPlanning,
//          estimateStationTimes, estimateInstallMinutes, estimateProductionMinutes,
//          floorLevelToBucket, getProfileDims, profileKeysForType, calcFrameWeightKg,
//          steelKeysForType, COLOURS, PROPERTY_TYPES, FLOOR_LEVELS,
//          INSTALLATION_TYPES.
// We DON'T need the React component (39-main-app.js's SpartanCADPreview).
// Strip it: it's the biggest closure and pulls in JSX/React. Stop the source
// at the line just before "function SpartanCADPreview(". Everything after
// that — the JSX component + smoke-tests bootstrap — gets dropped.

const stopMarker = 'function SpartanCADPreview(';
const stopIdx = src.indexOf(stopMarker);
if (stopIdx < 0) { console.error('Could not find SpartanCADPreview marker'); process.exit(1); }

// But 40-smoke-tests-bootstrap.js sets window.calculateFramePrice etc. — we
// want that, but not the ReactDOM.render call. Easiest: keep src up to
// stopIdx, then append the window.* assignments by re-grepping bootstrap.

let trimmed = src.slice(0, stopIdx);
// Manually expose what we need on window — just reference identifiers that
// definitely exist in the trimmed source (defined before SpartanCADPreview).
trimmed += `
;window.PRICING_DEFAULTS = PRICING_DEFAULTS;
window.calculateFramePrice = calculateFramePrice;
window.autoCalcInstallPlanning = autoCalcInstallPlanning;
window.estimateStationTimes = estimateStationTimes;
window.estimateInstallMinutes = estimateInstallMinutes;
window.estimateProductionMinutes = estimateProductionMinutes;
`;

// Babel-transpile JSX — the in-browser bundle does this at runtime.
const babel = require('@babel/core');
trimmed = babel.transformSync(trimmed, {
  presets: ['@babel/preset-react'],
  babelrc: false, configFile: false,
  sourceType: 'script',
}).code;

// Wrap as a Function to mimic the bundle execution model.
// React/ReactDOM are not used by anything we keep, but we still pass shims to
// satisfy the prelude (`const { useState, useEffect, useRef } = React;`).
const ReactShim = { useState: () => [], useEffect: () => {}, useRef: () => ({ current: null }), createElement: () => null, Fragment: 'Fragment' };
const ReactDOMShim = {};

// Need to provide globals the source expects.
const sandbox = {
  React: ReactShim,
  ReactDOM: ReactDOMShim,
  window: {
    addEventListener: () => {}, removeEventListener: () => {},
    location: { href: '', search: '', hash: '' },
    history: { replaceState: () => {}, pushState: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'audit-harness' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    requestAnimationFrame: cb => setTimeout(cb, 0),
    cancelAnimationFrame: id => clearTimeout(id),
  },
  document: {
    createElement: () => ({ getContext: () => null, style: {}, appendChild: () => {}, addEventListener: () => {} }),
    addEventListener: () => {}, removeEventListener: () => {},
    body: { appendChild: () => {} },
    documentElement: { style: {} },
  },
  navigator: { userAgent: 'audit-harness' },
  console,
  process,
  fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
  THREE: new Proxy({}, { get: () => function(){ return new Proxy({}, { get: () => () => {} }); } }),
  Babel: { transform: () => ({ code: '' }) },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Error, JSON, Math, Date, Object, Array, Number, String, Boolean,
  isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
};

// Use Function to evaluate. Pass keys as args.
const keys = Object.keys(sandbox);
const vals = Object.values(sandbox);
const fn = new Function(...keys, trimmed + '\n; return { calculateFramePrice, autoCalcInstallPlanning, estimateStationTimes, estimateInstallMinutes, estimateProductionMinutes, PRICING_DEFAULTS, PRODUCTS, COLOURS, PROPERTY_TYPES, FLOOR_LEVELS, INSTALLATION_TYPES };');
let api;
try {
  api = fn(...vals);
} catch (err) {
  console.error('Bundle eval failed:', err.message);
  console.error(err.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}
console.log('Bundle eval OK. Available:', Object.keys(api).filter(k => api[k]));

// ─── TEST CASES ─────────────────────────────────────────────────────────

// Build a representative frame: 900x900 awning, brick_veneer, ground floor.
function makeFrame(over = {}) {
  return Object.assign({
    productType: 'awning_window',
    width: 900, height: 900,
    panelCount: 1,
    colour: 'white_body', colourInt: 'white_body',
    glassSpec: 'dgu_4_12_4',
    cellTypes: [['awning']],
    cellBreaks: [[null]],
    propertyType: 'brick_veneer',
    floorLevel: 0,
    installationType: 'retrofit',
    hardwareColour: 'white',
    openStyle: 'bottom_hung',
  }, over);
}

// Deep clone defaults; user edits will mutate the clone like setAppSettings does.
function clonePc() { return JSON.parse(JSON.stringify(api.PRICING_DEFAULTS)); }

function row(label, ...vals) {
  console.log(label.padEnd(45), ...vals.map(v => String(v).padStart(10)));
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' AUDIT 1: Production-time edit → station minutes + cost');
console.log('══════════════════════════════════════════════════════════════════');
{
  const frame = makeFrame();
  const pcA = clonePc();
  const pcB = clonePc();
  // Edit S1_profileSaw doubleHeadCut: 0.5 -> 5.0 (10x).
  pcB.stations.S1_profileSaw.ops.doubleHeadCut.t = 5.0;
  const settingsA = { pricingConfig: pcA };
  const settingsB = { pricingConfig: pcB };

  const stA = api.estimateStationTimes(frame, settingsA);
  const stB = api.estimateStationTimes(frame, settingsB);
  row('S1_saw mins (default doubleHeadCut=0.5)', stA.S1_saw);
  row('S1_saw mins (edited doubleHeadCut=5.0)', stB.S1_saw);
  console.log(stB.S1_saw > stA.S1_saw ? '  ✓ Op-time edit propagates to station minutes'
                                       : '  ✗ FAIL — edit did not take effect');

  const fpA = api.calculateFramePrice(frame, pcA);
  const fpB = api.calculateFramePrice(frame, pcB);
  row('S1_profileSaw cost (default $42/hr)', '$' + fpA.stations.S1_profileSaw.cost);
  row('S1_profileSaw cost (edited 10x mins)', '$' + fpB.stations.S1_profileSaw.cost);
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' AUDIT 2: Labour-rate edit → station cost (mins unchanged)');
console.log('══════════════════════════════════════════════════════════════════');
{
  const frame = makeFrame();
  const pcA = clonePc();
  const pcB = clonePc();
  pcB.stations.S1_profileSaw.rate = 200; // way above default 42
  const fpA = api.calculateFramePrice(frame, pcA);
  const fpB = api.calculateFramePrice(frame, pcB);
  row('S1_profileSaw rate=42  cost', '$' + fpA.stations.S1_profileSaw.cost);
  row('S1_profileSaw rate=200 cost', '$' + fpB.stations.S1_profileSaw.cost);
  const expected = +(fpA.stations.S1_profileSaw.cost * (200/42)).toFixed(2);
  console.log(Math.abs(fpB.stations.S1_profileSaw.cost - expected) < 0.5
    ? '  ✓ Rate edit propagates to station cost (≈' + (200/42).toFixed(2) + 'x)'
    : '  ✗ FAIL — expected ≈$' + expected + ', got $' + fpB.stations.S1_profileSaw.cost);
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' AUDIT 3: Install-Times MATRIX edit (WIP23) → S_install minutes');
console.log('══════════════════════════════════════════════════════════════════');
{
  const frame = makeFrame();
  const pcA = clonePc();
  const pcB = clonePc();
  // Edit retrofit awning: default 45 -> 200
  if (!pcB.stations.S_install) pcB.stations.S_install = {};
  if (!pcB.stations.S_install.installTimes) pcB.stations.S_install.installTimes = {};
  if (!pcB.stations.S_install.installTimes.retrofit) pcB.stations.S_install.installTimes.retrofit = {};
  pcB.stations.S_install.installTimes.retrofit.awning_window = { t: 200 };
  const fpA = api.calculateFramePrice(frame, pcA);
  const fpB = api.calculateFramePrice(frame, pcB);
  row('S_install mins (matrix awning=45)', fpA.stations.S_install.mins);
  row('S_install mins (matrix awning=200)', fpB.stations.S_install.mins);
  console.log(fpB.stations.S_install.mins > fpA.stations.S_install.mins
    ? '  ✓ WIP23 install-matrix edit propagates'
    : '  ✗ FAIL — install matrix edit did not take effect');

  // Now check what installMinutes (the saved field) reports — it goes
  // through estimateInstallMinutes / autoCalcInstallPlanning, which uses
  // a DIFFERENT config tree: installPlanning.baseMinutes / floorAddOn.
  const imA = api.estimateInstallMinutes(frame, { pricingConfig: pcA });
  const imB = api.estimateInstallMinutes(frame, { pricingConfig: pcB });
  row('SAVED installMinutes (matrix=45)', imA);
  row('SAVED installMinutes (matrix=200)', imB);
  console.log(imA === imB
    ? '  ⚠ EXPECTED: WIP23 matrix does NOT affect saved installMinutes (separate path)'
    : '  ! UNEXPECTED — matrix did affect installMinutes');
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' AUDIT 4: Install-Planning edit (WIP9) → saved installMinutes');
console.log('══════════════════════════════════════════════════════════════════');
{
  const frame = makeFrame();
  const pcA = clonePc();
  const pcB = clonePc();
  // Edit brick_veneer.under: default 60 -> 240
  pcB.installPlanning.baseMinutes.brick_veneer.under = 240;
  const imA = api.estimateInstallMinutes(frame, { pricingConfig: pcA });
  const imB = api.estimateInstallMinutes(frame, { pricingConfig: pcB });
  row('SAVED installMinutes (baseMin under=60)', imA);
  row('SAVED installMinutes (baseMin under=240)', imB);
  console.log(imB > imA
    ? '  ✓ Install-Planning edit propagates to saved installMinutes'
    : '  ✗ FAIL — install-planning edit did not take effect');

  // Floor add-on edit too
  const pcC = clonePc();
  pcC.installPlanning.floorAddOn.first = 999;
  const frameUp = makeFrame({ floorLevel: 1 });
  const imC = api.estimateInstallMinutes(frameUp, { pricingConfig: pcC });
  const imD = api.estimateInstallMinutes(frameUp, { pricingConfig: pcA });
  row('first-floor frame (default first=15)', imD);
  row('first-floor frame (edited first=999)', imC);
  console.log(imC > imD
    ? '  ✓ Floor add-on edit propagates'
    : '  ✗ FAIL — floor add-on edit did not take effect');
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' AUDIT 5: Frame property-type edit affects installMinutes per-frame');
console.log('══════════════════════════════════════════════════════════════════');
{
  const pc = clonePc();
  const fbv = makeFrame({ propertyType: 'brick_veneer' });
  const fdb = makeFrame({ propertyType: 'double_brick' });
  const fwc = makeFrame({ propertyType: 'weatherboard_cladding' });
  const im_bv = api.estimateInstallMinutes(fbv, { pricingConfig: pc });
  const im_db = api.estimateInstallMinutes(fdb, { pricingConfig: pc });
  const im_wc = api.estimateInstallMinutes(fwc, { pricingConfig: pc });
  row('brick_veneer 0.81m² ground →', im_bv, 'min  (expect baseMin.under)');
  row('double_brick same →',          im_db);
  row('weatherboard same →',          im_wc);
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' AUDIT 6: Sanity — does estimateProductionMinutes track edits?');
console.log('══════════════════════════════════════════════════════════════════');
{
  const frame = makeFrame();
  const pcA = clonePc();
  const pcB = clonePc();
  // Bump every op time by 10x at a couple of stations.
  for (const op of Object.keys(pcB.stations.S1_profileSaw.ops)) {
    pcB.stations.S1_profileSaw.ops[op].t *= 10;
  }
  const pmA = api.estimateProductionMinutes(frame, { pricingConfig: pcA });
  const pmB = api.estimateProductionMinutes(frame, { pricingConfig: pcB });
  row('Total production minutes (default)', pmA);
  row('Total production minutes (S1 ops × 10)', pmB);
  console.log(pmB > pmA
    ? '  ✓ Production-time edit propagates'
    : '  ✗ FAIL');
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' AUDIT 7: S_install op edits (sealTrim/cleanup) propagate?');
console.log('══════════════════════════════════════════════════════════════════');
{
  const frame = makeFrame();
  const pcA = clonePc();
  const pcB = clonePc();
  pcB.stations.S_install.ops.sealTrim.t = 99;
  pcB.stations.S_install.ops.cleanup.t = 99;
  const fpA = api.calculateFramePrice(frame, pcA);
  const fpB = api.calculateFramePrice(frame, pcB);
  row('S_install mins (default sealTrim+cleanup)', fpA.stations.S_install.mins);
  row('S_install mins (each op = 99)', fpB.stations.S_install.mins);
  console.log(fpB.stations.S_install.mins > fpA.stations.S_install.mins
    ? '  ✓ S_install op edits propagate to install COST (price)'
    : '  ✗ FAIL');
  const imA = api.estimateInstallMinutes(frame, { pricingConfig: pcA });
  const imB = api.estimateInstallMinutes(frame, { pricingConfig: pcB });
  row('SAVED installMinutes (sealTrim/cleanup default)', imA);
  row('SAVED installMinutes (each = 99)', imB);
  console.log(imA === imB
    ? '  ✗ BUG — sealTrim/cleanup edits do NOT affect saved installMinutes'
    : '  ✓ sealTrim/cleanup edits DO affect saved installMinutes');
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' AUDIT 8: installation-type change (retrofit → new_construction)');
console.log('══════════════════════════════════════════════════════════════════');
{
  const pc = clonePc();
  const frR = makeFrame({ installationType: 'retrofit' });
  const frN = makeFrame({ installationType: 'new_construction' });
  const frS = makeFrame({ installationType: 'supply_only' });
  const fpR = api.calculateFramePrice(frR, pc);
  const fpN = api.calculateFramePrice(frN, pc);
  const fpS = api.calculateFramePrice(frS, pc);
  row('retrofit         price S_install mins', fpR.stations.S_install.mins);
  row('new_construction price S_install mins', fpN.stations.S_install.mins);
  row('supply_only      price S_install mins', fpS.stations.S_install.mins);
  const imR = api.estimateInstallMinutes(frR, { pricingConfig: pc });
  const imN = api.estimateInstallMinutes(frN, { pricingConfig: pc });
  const imS = api.estimateInstallMinutes(frS, { pricingConfig: pc });
  row('retrofit         SAVED installMinutes', imR);
  row('new_construction SAVED installMinutes', imN);
  row('supply_only      SAVED installMinutes', imS);
  console.log((imR === imN && imN === imS)
    ? '  ✗ BUG — installationType change does NOT affect saved installMinutes (treated as identical)'
    : '  ✓ installationType change affects saved installMinutes');
}
