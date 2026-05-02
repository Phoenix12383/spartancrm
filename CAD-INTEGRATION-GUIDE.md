# Spartan CAD → CRM Integration Guide

How to integrate a modular React CAD tool into the Spartan CRM (vanilla JS, no bundler).  
Use this to re-implement, extend, or brief another Claude instance on the pattern.

---

## Overview

The CAD is a full React 18 app (Three.js 3D viewer, JSX, ES modules) that cannot share
the same HTML page as the CRM because:

- The CRM uses React 17 (Recharts dependency) with `ReactDOM.render()`
- The CAD uses React 18 `createRoot()`
- Both would fight over `window.React`, `window.ReactDOM`, and `#root`

**Solution:** serve `cad.html` from the same origin as the CRM, open it in a full-screen
iframe overlay, and pass data in/out via `postMessage` with same-origin checks.

```
CRM (index.html / modules/*.js)
  └── opens overlay iframe → cad.html
        └── loads 44 CAD modules via fetch + Babel runtime transpile
              ↕  postMessage (same origin)
  CRM receives save payload → writes to state / localStorage / Supabase
```

---

## Repository Layout

```
spartancrm/
├── index.html                        # CRM entry point — sequential module loader
├── cad.html                          # CAD entry point — separate React 18 app
├── modules/
│   ├── 04-cad-integration.js         # CRM-side bridge (iframe open/close/postMessage)
│   ├── 02a-mock-factory-data.js      # Dev seed data for factory stations
│   └── cad_modules/                  # 44 CAD source files (copied from spartan-cad-modular)
│       ├── 00-react-prelude.js
│       ├── 01-data-products.js
│       ├── ...
│       └── 40-smoke-tests-bootstrap.js
├── js/modules/factory/
│   ├── 23-factory-helpers.js         # ProductionStation class + FACTORY_STATIONS_FROM_MANUAL
│   ├── 34-factory-station-pages.js   # Operator queue pages for each station
│   └── ...
└── modules/
    ├── 16-factory-crm.js             # cadFrameToFactoryItem + pushJobToFactory
    └── 16d-factory-pages.js          # renderProdBoard (kanban with clickable headers)
```

---

## Step 1 — Copy the CAD Modules

Place all CAD source files into `modules/cad_modules/`. They must be plain JS/JSX files
(not bundled). The naming convention `NN-description.js` is arbitrary but keep it.

The files must export their symbols via `window.*` or via the shared scope injected by
`cad.html` — see Step 2.

---

## Step 2 — Create `cad.html`

`cad.html` is a standalone HTML page that:
1. Loads its own CDN deps (React 18, Three.js r128, Babel standalone, jsPDF, SheetJS)
2. Fetches all 44 `cad_modules/*.js` files via `fetch()`
3. Concatenates them into one string and runs `Babel.transform()` on the combined source
4. Executes the result in a scope that has `React` and `ReactDOM` as arguments

### Key snippet inside `cad.html`

```html
<div id="root"></div>
<script src="https://unpkg.com/react@18.2.0/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script>
const MODULE_FILES = [
  'modules/cad_modules/00-react-prelude.js',
  'modules/cad_modules/01-data-products.js',
  // ... all 44 files in dependency order
  'modules/cad_modules/39-main-app.js',
];

async function loadCAD() {
  const sources = await Promise.all(
    MODULE_FILES.map(f => fetch(f).then(r => r.text()))
  );
  const combined = sources.join('\n\n');
  const result = Babel.transform(combined, {
    presets: ['react'],
    plugins: ['transform-class-properties'],
  });
  const fn = new Function('React', 'ReactDOM', result.code);
  fn(React, ReactDOM);
}
loadCAD().catch(console.error);
</script>
```

**Performance note:** Runtime Babel transpile of 44 files takes 5–30 seconds on first
load. For production, pre-transpile with Node.js (`@babel/core`) and serve a single
bundled file. For dev, this is acceptable.

**Caching trick:** store the transpiled output in `sessionStorage` keyed by a hash of
the source filenames — subsequent page opens in the same session are instant.

---

## Step 3 — The postMessage Protocol

Both sides check `event.origin === window.location.origin`. Never hard-code a URL.

| Direction       | `type` field              | Payload                                         |
|-----------------|---------------------------|-------------------------------------------------|
| CRM → CAD       | `spartan-cad-init`        | `{ customer, projectName, jobNumber, designData, … }` |
| CAD → CRM       | `spartan-cad-ready`       | *(no payload — CAD signals it finished loading)* |
| CRM → CAD       | `spartan-cad-request-save`| *(triggers CAD to emit its current project data)* |
| CAD → CRM       | `spartan-cad-save`        | `{ projectItems[], totalPrice, totals, … }`     |
| CAD → CRM       | `spartan-cad-save-error`  | `{ message }`                                   |
| CAD → CRM       | `spartan-cad-close`       | *(user clicked the X button)*                   |

### CRM sends init after ready (with retry)

The CAD takes several seconds to transpile. The CRM sends `spartan-cad-init` only after
receiving `spartan-cad-ready`, with a retry loop:

```js
// Inside 04-cad-integration.js
function _scheduleInit() {
  if (_cadSession.retries >= CAD_INIT_MAX_RETRIES) { _closeCadOverlay(); return; }
  _cadSession.retryTimer = setTimeout(function() {
    _cadSession.iframe.contentWindow.postMessage(
      { type: CAD_MSG_INIT, ...payload },
      window.location.origin
    );
    _cadSession.retries++;
    _scheduleInit();
  }, _cadSession.retries === 0 ? CAD_INIT_FIRST_DELAY_MS : CAD_INIT_RETRY_DELAY_MS);
}
```

---

## Step 4 — `04-cad-integration.js` (CRM bridge)

This file owns the full lifecycle of the CAD overlay on the CRM side.

### Public API

```js
openCadDesigner(entityType, entityId, mode)
// entityType: 'lead' | 'deal' | 'job'
// mode:       'design' | 'survey' | 'final'
```

### What it does on save (`spartan-cad-save`)

**For leads and deals** (`_persistToLeadOrDeal`):
- Builds or updates a quote object on the entity with `projectItems`, `totalPrice`, pricing breakdown
- Calls `setState({ leads: updated })` or `setState({ deals: updated })` — that's it
- Do NOT call `dbUpsert()` directly — `setState` already has a 500ms debounced Supabase sync

**For jobs** (`_persistToJob`):
- `mode === 'design'`  → writes to `job.cadData`
- `mode === 'survey'`  → writes to `job.cadSurveyData`
- `mode === 'final'`   → writes to `job.cadFinalData`; also stamps `stationTimes` onto each frame
- Calls `setState({ jobs: updated })` only — same reason, no direct dbUpsert

### Critical rule — no double-writes to Supabase

`setState` in `05-state-auth-rbac.js` debounces and diffs state changes, then upserts
only changed rows. Adding explicit `dbUpsert()` calls on top of `setState` causes double
hits and Supabase statement timeouts. **Never call `dbUpsert` after `setState`.**

---

## Step 5 — CAD Save Payload → Factory Items

The CAD emits `projectItems[]` where each item looks like:

```js
{
  name: 'W01',
  productType: 'casement_window',
  width: 1200,         // or widthMm
  height: 1050,        // or heightMm
  colour: 'monument',
  colourInt: 'surfmist',
  glassSpec: 'lowe_4_12_4',
  profileSystem: 'ideal_4000',
  panelCount: 1,
  installationType: 'retrofit',
  stationTimes: {      // minutes per CAD station key
    S1_saw: 18, S2_steel: 11,
    S4A_cnc: 20, S4B_screw: 6,
    S_weld: 24, S_clean: 5,
    S5_hw: 22, S6_reveal: 12, S7_fly: 8,
    S_qc: 6, S_disp: 5,
  },
  installMinutes: 45,
  productionMinutes: 137,
}
```

`pushJobToFactory(jobId)` in `16-factory-crm.js` reads `job.cadFinalData` (preferred),
then `cadSurveyData`, then `cadData`, maps each item through `cadFrameToFactoryItem()`,
and writes to `spartan_factory_items` in localStorage + Supabase.

---

## Step 6 — The 6-Station Model

### Station definitions (in `js/modules/factory/23-factory-helpers.js`)

```js
var FACTORY_STATIONS_FROM_MANUAL = [
  new ProductionStation({ id:'cutting',  cadKeys:['S1_saw','S2_steel']       }),
  new ProductionStation({ id:'milling',  cadKeys:['S4A_cnc','S4B_screw']     }),
  new ProductionStation({ id:'welding',  cadKeys:['S_weld','S_clean']         }),
  new ProductionStation({ id:'hardware', cadKeys:['S5_hw']                    }),
  new ProductionStation({ id:'reveals',  cadKeys:['S6_reveal','S7_fly']       }),
  new ProductionStation({ id:'dispatch', cadKeys:['S_qc','S_disp']            }),
];
```

`cadKeys` tells the station page which keys to sum from `item.stationTimes` to compute
the time budget displayed for each frame card.

### Route mapping (in `modules/99-init.js`)

```js
stncutting:  renderStnCutting,
stnmilling:  renderStnMilling,
stnwelding:  renderStnWelding,
stnhardware: renderStnHardware,
stnreveals:  renderStnReveals,
stndispatch: renderStnDispatch,
```

### Station page renderer (`js/modules/factory/34-factory-station-pages.js`)

`renderStationPage(stationId)` is a generic renderer:
- Reads `getStationQueue(stationId)` from localStorage factory items
- For each frame: shows name, job number, customer, product type, W×H, colours, glass spec, time budget, due date
- Move-to-next-station button calls `assignToStation(itemId, nextStn.id)` → `moveFactoryItem()`
- Final station shows "✅ Complete" button

---

## Step 7 — Module Load Order

The CRM loads modules sequentially via injected `<script>` tags. Load order matters.

```
01-persistence.js          ← defines CONTACTS, DEALS, LEADS_DATA (must be here!)
02-mock-data.js            ← seed data constants
02a-mock-factory-data.js   ← dev factory seed (auto-loads if factory is empty)
04-cad-integration.js      ← CAD bridge (before 05, uses only var globals)
05-state-auth-rbac.js      ← defines getState/setState as const (TDZ sensitive)
...
js/modules/factory/23-factory-helpers.js   ← FACTORY_STATIONS_FROM_MANUAL
js/modules/factory/34-factory-station-pages.js
...
99-init.js                 ← MUST be last
```

### Module path resolution in `index.html`

```js
const modulePath = (_entry.indexOf('/') >= 0)
  ? _entry                      // path with slash → relative to project root
  : 'modules/' + _entry;        // bare name → modules/ directory
```

---

## Known Pitfalls & Fixes

### 1. `LEADS_DATA is not defined` → TDZ crash

`05-state-auth-rbac.js` initialises `_state` with `LEADS_DATA` at line ~1162.  
If `LEADS_DATA` is not declared before `05` runs, the script crashes mid-init.  
Because `05` uses `const getState` (hoisted but uninitialized at crash point), every
subsequent `typeof getState` throws TDZ rather than returning `'undefined'`.

**Fix:** add `const LEADS_DATA = [];` to `01-persistence.js`.

### 2. `FACTORY_STATIONS_FROM_MANUAL is not defined`

`ProductionStation` constructor didn't store `cadKeys` — it was passed in `def` but not
assigned to `this`. The array was built but station pages couldn't read `stn.cadKeys`.

**Fix:** add `this.cadKeys = def.cadKeys || [];` to `ProductionStation` constructor.

Also add explicit `window.FACTORY_STATIONS_FROM_MANUAL = FACTORY_STATIONS_FROM_MANUAL;`
at the bottom of `23-factory-helpers.js` — injected `<script>` tags can lose `var`
globals in some browsers; belt-and-suspenders assignment to `window` is reliable.

### 3. Wrong server root

Running `python -m http.server` from a parent directory means `modules/01-persistence.js`
resolves to the wrong path — all module loads 404 silently, the chain completes with
errors, and the app appears to load (CDN scripts only).

**Fix:** always run the server from the `spartancrm/` folder:
```bash
cd C:\Users\parrg\Downloads\SpartanCRMOdd\spartancrm
python -m http.server 8080
# then open http://localhost:8080/
```

### 4. Double Supabase writes / statement timeouts

Old pattern in `04-cad-integration.js` called `dbUpsert(table, row)` after `setState()`.
`setState` already debounces and syncs. Two upserts hit the same row within milliseconds
causing Supabase statement timeouts.

**Fix:** remove all explicit `dbUpsert` / `dbUpdate` calls that follow a `setState` call
in the same code path.

### 5. Supabase double-write in `pushJobToFactory`

After pushing a job to factory, `productionStatus` and `factoryOrderId` must survive a
page reload (dbLoadAll re-hydrates from Supabase). Call `dbUpdate` explicitly here
because the job object in state was just mutated and the field diff won't catch it:

```js
setState({ jobs: updatedJobs });
if (typeof dbUpdate === 'function') {
  dbUpdate('jobs', jobId, { productionStatus: 'received', factoryOrderId: order.id });
}
```

### 6. Three.js r128 warnings

The CAD uses `specularIntensity` and `thickness` on `MeshPhysicalMaterial`, which are
properties from r135+. On r128 they log warnings but don't break anything. Cosmetic only.

### 7. Old `FACTORY_STATIONS` vs new `FACTORY_STATIONS_FROM_MANUAL`

The legacy `16-factory-crm.js` defines a 7-station `FACTORY_STATIONS` array (no cadKeys).
The new `23-factory-helpers.js` defines 6-station `FACTORY_STATIONS_FROM_MANUAL` (with cadKeys).
`renderProdBoard` guards against both:

```js
var stations = (typeof FACTORY_STATIONS_FROM_MANUAL !== 'undefined')
  ? FACTORY_STATIONS_FROM_MANUAL
  : FACTORY_STATIONS;
```

### 8. Navigation History Stack (in `modules/07-shared-ui.js`)

Module-level back/forward history that works across all CRM pages:

```js
var _navHistory = [];
var _navFuture  = [];

function _navSnapshot() {
  var s = getState();
  return { page: s.page, jobDetailId: s.jobDetailId || null,
           dealDetailId: s.dealDetailId || null, leadDetailId: s.leadDetailId || null,
           contactDetailId: s.contactDetailId || null };
}

function navigateTo(page, extra) {
  _navHistory.push(_navSnapshot());
  _navFuture = [];
  var patch = Object.assign({ page: page, jobDetailId: null, dealDetailId: null,
                               leadDetailId: null, contactDetailId: null }, extra || {});
  setState(patch);
  renderPage();
}

function navBack()    { if (!_navHistory.length) return; _navFuture.push(_navSnapshot()); setState(_navHistory.pop()); renderPage(); }
function navForward() { if (!_navFuture.length)  return; _navHistory.push(_navSnapshot()); setState(_navFuture.pop()); renderPage(); }

window.navigateTo = navigateTo;
window.navBack    = navBack;
window.navForward = navForward;
```

Back/forward buttons are rendered in `renderTopBar()`. They are disabled (greyed) when the stack is empty.

**Usage pattern:** wherever a user clicks into a detail view, use `navigateTo('jobs', {jobDetailId: id})` instead of `setState({page:'jobs',jobDetailId:id}); renderPage()`. This populates history so Back works. The factory CRM job-number links use this.

---

## Console Verification Tests

Run these after a hard refresh to confirm everything wired up correctly.

```js
// 1. Stations with cadKeys
FACTORY_STATIONS_FROM_MANUAL.map(s => s.id + ' cadKeys:' + s.cadKeys.join(','))

// 2. Station renderers
['renderStnCutting','renderStnMilling','renderStnWelding',
 'renderStnHardware','renderStnReveals','renderStnDispatch']
  .forEach(fn => console.log(fn + ':', typeof window[fn]))

// 3. Navigate to production board
setState({page:'prodboard'}); renderPage();

// 4. Navigate to a station queue
setState({page:'stncutting'}); renderPage();

// 5. Reload mock factory data
loadMockFactoryData();

// 6. Open CAD on a deal (requires a deal to exist in state)
openCadDesigner('deal', getState().deals[0]?.id, 'design');

// 7. Nav history functions present
['navigateTo','navBack','navForward'].forEach(fn => console.log(fn + ':', typeof window[fn]))

// 8. Navigate to a job from factory (replace id with real job id)
navigateTo('jobs', { jobDetailId: getState().jobs[0]?.id });
```

---

## Data Flow Summary

```
User opens CAD from lead/deal/job UI
  → openCadDesigner(entityType, entityId, mode)
  → cad.html iframe opens full-screen
  → CRM listens for spartan-cad-ready
  → CRM sends spartan-cad-init with entity data
  → User designs window frames in CAD
  → User clicks Save
  → CAD sends spartan-cad-save with projectItems[] + stationTimes
  → CRM _persistToLeadOrDeal / _persistToJob
  → setState() → Supabase sync (debounced)

Admin clicks "Send to Factory" on a won/signed job
  → pushJobToFactory(jobId)
  → reads job.cadFinalData.projectItems[]
  → cadFrameToFactoryItem() for each frame (station = 'cutting')
  → saveFactoryItems() → localStorage + Supabase

Factory floor
  → renderProdBoard() — kanban, click column header → station page
  → renderStationPage('cutting') — frame queue with time budget
  → assignToStation(itemId, 'milling') — moves frame, logs history
  → ... repeat through all 6 stations ...
  → completeStation(itemId) — marks frame done
```
