# Changelog

All notable changes to SpartanCRM are recorded here. Items are grouped by date.
The most recent entries are at the top.

## 2026-05-02 — Event-delegation milestone: ~98% of inline handlers retired

### Headline numbers

| Metric | Start of session | End of session |
|---|---|---|
| Inline event handlers in target zone (excl. Jobs/CAD) | ~1,100 | **19** |
| Files with zero inline handlers | 5 | **42+** |
| `defineAction` calls registered | 0 | **600+** |
| Architectural status | Per-element `onclick="…"` strings | Single body-level delegated listener |

### Files migrated to data-action delegation (38 total this session)

**Pilot files (5):** 31-fleet-page, 46-factory-stage6-smartplanner, 14-profile, 45-factory-stage5-prodboard11, 50-factory-stage10-livefloor-settings.

**Sales CRM family (8):** 08a-sales-mobile, 08b-sales-dashboard, 08c-sales-contacts, 08d-sales-deals-kanban, 08e-sales-deal-detail, 08f-sales-deal-transitions, 08g-sales-leads-newdeal, 08h-sales-scheduler.

**Email family (5):** 11-email-page, 11a-email-compose, 11b-email-views, 11c-email-templates, 11d-email-rte, 11g-gmail-integration.

**Factory family (8):** 16a-factory-glass, 16b-factory-profile, 16c-factory-capacity, 16d-factory-pages, 16e-factory-ops, 40-factory-stage2-stock, 42-factory-dashboard-v2, 43-factory-stage3-receiving, 44-factory-stage4-orders-stocktake, 47-factory-stage7-tablet-operator, 48-factory-stage8-service-rework, 49-factory-stage9-cost-reports.

**Other (8):** 19-service-crm, 28-twilio, 13-leads-maps, 24-commission, 30-capacity-planner, 26-invoicing-page, 23-won-deals, 18-accounts-crm, 27-calendar-page, 12-settings, 05-state-auth-rbac, 10-integrations, 99-init, 14a-google-maps-real, 07-shared-ui.

### Pattern recipe

Render templates emit data attrs:
```html
<button data-action="my-action" data-foo="bar">Click me</button>
<select data-on-change="my-change-action">…</select>
<input data-on-input="my-input-action">
```

Modules register handlers once at load time:
```js
defineAction('my-action', function(target, ev) {
  doSomething(target.dataset.foo);
});
```

A single body-level listener at `07-shared-ui.js` routes click/change/input/submit events. No re-wiring on render. CSP-friendly. Testable. Idempotent attach.

### Helper-function refactor (08a-sales-mobile)

Helpers like `statMini`, `chipBtn`, `chip`, `row`, `tabHeader` previously took an `onclick` string parameter. Refactored to take `(action, dataAttrs)` instead. New `_attrsForAction(action, dataAttrs)` utility builds the kebab-cased `data-*` attribute fragment so callers pass a JS object and the helper handles the HTML escaping.

### Remaining 19 inline handlers (intentionally left)

| File | Count | Why kept |
|---|---|---|
| `05-state-auth-rbac.js` | 4 | Login form (pre-framework boot context) + admin-perm checkbox in deeply-nested helper string |
| `13-leads-maps.js` | 3 | Mobile renderers where handlers are mid-string-concat with `_esc()` — would need template restructuring |
| `08d-sales-deals-kanban.js` | 3 | Drag-drop wrapper handlers (framework doesn't dispatch drag events) + 1 simple onclick |
| `08-sales-crm.js` | 3 | Orchestrator helpers `renderNextActivityChip` and `_renderInlineRowActions` build strings emitted by sub-modules |
| `11c-email-templates.js` | 2 | False positives — string literals inside comments mentioning `oninput=` patterns |
| `07-shared-ui.js` | 2 | Helper-function output for jobLink-style cross-module string builders |
| `49-factory-stage9-cost-reports.js` | 1 | One residual sidebar nav |
| `08a-sales-mobile.js` | 1 | One residual after the helper-signature refactor |

These either (a) live in helper functions whose callers depend on the inline-string contract across module boundaries, (b) are inside string-template patterns that need broader restructuring to migrate, or (c) are false-positive matches in comments. **Event-delegation migration is declared substantively done**; residual cleanup is a separate small task if/when those modules see other refactors.

### Critical bugs caught and fixed

1. **08-sales-crm split round-1** — agent duplicated 82 functions across files. Reverted, redone with stricter discipline (round-2 verified function-count parity 173=173, zero duplicates).
2. **3 setState() syntax bugs** in stage 3/7/8 sidebar-nav handlers from cleanup agent (string-concat fragments left in real function bodies). Fixed manually.
3. **Bash sandbox file-read truncation** — `node -c` syntax checks were giving false positives on bigger files. Switched to Windows-side Read for verification.

### What's still on the menu (next sessions)

- The `getState()` caching pattern across `12-settings`, `13-leads-maps` (54+ calls per render in some files)
- DOM-query caching in `08e-sales-deal-detail` (41× `querySelector`/`getElementById`)
- The `hwPerSash` enum cleanup flagged in the audit
- Day 3 redundancy/dead-code pass

---

## 2026-05-02 — 08-sales-crm split + Day 2 performance audit

### Changed — 08-sales-crm split (round 2, successful)
`modules/08-sales-crm.js` (6,975 LOC, 173 functions) split into 9 files. Verified:
- **TOTAL function count: 173 = 173** (every original top-level function appears
  in exactly one new file, zero duplicates).
- Function name set diff vs git HEAD: empty.

| File | LOC | Functions |
|---|---|---|
| `08-sales-crm.js` (orchestrator) | 208 | 9 (shared helpers + state vars) |
| `08a-sales-mobile.js` | 1,550 | 32 |
| `08b-sales-dashboard.js` | 427 | 1 (`renderDashboard`) |
| `08c-sales-contacts.js` | 432 | 11 |
| `08d-sales-deals-kanban.js` | 587 | 15 |
| `08e-sales-deal-detail.js` | 996 | 36 |
| `08f-sales-deal-transitions.js` | 902 | 35 |
| `08g-sales-leads-newdeal.js` | 371 | 9 |
| `08h-sales-scheduler.js` | 727 | 25 |

`index.html` updated to load all 9 files in alphabetical order (orchestrator first).

### Audit — Day 2 performance pass (no code change)
Findings written to `improvement-backlog.md`. Headlines:
- **`renderJobDetail` is 1,649 LOC** (62% of `22-jobs-page.js`) — the single biggest
  function in the codebase. Top recommendation: split into per-tab renderers.
- **Caching wins**: `getState()` called 54× in `22-jobs-page.js`, 46× in
  `17-install-schedule.js`. Standard "cache at top of render fn" pattern.
- **DOM-query caching**: 41 `querySelector`/`getElementById` in `08e-sales-deal-detail`,
  38 in `13-leads-maps`.
- **Cleared as non-issues**: 6 setIntervals (all clean up), 19/4 addEventListener
  ratio (verified self-cleaning or per-render-DOM), nested forEach patterns
  (typical data sizes are fine).

---

## 2026-05-02 — Event-delegation framework + 11-email-page split

### Added
- **Event-delegation framework** in `modules/07-shared-ui.js`. A single
  body-level listener routes click/change/input/submit events to handlers
  by `data-action` (click) or `data-on-change` / `data-on-input` /
  `data-on-submit` attributes. Handlers register via `defineAction(name, fn)`.
  Idempotent attach; falls back gracefully if loaded before `document.body`.
  Coexists with existing inline `onclick="…"` handlers — migration is
  incremental.

### Changed — 11-email-page split
- `modules/11-email-page.js` (2,441 LOC kitchen-sink) split into 8 cohesive
  files (88 functions = 88 functions, verified):
  - `11-email-page.js` (orchestrator, 758 LOC) — `renderEmailPage`,
    `renderEmailMobile`, `renderEmailEmpty`, plus TODO blocks for the
    misplaced Google Maps autocomplete, `renderReports`, and Custom Fields
    code that lives in this file but doesn't belong here.
  - `11a-email-compose.js` (336 LOC), `11b-email-views.js` (233),
    `11c-email-templates.js` (402), `11d-email-rte.js` (133),
    `11e-email-signatures.js` (164), `11f-email-sanitize.js` (209),
    `11g-gmail-integration.js` (192).

### Changed — Event-delegation pilots (5 files, ~30 handlers retired)
All 5 files now have **0 inline event handlers** (only data-action attrs):
- `modules/31-fleet-page.js` (6 actions)
- `modules/46-factory-stage6-smartplanner.js` (4 actions)
- `modules/14-profile.js` (6 actions)
- `modules/45-factory-stage5-prodboard11.js` (3 actions)
- `modules/50-factory-stage10-livefloor-settings.js` (5 actions)

Pattern: render templates emit `<button data-action="my-action" data-foo="bar">`,
modules register handlers via `defineAction('my-action', function(target,ev){…})`.

### Reverted
- **08-sales-crm split attempt #1.** Agent extracted into 9 files but
  duplicated 82 functions across them (`setMobileEntityTab` ended up in 4
  files; several functions appeared twice in the same file). Restored
  `08-sales-crm.js` from git HEAD (back to 6,975 LOC, 173 functions).
  `index.html` reverted to load only the original. 8 broken sub-files
  (`modules/08[a-h]-*.js`) remain on disk as inert artifacts — the bash
  sandbox can't `rm` them; safe to delete from a Windows terminal:
  `del modules\08a-sales-mobile.js modules\08b-sales-dashboard.js …`.
  Re-attempt scheduled with stricter prompts (delete from source after
  extracting + per-run function-count verification).

### Audit results (no code change)
- **Render-loop audit** (see improvement-backlog.md): architecture is clean.
  `setState()` has a no-op guard and triggers `renderPage` via subscribe.
  9 explicit `setState();renderPage()` double-renders documented in inline
  handlers; will be fixed naturally as event-delegation migration continues.
  188 module-local-var mutations bypass setState (filter state etc.) —
  works but loses no-op-click optimization. Documented for follow-up.

---

## 2026-05-02 — Factory v1 retirement & timing-contract integration

### Removed
- **Factory v1.0/v1.5 architecture** — the entire `js/modules/factory/` directory
  (13 files, ~3,400 LOC) was retired. None of the v1 entities (`FactoryState`,
  `FactoryJob`, `FactoryFrame`, `FactoryPersistence`, `MorningGateChecklist`,
  `BOMGenerator`, `CapacityCalculator`, etc.) were ever referenced by the active
  codebase. The legacy `modules/16*, 40-50` architecture is the canonical
  factory layer going forward.
- The orphaned `tests/factory-v1-base.test.cjs` was reduced to a deprecation
  stub. Safe to delete from disk at any time.

### Relocated
- `js/modules/factory/26-cad-timing-contract.js` →
  `modules/17b-cad-timing-contract.js`. This file is **active code** that
  decorates `window.readJobInstallMinutes` (from `17-install-schedule.js`) at
  load time so the `supply_only` install-minutes override (spec §4.4) applies
  globally. It now loads via the bare-filename mechanism right after
  `17-install-schedule.js` in `index.html`.

### Added — Timing contract helpers
- `CadTimingContract.formatMinutesAsHours(min, style)` gained two new styles:
  - `'integer'` — rounded whole hours ("8h"), used for capacity labels.
  - `'padded'` — legacy zero-padded ("0h 05m" / "1h 00m"), used for capacity
    tables that need column alignment.
- `CAD_PRODUCT_LABELS` map and `formatProductType(productType, fallback)`
  helper, replacing 10 ad-hoc `productType.replace(/_/g, ' ')` call sites with
  a contract-managed map ("tilt_turn_window" → "Tilt & Turn", etc.).

### Added — Validation
- `_persistCadSave` now calls `CadTimingContract.validateStationTimes()`
  before persisting and stores the normalized 11-key shape. Console-warns +
  toasts any contract violations (stray `S_glaze`, unknown keys, non-numeric
  values) with job ID and mode for context.
- `_validateCadProjectItems` checks every frame's `productType`,
  `installationType`, and `propertyType` against the contract enums on every
  CAD save. Logs all violations in one combined toast.
- `16c-factory-capacity.js` now warns on module load if its local
  `FACTORY_STATIONS_TIMES` IDs drift from `CAD_STATION_KEYS`.

### Changed — Display consolidation (§9.6 of spec)
- `30-capacity-planner.js`, `31-fleet-page.js`, `22-jobs-page.js` —
  duplicate local `fmtHM`/`minToHM` helpers now delegate to
  `formatMinutesAsHours` (with defensive fallback). The fleet/capacity
  versions tighten display: `0h 30m` → `30m`, `1h 00m` → `1h`,
  `1h 05m` → `1h 5m`. The jobs-page version uses the new `'padded'` style
  to preserve `0h 05m` exactly.
- `16e-factory-ops.js` — production minutes table cell now uses the contract
  `'decimal'` style. Total Production hero stat now also shows days
  (`X min (Y.Y hrs · Zd)`).
- `16d-factory-pages.js` — frame-time label inline format consolidated.
- Stage capacity labels in `45/47/50-factory-stage*.js` and the Labour Hours
  KPI in `16c-factory-capacity.js` now use the `'integer'` style.

### Changed — DRY
- `_esc` (single-quote escape for inline JS strings) consolidated into
  `07-shared-ui.js`. Was duplicated 7 times across 6 files (`08-sales-crm.js`
  alone had 4 copies). All call sites now resolve to the single global via
  lexical scope.

### Cleanup
- `index.html` — removed all `js/modules/factory/*` script tags (the v1 loads
  no longer 404 on every page hit). Realigned indentation for the Stage 5–10
  factory module entries (lines 93–98).

### Drift discovered (not yet fixed)
- `16c-factory-capacity.js` `hwPerSash` map drifts from spec §3.3:
  has legacy `double_hung_window` (not in `CAD_PRODUCT_TYPES`); was missing
  `vario_slide_door` (now added with default 12 min). Annotated inline.
- Per-frame fields (`productType`, `propertyType`, `installationType`,
  `floorLevel`, `panelCount`) are persisted as JSONB inside `cadData` blobs
  rather than denormalized columns. Correctness OK; queryability gap.
