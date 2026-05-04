# SpartanCRM — Improvement Backlog

> Living document. Each daily review pass appends findings here. Do not delete entries — mark them as "done" or "wontfix" as they're addressed.

## Day 1 — Inventory (2026-05-02)

### Project overview

SpartanCRM is a browser-based CRM for Spartan Double Glazing, built as pure static HTML/JS/CSS with no build step. Originally a single 17,000-line `<script>` block, the app has been split into 76 numbered modules (01–50 + CAD subsystem + API serverless functions) that share a global namespace. Features include Sales CRM (deals, contacts, leads), Jobs CRM (workflow, scheduling, Check Measure), Factory CRM (glass/profile ordering, production queue, capacity planning), Accounts (invoicing, commission, cash flow), Services, Email/Gmail integration, Twilio voice/SMS, calendar, reports, and DocuSign signing. Data persists via Supabase with localStorage fallback.

### Tech stack & dependencies

- **Languages used:** JavaScript (vanilla ES5+ with some ES6 features), HTML5, CSS3
- **Third-party libraries (CDN):**
  - Google Sign-In (`accounts.google.com/gsi/client`)
  - jsPDF 2.5.1 (PDF generation)
  - PDF.js 3.11.174 (PDF parsing for insurance documents)
  - Supabase JS 2.x (database & realtime)
  - React 17.0.2 + ReactDOM 17.0.2 (for Recharts only; deferred load)
  - Recharts 2.12.7 (charts for Reports tab)
  - Twilio Voice SDK 2.11.0 (phone module)
  - Google Maps API (conditional load; mock fallback available)
- **Build tools / scripts:** None. Dynamic `<script>` tag loader in index.html with version-based cache busting. PowerShell audit scripts available (`audit-modules.ps1`, `audit-modules-fast.ps1`, `dep-graph.ps1`).
- **Entry points:** `index.html` (main CRM), `cad.html` (CAD sub-app iframe), serverless API endpoints in `/api/` (Twilio webhooks, email send, etc.)

### File map

```
/spartancrm
  ├── index.html                          # Main CRM entry; dynamic module loader
  ├── cad.html                            # CAD sub-application (embedded in iframe)
  ├── CONTRACT.md                         # Authoritative reference for module contracts
  ├── README.md                           # Quick setup & feature overview
  ├── CAD-INTEGRATION-GUIDE.md            # CAD system documentation
  ├── audit-modules.ps1                   # PowerShell: list all modules + LOC
  ├── audit-modules-fast.ps1              # PowerShell: fast LOC counter
  ├── dep-graph.ps1                       # PowerShell: dependency graph generator
  │
  ├── js/
  │   ├── styles.css                      # Main stylesheet (43 lines; minimal; relies on inline styles)
  │   └── modules/
  │       └── factory/                    # Factory CRM v1.0 — new modular system (13 files)
  │           ├── 16-factory-crm.js       # Renderers + audit page
  │           ├── 23-factory-helpers.js   # Protocol classes, enums
  │           ├── 24-factory-state.js     # FactoryState machine
  │           ├── 25-factory-persistence.js
  │           ├── 26-cad-timing-contract.js
  │           ├── 27–34-factory-v1-*.js   # Data models (jobs, people, stock, workstations, suppliers, audit, CAD bridge, station pages)
  │           └── ...
  │
  ├── modules/
  │   ├── Core (1–7): 01-persistence.js, 02-mock-data.js, 02a/b/c-mock-*.js, 03-jobs-workflow.js, 04-cad-integration.js, 05-state-auth-rbac.js, 07-shared-ui.js
  │   ├── Sales CRM (8–13): 08-sales-crm.js, 09-reports.js, 10-integrations.js, 11-email-page.js, 12-settings.js, 13-leads-maps.js
  │   ├── Jobs CRM (15–22): 14-profile.js, 15-jobs-crm.js, 17-install-schedule.js, 20-job-settings.js, 21-cm-schedule.js, 22-jobs-page.js, 23-won-deals.js
  │   ├── Factory (16, 16a–e, 40–50): 16-factory-crm.js + subsystems + stage-based modules
  │   ├── Accounts & Financial (18, 24–26): 18-accounts-crm.js, 24-commission.js, 25-invoicing.js, 26-invoicing-page.js
  │   ├── Services (19): 19-service-crm.js
  │   ├── Integrations (28–29): 28-twilio.js, 29-docusign.js
  │   ├── Calendar & Planning (27, 30–31): 27-calendar-page.js, 30-capacity-planner.js, 31-fleet-page.js, 31a-vehicle-insurance.js
  │   ├── Utilities (14, 14a, 06): 14-google-maps-mock.js, 14a-google-maps-real.js, 06-email-tracking.js
  │   └── CAD sub-system (cad_modules/): 44 files (00-react-prelude to 40-smoke-tests-bootstrap)
  │       ├── 01-data-products.js through 15-check-measure-helpers.js
  │       ├── 16-finalisation-helpers.js through 22a-profile-cutlist.js
  │       └── 23-cutlist-xlsx.js through 40-smoke-tests-bootstrap.js
  │   └── 99-init.js                      # Boot & master dispatcher (MUST LOAD LAST)
  │
  ├── api/
  │   ├── email/
  │   │   └── send.js                     # Serverless email endpoint
  │   ├── twilio/
  │   │   ├── dial.js, hangup.js, incoming.js, ivr-route.js
  │   │   ├── recording.js, recording-stream.js
  │   │   ├── sms.js, sms-incoming.js, sms-status.js
  │   │   ├── status.js, token.js, voice.js, voicemail.js
  │   │   └── ...
  │   └── _lib/
  │       ├── auth.js, activities.js, businessHours.js, entityLookup.js
  │       ├── phone.js, phoneSettings.js, ...
  │       └── (shared serverless utilities)
  │
  ├── supabase/
  │   ├── migrations/
  │   └── DOCUSIGN_DEPLOYMENT.md          # DocuSign integration notes
  │
  ├── docs/
  │   ├── pipedrive-replacement-plan.md   # High-level product roadmap (Phases 1–9)
  │   └── migrations/                     # Data migration scripts / notes
  │
  └── tests/
      ├── *.test.cjs                      # Jest test files (commission, audit, CAD timing, factory v1)
      ├── fixtures/
      │   └── sample-insurance.html       # Test fixture for PDF parsing
      └── sanitize-html.test.html         # HTML sanitization test (manual)
```

### Module inventory

| # | File | LOC | Exports/Globals | Purpose |
|---|---|---|---|---|
| 01 | 01-persistence.js | 1283 | `_sb`, `initSupabase()`, `dbLoadAll()`, `setupRealtime()`, `dbUpsert()`, `jobToDb/dbToJob`, `contactToDb/dbToContact`, etc. | Supabase client init, realtime sync, entity field mapping (camelCase ↔ snake_case) |
| 02 | 02-mock-data.js | 334 | `DEALS`, `CONTACTS`, `NOTIFS`, `LEADS_DATA`, `EMAIL_INBOX_SEED`, `EMAIL_SENT_SEED`, `DEFAULT_*_FIELDS`, `DEFAULT_*_STATUSES` | Seed data for all entities (copied into `_state` on boot) |
| 02a | 02a-mock-factory-data.js | 132 | Factory mock seed objects | Mock jobs, materials, workstations for factory CRM |
| 02b | 02b-mock-stock-data.js | 147 | Stock/inventory mock data | Mock glass, profiles, hardware, consumables |
| 02c | 02c-mock-operator-data.js | 38 | Operator shift data | Mock shifts, crew assignments |
| 03 | 03-jobs-workflow.js | 444 | `JOB_STATUSES`, `canTransitionJobStatus()`, `getBlockedReason()`, `createJob()`, `updateJob()`, job-window helpers, 45% invoice auto-generation | Job status gate logic, job CRUD, workflow enforcement |
| 04 | 04-cad-integration.js | 445 | `SPARTAN_CAD_B64` (2 MB base64), `openCAD()`, `openReadOnlyCAD()`, `addQuoteToDeal()`, multi-quote helpers, postMessage bridge | CAD app iframe lifecycle, quote management, CAD↔CRM postMessage handler |
| 05 | 05-state-auth-rbac.js | 1271 | `_state`, `getState()`, `setState()`, `subscribe()`, `getCurrentUser()`, `canEdit()`, `isAdmin()`, `addToast()`, `ALL_ROLES`, `DEFAULT_PERMISSIONS`, audit log helpers | Single source of truth (state machine), auth/RBAC matrix, audit trail (primitive phase) |
| 06 | 06-email-tracking.js | 240 | `pollEmailOpens()`, tracking pixel handlers | Email open polling, notification generation |
| 07 | 07-shared-ui.js | 742 | `Icon()`, `Badge()`, `StatusBadge()`, `renderSidebar()`, `renderTopBar()`, `renderModuleBar()`, `renderToasts()`, `MODULE_BAR_HEIGHT` | SVG icons, shared UI components, nav bar renderers |
| 08 | 08-sales-crm.js | 6975 | `renderDashboard()`, `renderDeals()`, `renderContacts()`, `renderEntityDetail()`, kanban logic, `renderDealDetail()`, `renderLeadDetail()`, `renderContactDetail()`, Schedule Activity modal, deal actions, Step-4 Won Flow | Dashboard, deals kanban, contact/lead/deal detail pages, activity scheduling |
| 09 | 09-reports.js | 805 | `renderReports()`, `renderReportBuilder()`, Recharts integration | Report builder UI, data computation, bar/line/pie chart rendering |
| 10 | 10-integrations.js | 1004 | `gmailInit()`, `autoRestoreGmail()`, `gmailSend()`, `gmailSyncInbox()`, `gmailSyncSent()`, Google Calendar OAuth, `loadGoogleMaps()`, `attachAllAutocomplete()` | Gmail integration (OAuth, send, sync), Google Calendar CRUD, Google Maps autocomplete setup |
| 11 | 11-email-page.js | 2441 | `renderEmailPage()`, `renderEmailList()`, `renderEmailDetail()`, `renderEmailComposer()`, template system, tracking UI, `emailCloseCompose()` | Email app (inbox, detail, composer), HTML email template system |
| 12 | 12-settings.js | 1146 | `renderSettings()`, `addCustomField()`, `deleteCustomField()`, `addCustomStatus()`, `reorderStatus()`, RBAC editor UI | Settings page: custom fields, custom statuses, RBAC editor, API key management |
| 13 | 13-leads-maps.js | 1579 | `renderLeads()`, `renderMapPage()`, `renderAddLeadDrawer()`, smart proximity scheduling, suburb lookup | Leads list + map view, proximity-based schedule clustering, suburb geocoding |
| 14 | 14-google-maps-mock.js | 332 | `initGoogleMaps()`, `refreshMapData()` (mock stubs) | Fallback map renderer when API unavailable or key missing |
| 14a | 14a-google-maps-real.js | 853 | Real Google Maps implementation (wraps 10-integrations.js) | Loads after email-page to wrap real onGoogleMapsLoaded |
| 14 | 14-profile.js | 220 | `renderProfilePage()`, `toggleProfileDrop()`, password change | User profile page + dropdown menu |
| 15 | 15-jobs-crm.js | 335 | `renderJobDashboard()` | Job CRM landing page / dashboard |
| 16 | 16-factory-crm.js | 147 | Core factory state, mutators, constants | Factory CRM base definitions |
| 16a | 16a-factory-glass.js | 152 | Glass ordering subsystem | Glass specification & ordering UI |
| 16b | 16b-factory-profile.js | 117 | Aluplast profile ordering | Profile specification & ordering |
| 16c | 16c-factory-capacity.js | 324 | `renderFactoryCapacity()`, capacity engine, planner | Capacity calculation & planning UI |
| 16d | 16d-factory-pages.js | 242 | `renderFactoryDash()`, `renderProdQueue()`, page renderers | Factory page renderers (combines subsystems) |
| 16e | 16e-factory-ops.js | 793 | Stage 1 ops: Jobs to Review, QC checklist, Bay Management, Hold/Variation | Factory operations UI (early stage) |
| 17 | 17-install-schedule.js | 2514 | `renderInstallSchedule()`, `renderCapacityPlanning()`, scheduler week/day views, drag handlers, `readJobInstallMinutes()`, `crewEffectiveMinutes()`, `recommendVehicleForJob()` | Install scheduling, drag-to-assign, smart crew/vehicle recommendations |
| 18 | 18-accounts-crm.js | 210 | `renderAccDash()`, outstanding/cash-flow/recon/bills/weekly/branch/Xero pages | Accounting pages (dashboards, reconciliation, Xero export) |
| 19 | 19-service-crm.js | 417 | `renderServiceList()`, `renderServiceMap()`, `renderSvcSchedule()` | Service calls list, map view, scheduling |
| 20 | 20-job-settings.js | 784 | `renderJobSettings()` | Job-specific defaults (separate from Sales CRM settings) |
| 21 | 21-cm-schedule.js | 361 | `renderCMMapPage()` | Check Measure proximity booking scheduler |
| 22 | 22-jobs-page.js | 2633 | `renderJobsPage()`, job detail, `renderFinalSignOff()` | Jobs list, detail page, sales-manager approval queue |
| 23 | 23-won-deals.js | 263 | `renderWonPage()` | Won deals page |
| 24 | 24-commission.js | 2826 | `renderCommissionPage()`, commission calculation engine, payrun logic | Commission tracking, calculation, payrun management |
| 25 | 25-invoicing.js | 515 | Progress-claim logic, `createInvoiceFromDeal()`, `updateClaimPercentage()`, `sendReminder()`, `checkAutoReminders()`, Xero export, PDF generation | Invoice generation, progress claims, auto-reminders, Xero sync |
| 26 | 26-invoicing-page.js | 165 | `renderInvoicingPage()`, `renderDealInvoiceSection()` | Invoice page renderer |
| 27 | 27-calendar-page.js | 828 | `renderCalendarPage()`, `renderCalEventModal()`, `renderCalendarCreateModal()`, `renderCalendarWidget()`, `calOpenEventByIndex()` | Calendar UI, event CRUD, Google Calendar sync |
| 28 | 28-twilio.js | 1510 | `twilioInit()`, `gmailToTwilio()`, phone UI, SMS UI, voice call handlers | Twilio Voice & SMS integration, phone tab, call/SMS rendering |
| 29 | 29-docusign.js | 636 | `renderDocuSign()`, envelope management, signature workflows | DocuSign envelope creation, signing UI, status tracking |
| 30 | 30-capacity-planner.js | 440 | `renderCapacityPlannerPage()` | Capacity planner page (uses readJobInstallMinutes from 17) |
| 31 | 31-fleet-page.js | 237 | `renderFleetPage()` | Fleet management page |
| 31a | 31a-vehicle-insurance.js | 256 | `parseInsurancePdf()`, `renderVehicleInsurance()` | Vehicle insurance PDF upload & parsing (uses PDF.js) |
| 40 | 40-factory-stage2-stock.js | 549 | Stage 2 stock ordering UI | Factory Stage 2: stock allocation & ordering |
| 42 | 42-factory-dashboard-v2.js | 393 | v2 factory dashboard | Revised factory dashboard layout |
| 43 | 43-factory-stage3-receiving.js | 437 | Stage 3 goods receipt | Factory Stage 3: receiving & QC |
| 44 | 44-factory-stage4-orders-stocktake.js | 724 | Stage 4 order/stocktake | Factory Stage 4: orders & inventory |
| 45 | 45-factory-stage5-prodboard11.js | 371 | Stage 5 production board | Factory Stage 5: production scheduling |
| 46 | 46-factory-stage6-smartplanner.js | 434 | Stage 6 smart planner | Factory Stage 6: intelligent scheduling |
| 47 | 47-factory-stage7-tablet-operator.js | 462 | Stage 7 tablet interface | Factory Stage 7: operator tablet UI |
| 48 | 48-factory-stage8-service-rework.js | 323 | Stage 8 rework/service | Factory Stage 8: rework & service |
| 49 | 49-factory-stage9-cost-reports.js | 506 | Stage 9 cost analysis | Factory Stage 9: cost reporting |
| 50 | 50-factory-stage10-livefloor-settings.js | 482 | Stage 10 live floor settings | Factory Stage 10: live floor configuration |
| 99 | 99-init.js | 306 | `renderPage()` (master dispatcher), global keyboard shortcuts, outside-click dismissal, boot sequence | **MUST LOAD LAST** — contains `pageRenderers` map for all routes |
| — | **CAD sub-system** (modules/cad_modules/) | **~11,800 total** | React JSX compiled to JS; 44 modules from data products to smoke tests | Quote generation, PDF/DXF export, 3D geometry, profile specs, hardware builders, signing UI, animations, finalisation flows |

**Total JS LOC (excluding CAD): ~42,123 (modules/ only) + ~11,800 (cad_modules/) = ~53,923 lines**

### HTML / CSS inventory

| File | LOC | Purpose |
|---|---|---|
| `index.html` | 241 | Main CRM entry; dynamic `<script>` tag loader, Supabase config, CDN library loads (React, Recharts, Twilio, PDF.js, Google Sign-In) |
| `cad.html` | ? | CAD sub-app (iframe target) |
| `js/styles.css` | 43 | Minimal stylesheet; majority of styling is inline in render functions |
| `tests/sanitize-html.test.html` | ? | Manual HTML sanitization test fixture |
| `tests/fixtures/sample-insurance.html` | ? | HTML fixture for PDF parsing tests |

### Notable observations

1. **Monolithic global namespace.** All 50+ modules inject functions and variables into the global scope. No module system, imports, or closures. Every module sees every other module's globals. Load order in `index.html` is critical: dependencies must load before dependents.

2. **Critical load-order dependencies:**
   - `02-mock-data.js` must load before `05-state-auth-rbac.js` (state copies seed data on init).
   - `05-state-auth-rbac.js` must load before all other modules (defines `_state`, `getState()`, `setState()`).
   - `07-shared-ui.js` must load before modules that use `Icon()`, `Badge()`, `renderSidebar()`, etc.
   - `99-init.js` **must load last** (contains `pageRenderers` map for routing).

3. **Massive single file problem.** Module 08 (sales-crm.js, 6,975 LOC) and 11 (email-page.js, 2,441 LOC) are monoliths. Module 08 has ~5 natural seams (dashboard, deals list, detail pages, tab renderer, deal actions).

4. **CAD sub-system is isolated.** 44 files in `/modules/cad_modules/` form a separate React-based subsystem. Index.html does NOT load CAD modules directly; the CAD app is an iframe (cad.html) with its own entry point. CAD code communicates with CRM via postMessage. This is good architectural isolation but creates a hidden dependency that CONTRACT.md doesn't fully document.

5. **Event handlers via string attributes.** Hundreds of `onclick="foo()"` in HTML strings rely on functions being in the global scope. If a function is refactored into a closure, all these handlers break silently.

6. **Two factory architectures.** Modules 16/16a–e are the legacy split (line-by-line from original monolith). Modules 40–50 + `/js/modules/factory/` are a new modular Factory CRM v1.0 with classes (FactoryState, FactoryJob, FactoryFrame, etc.). Both coexist in the same app, creating confusion about which system is canonical.

7. **Multiple render loops.** Most renders use `setState()` → `subscribe()` → `renderPage()` → route dispatch. But some modules (e.g., CAD, integrations) have side effects or deferred DOM updates via `setTimeout()` and element-level `addEventListener()` after render. This can cause stale DOM bugs if renders overlap.

8. **CSS is minimal.** Only 43 lines in `styles.css`. Styling is predominantly inline (`style="..."` attributes) in render functions, making it very hard to extract or re-theme globally.

9. **No package.json / build.** This is a pure static app served directly from disk or a simple HTTP server. No npm, no bundler, no transpilation. CDN libraries are loaded with `<script>` tags. This is good for simplicity but means you can't use npm packages locally and version management relies on SemVer in CDN URLs.

10. **Module numbering gaps.** Modules jump from 15 to 16, then 16 → 16a/b/c/d/e (subsystems), then 17 → 18, etc. Gaps exist: no 05.5, no 15.5. The numbering scheme encodes logical grouping but is fragile (inserting a new module requires renumbering everything after it).

11. **Duplicate declarations flagged in CONTRACT.md.** `ALL_ROLES` is declared twice in 05-state-auth-rbac.js (around original lines 1986 and 2078). Second declaration silently overwrites the first. Harmless today but a code smell.

12. **CAD payload is a 2 MB single line.** Module 04 embeds `SPARTAN_CAD_B64` as one massive base64 string (~2 million characters on a single line). Editors struggle; any accidental newline in the middle breaks the string.

13. **Tests are present but minimal.** Jest test files exist for commission, audit, CAD timing, and factory v1. No coverage metrics visible. Manual test HTML file for sanitization.

14. **API directory is serverless.** `/api/` contains Twilio webhook handlers and email service endpoints (Vercel/Netlify/AWS Lambda compatible). Not part of the main CRM but tightly integrated (webhook callbacks expect CRM routes to exist).

15. **Supabase is hardcoded.** Connection string and anon key are in index.html (lines 42–44). This is public/anon key (OK for Supabase policy), but the URL is exposed in client code.

16. **No error boundary or graceful degradation.** If a module fails to load (404, parse error), the loader console.logs the error but continues. Silent failures are possible if a downstream module assumes a global that never loaded.

### Open questions for Graham

1. **Factory CRM architecture:** Should the legacy modules (16/16a–e) be preserved for backward compatibility, or migrate everything to the new v1.0 system (40–50 + `/js/modules/factory/`)? What's the migration strategy?

2. **Module naming chaos:** Why does module 14 exist as both `14-profile.js` and `14-google-maps-mock.js`? How should new modules be numbered to avoid conflicts?

3. **CAD iframe isolation:** Is it intentional that CAD modules are not listed in index.html's module loader? How is `cad.html` versioned and deployed separately from the main app?

4. **Inline styling:** Is there a plan to extract CSS out of render functions into a stylesheet? Current approach makes re-theming and maintenance very difficult.

5. **Event handler naming:** Are you aware of the `onclick="foo()"` fragility? Should we refactor event attachment to use `.addEventListener()` instead, or is the string-based approach intentional for simplicity?

6. **Load-order documentation:** CONTRACT.md is excellent, but should the comments in index.html (Layer 1–12) be more strictly enforced? E.g., with a linter that validates script order?

7. **Test coverage:** What's the target coverage for the tests in `/tests/`? Currently only 5–6 test files exist. Should we expand CI/CD to run them on deploy?

8. **API security:** The serverless API endpoints in `/api/` are not visible in the main module loader. How are they version-controlled and deployed relative to the main app?

---

## Factory Architecture Migration Plan (2026-05-02)

> Goal: consolidate the abandoned `js/modules/factory/` v1.0 directory (13 files, ~3.4k LOC) into the legacy `modules/16*, 40-50` architecture that Graham has been actively developing. No code is being deleted yet — this is the step-by-step plan to follow.

### Current state summary

- **Legacy architecture (active):** Modules 16-factory-crm.js, 16a (glass), 16b (profile), 16c (capacity), 16d (pages), 16e (ops), plus stage-based 40-50 (stock, receiving, orders, production, planner, tablet, rework, cost, settings). These are all in `/modules/` and are **actively loaded and used by index.html** (lines 83-98).

- **v1.0 architecture (abandoned):** 13 files in `js/modules/factory/` (24-, 25-, 23-factory-state.js; 27-34-factory-v1-*.js; 26-cad-timing-contract.js; 16-factory-crm.js; 34-factory-station-pages.js). These **ARE loaded by index.html** (lines 107-121, 166) but **none of their globals are ever referenced** anywhere in the active codebase. They define classes like `FactoryState`, `FactoryJob`, `FactoryFrame`, etc., that are never instantiated or called.

- **Overlap & confusion:** Both architectures coexist in the same app at runtime. The v1.0 files export rich data-model classes and enums, while the legacy modules export render functions (`renderFactoryDash`, `renderProdQueue`, etc.) that are wired into 99-init.js. The v1.0 code appears to be a "Phase 1" foundation for a future refactor that was never completed.

- **Size:** Legacy factory (modules/16-50) = ~4.8k LOC; v1.0 (js/modules/factory/) = ~3.4k LOC. Total factory code = ~8.2k.

### Inventory: js/modules/factory/ (removal-target architecture)

| File | LOC | Loaded by index.html | Inbound refs from legacy modules | Category |
|---|---|---|---|---|
| 16-factory-crm.js | 449 | Y (line 110) | N | DEAD |
| 23-factory-helpers.js | 588 | Y (line 109) | N | DEAD |
| 24-factory-state.js | 157 | Y (line 107) | N | DEAD |
| 25-factory-persistence.js | 190 | Y (line 108) | N | DEAD |
| 26-cad-timing-contract.js | 372 | Y (line 166) | N | KEEP-RELOCATE |
| 27-factory-v1-jobs-frames.js | 260 | Y (line 114) | N | DEAD |
| 28-factory-v1-people.js | 181 | Y (line 115) | N | DEAD |
| 29-factory-v1-stock.js | 254 | Y (line 116) | N | DEAD |
| 30-factory-v1-workstations-tasks.js | 359 | Y (line 117) | N | DEAD |
| 31-factory-v1-suppliers.js | 205 | Y (line 118) | N | DEAD |
| 32-factory-v1-audit.js | 400 | Y (line 119) | N | DEAD |
| 33-factory-v1-cad-bridge.js | 166 | Y (line 120) | N | DEAD |
| 34-factory-station-pages.js | 203 | Y (line 121) | N | DEAD |

**Category definitions:**
- **DEAD** = not referenced anywhere in codebase, not instantiated, not called; safe to delete once removed from index.html
- **SALVAGE** = contains logic that may have value for future refactors, but is not currently used; read before deletion to extract any relevant patterns

### Cross-references map

Grep results confirm: **zero references** from the active codebase (`modules/*.js`, `tests/`, `api/`) to anything in `js/modules/factory/`.

**Verified search queries:**
- `FactoryState|FactoryPersistence|FactoryJob|FactoryFrame|MorningGateChecklist|DispatchChecklist|ServiceTriageJob|RedTag|HoldVariation|BOMGenerator|CapacityCalculator|KlaesOrderPair` — No matches in any .js file
- `new FactoryJob|new FactoryFrame|new FactoryState|FactoryPersistence\.|_factoryState|getFactoryState` — No matches
- `js/modules/factory|FactoryV1|factory-v1` in `modules/*.js` — No matches

**Conclusion:** The v1.0 files are orphaned. They load successfully (no 404 in index.html), but the app works identically whether they are present or absent.

### Migration steps (execute in this order)

#### Step 1: Verify app works with v1.0 code commented out in index.html (EXCEPT 26-cad-timing-contract.js)
- **What:** Comment out script tags in index.html that load `js/modules/factory/*` (lines 107-121 only — NOT 166). The 26-cad-timing-contract.js file at line 166 must stay active because it decorates readJobInstallMinutes. Leave the load order intact by placing comments. Test the app to confirm all factory pages still load and render correctly.
- **Files touched:** `index.html` (lines 107-121, 166 commented but not deleted)
- **Risk:** Medium — if there are hidden references we missed, they will surface here (e.g., a render function called from a nav menu, an event handler, a test file we didn't scan).
- **Verification:** Open the app in Chrome, navigate to each factory page (Factory Dashboard, Production Queue, Production Board, Capacity, Dispatch, Audit, Jobs to Review, QC, Bay Management, Stage 2-10 pages). Confirm they all render and respond to input. Check browser console for any "ReferenceError: FactoryX is not defined" or similar.
- **Rollback:** Uncomment the lines in index.html and reload.

#### Step 2: Create a temporary "factory-v1-archive" branch or backup directory
- **What:** Before deleting, create a git branch named `factory-v1-archive` or copy the entire `js/modules/factory/` directory to `/archive/factory-v1-backup/` as a safety net. This lets us recover any code if a future refactor needs it, and creates a paper trail in git log.
- **Files touched:** git or filesystem only; no source code changes
- **Risk:** Low — purely defensive.
- **Verification:** Run `git log --oneline | head -5` to confirm the branch exists, or `ls -la archive/factory-v1-backup/` to confirm the backup is present.
- **Rollback:** Delete the branch (`git branch -d factory-v1-archive`) or the backup directory.

#### Step 3: Remove js/modules/factory/ from index.html load order
- **What:** Delete the 7 commented-out script tags from Step 1 (lines 107-121, 166 in index.html). Do NOT yet delete the actual files on disk.
- **Files touched:** `index.html` only
- **Risk:** Low — reversible one-line edit.
- **Verification:** Reload the app. Confirm all factory pages still render. Check that the DevTools Network tab no longer shows any 404s for files in `js/modules/factory/`.
- **Rollback:** Restore the 7 `<script>` tags to index.html and reload.

#### Step 4: Identify any test files that reference v1.0 and update them
- **What:** Check `/tests/` for any `.test.cjs` or `.test.html` files that import or instantiate v1.0 classes. If found, either (a) remove the test file if it only tests v1.0 orphaned code, or (b) rewrite it to test the legacy architecture instead.
- **Files touched:** `/tests/factory-v1-base.test.cjs` (if it exists and only tests v1.0)
- **Risk:** Low — test files are not part of the deployed app.
- **Verification:** Run `npm test` (if Jest is configured) or manually review `/tests/` directory. Confirm no test imports `FactoryState`, `FactoryJob`, etc.
- **Rollback:** Restore the test file from git or the backup branch.

#### Step 5: Verify 26-cad-timing-contract.js is truly orphaned (salvage review)
- **What:** This file (372 LOC) is marked SALVAGE because the name suggests it might decorate or bridge to the CAD integration. Read through it to confirm it doesn't export anything used by the active factory modules or CAD integration (04-cad-integration.js, cad_modules/). Check for any functions that are called from legacy modules.
- **Files touched:** None (read-only)
- **Risk:** Low — informational only.
- **Verification:** Search codebase for any reference to function names exported by 26-cad-timing-contract.js. If zero matches, mark it for deletion. If any matches, document the reference and reconsider deletion.
- **Rollback:** N/A — no changes made.

#### Step 5b: Move js/modules/factory/26-cad-timing-contract.js → modules/17b-cad-timing-contract.js
- **What:** Move 26-cad-timing-contract.js out of the factory/ directory to modules/17b-cad-timing-contract.js (right after 17-install-schedule.js). Update index.html line 166 from `'js/modules/factory/26-cad-timing-contract.js'` to `'17b-cad-timing-contract.js'` so it loads via the bare-filename mechanism (lines 219-221 of index.html normalize filenames without path separators to load from modules/). The file is active code (decorates readJobInstallMinutes via IIFE at lines 348-372), so it must load after 17-install-schedule.js and before any module that calls readJobInstallMinutes.
- **Files touched:** index.html (line 166), and move file from js/modules/factory/ to modules/
- **Risk:** Medium — if the path change breaks the load sequence, install scheduling will fail. Must verify that readJobInstallMinutes is correctly wrapped after load.
- **Verification:** Reload app, navigate to Install Schedule and Capacity Planner pages. Confirm readJobInstallMinutes still works and the supply_only override is active. Check browser console for any "ReferenceError: CadTimingContract is not defined" or "readJobInstallMinutes is not a function".
- **Rollback:** Restore index.html line 166 to the old path and move file back to js/modules/factory/.

#### Step 6: Delete js/modules/factory/ directory (minus 26-cad-timing-contract.js, already moved in Step 5b)
- **What:** Delete the entire `js/modules/factory/` directory from disk, excluding 26-cad-timing-contract.js (which was relocated to modules/ in Step 5b). This removes 12 remaining v1.0 files permanently. Keep the backup branch or `/archive/factory-v1-backup/` available for 30 days in case a developer needs to recover code.
- **Files touched:** Deletion of `js/modules/factory/` and all files inside EXCEPT 26-cad-timing-contract.js (by then already moved out)
- **Risk:** High — irreversible without git revert or the backup. But safe because Step 1 confirmed the app works without these files.
- **Verification:** Run `ls -la js/modules/factory/ 2>&1 | head -1` — should error with "No such file or directory". Reload the app and re-test all factory pages.
- **Rollback:** Restore from backup: `cp -r archive/factory-v1-backup/ js/modules/factory/` (if using directory backup), or `git checkout factory-v1-archive -- js/modules/factory/` (if using git branch)

#### Step 7: Final smoke test and code review
- **What:** Load the app in a fresh browser session (hard refresh, clear cache). Navigate through all factory-related pages (dashboard, queues, stages 2-10, ops pages). Confirm navigation, sorting, filtering, and form submissions all work. Run any existing Jest tests. Have a teammate briefly review the index.html changes.
- **Files touched:** None
- **Risk:** Low — purely verification.
- **Verification:** Sign-off checklist (below).
- **Rollback:** If any issues, revert the deletion, restore index.html from git, and re-run Step 1 to isolate the problem.

### Decisions Graham needs to make before executing

1. ~~**Is 26-cad-timing-contract.js truly orphaned, or is it decorating readJobInstallMinutes()?**~~ **CONFIRMED: 26-cad-timing-contract.js is ACTIVE code.** The file defines a CadTimingContract class and IIFE decoration (lines 348-372) that wraps window.readJobInstallMinutes to apply the supply_only override per audit §4.4. The decoration is live — checked at module load time. Step 5b moves it to modules/17b-cad-timing-contract.js.

2. **Should the "factory v1 Phase 1" code be preserved in a git branch for historical / future reference, or just deleted?** The v1.0 architecture defines a comprehensive data model (FactoryJob, FactoryFrame, FactoryState, enums, etc.) that may be useful if the factory CRM is ever refactored to use classes instead of global state. Decision: Create a dedicated branch `factory-v1-reference` off the current HEAD before Step 2, push it, and document it in a comment in the root README so future developers know where to find the design if they want to resurrect it.

### Verification checklist (run after migration is complete)

- [ ] index.html contains zero references to `js/modules/factory/` (grep confirms)
- [ ] cad.html (if it loads modules) contains zero references to `js/modules/factory/`
- [ ] No 404 errors in DevTools Network tab for any `js/modules/factory/*` files
- [ ] Factory Dashboard loads and renders (manual smoke test)
- [ ] Production Queue loads and renders
- [ ] Production Board loads and renders
- [ ] All Stage 2-10 pages load and render
- [ ] Ops pages (Jobs to Review, QC, Bay Management) load if they exist
- [ ] Form submissions and data mutations work (e.g., change a status, reorder stock, submit a form)
- [ ] jest tests pass (if applicable): `npm test 2>&1 | grep -i "pass\|fail"`
- [ ] Zero console errors on app startup and page transitions
- [ ] Supabase realtime updates still work (e.g., a second browser updates the first)
- [ ] `ls -la js/modules/factory/` returns "No such file or directory" or similar 404
- [ ] git log shows the deletion commit with a clear message

---

## Timing Contract Integration Audit (2026-05-02)

> The contract at modules/17b-cad-timing-contract.js (relocated from js/modules/factory/26-cad-timing-contract.js) provides validators, helpers, enums, and a decoration of readJobInstallMinutes. The decoration is live; the rest is not yet consumed. This audit walks §9 of spartan-cad-timing-audit.md and identifies the concrete legacy-module changes needed to honor each action item.

### What's already wired

1. **CAD save → job persistence (§9.1 partial).** The save handler (modules/04-cad-integration.js:342-374) persists `estimatedInstallMinutes`, `estimatedProductionMinutes`, and `stationTimes` as top-level job fields. These are read verbatim from the CAD payload's `totals` object. Database mapping in modules/01-persistence.js (lines 36-38, 80-82) round-trips these as `estimated_install_minutes`, `estimated_production_minutes`, and `station_times` (JSON column).

2. **supply_only override on schedule reads (§9.3).** The CadTimingContract class decorates `readJobInstallMinutes()` at module load (IIFE lines 348-372). The wrap checks `frame.installationType === 'supply_only'` and returns 0 for those frames. Every call to `readJobInstallMinutes(job)` — including from modules/30-capacity-planner.js:93, modules/17-install-schedule.js:658 — now applies the override without touching call sites.

3. **Per-frame productType stored in CAD blobs (§9.1 partial).** The projectItems array within cadData/cadSurveyData/cadFinalData carries the full 12-value productType from the CAD save (audit §2). The CRM persists these as JSONB in cad_data / cad_survey_data / cad_final_data columns. Readable via job.cadData.projectItems[i].productType and used by factory modules (16a, 16c, 16e) when building orders and capacity estimates.

### Gap audit — §9 action items vs. legacy CRM

#### §9.1 — Persist these per-frame fields verbatim from each projectItems[i]
- **Spec requirement:** Store productType (12-value, not collapsed), installMinutes, productionMinutes, propertyType, installationType, floorLevel, panelCount, surveyMeasurements from the CAD payload without recomputing.
- **Legacy CRM today:** 
  - Top-level job fields: estimatedInstallMinutes, estimatedProductionMinutes, stationTimes (persisted from totals; lines 04-cad-integration.js:364-366)
  - Per-frame data: productItems array stored as JSONB within cadData/cadSurveyData/cadFinalData (01-persistence.js:31,35,77,79)
  - Per-frame timing: installMinutes, productionMinutes present in projectItems (CAD save spec §5); no explicit schema for propertyType, installationType, floorLevel, panelCount on design_items table
  - Survey data: surveyMeasurements array present in cadSurveyData.surveyMeasurements (04-cad-integration.js:354-355)
- **Gap:** The per-frame fields (propertyType, installationType, floorLevel, panelCount) are stored only within the JSONB blobs, not as dedicated columns on a design_items table. This is fine for CRM display, but factory planning (modules 16a–e) must extract these from cadData.projectItems — they cannot query by frame-level productType or installationType. If future SQL analysis needs to aggregate "all bifold doors across all jobs," the query must json_extract cadData.projectItems[*].productType, which is slow.
- **Fix:** Low priority. The JSONB storage is sufficient for current use cases. If frame-level queries become common, consider denormalizing onto a design_items table with columns: id, job_id, frame_id, product_type, installation_type, property_type, floor_level, panel_count, install_minutes, production_minutes, created_at. For now, document that factory modules should use CadTimingContract.getFrameInstallMinutes() / getFrameProductionMinutes() to read frame-level timing from the persisted cadData snapshot.
- **Risk:** Low — current design works; optimization can be deferred.
- **Effort:** S (if deferred) / M (if implementing design_items table now)

#### §9.2 — Persist these totals from totals object
- **Spec requirement:** Store totals.installMinutes, totals.productionMinutes, and all 11 keys from totals.stationTimes at the job level.
- **Legacy CRM today:** Top-level fields estimatedInstallMinutes, estimatedProductionMinutes, stationTimes (modules/04-cad-integration.js:364-366; modules/01-persistence.js:36-38, 80-82). The stationTimes object (S1_saw, S2_steel, etc.) is persisted as JSON on the job.
- **Gap:** Was none for storage; small one for trust — there was no validation that the incoming `stationTimes` actually conformed to the 11-key contract (no stray `S_glaze`, no unknown keys, all values numeric/non-negative).
- **Fix:** ✅ **Done 2026-05-02** — `modules/04-cad-integration.js:366` now calls `CadTimingContract.validateStationTimes()` before persisting, console-warns + toasts any violations (with job ID and mode for context), and persists `CadTimingContract.normalizeStationTimes()` so the canonical 11-key shape is what hits state. Falls back to the old raw assignment if the contract module didn't load.
- **Risk:** None.
- **Effort:** Complete.

#### §9.3 — For supply-only frames, locally override installMinutes to 0
- **Spec requirement:** If projectItem.installationType === 'supply_only', zero out installMinutes locally and re-aggregate totals.installMinutes. This is a pending CAD fix; CRM must handle it client-side.
- **Legacy CRM today:** The CadTimingContract.decorateInstallMinutesReader() IIFE (lines 348-372) wraps readJobInstallMinutes. Every call to readJobInstallMinutes(job) that goes through the global function now checks the cadData snapshot and applies the supply_only override. Modules/17-install-schedule.js, modules/30-capacity-planner.js, and any other code calling readJobInstallMinutes benefit from this automatically.
- **Gap:** None — override is live and transparent. Call sites do not need changes.
- **Fix:** N/A.
- **Risk:** None.
- **Effort:** Complete.

#### §9.4 — Do not recompute production or install minutes from frame_type / dimensions
- **Spec requirement:** Never derive productionMinutes or installMinutes from frame dimensions or the collapsed frame_type enum. Trust the CAD-provided values only.
- **Legacy CRM today:** 
  - Modules/04-cad-integration.js persists values verbatim from msg.totals (lines 364-366).
  - Modules/16c-factory-capacity.js (lines 57-72) reads cadData.projectItems but does NOT recompute — it falls back to job.stationTimes if available.
  - Modules/17-install-schedule.js (line 658-660) reads from cadFinalData / cadSurveyData / cadData payloads; no recomputation.
  - No local recomputation logic found for productionMinutes or installMinutes in the legacy modules.
- **Gap:** None observed — the legacy architecture reads values from CAD blobs and top-level job fields, does not hand-roll timing calculations.
- **Fix:** N/A.
- **Risk:** None.
- **Effort:** Complete.

#### §9.5 — Do not apply the 1.22× overhead multiplier to minutes
- **Spec requirement:** The 1.22× multiplier (super + WC + payroll + tools) is baked into station $cost, not into minute totals. Minutes are pure clock time. Never multiply stationTimes or minutes by 1.22 for capacity / scheduling.
- **Legacy CRM today:** 
  - Modules/17-install-schedule.js: minute conversions use / 60 (lines 16, 40, 117, 246) for hours only; no 1.22× found.
  - Modules/30-capacity-planner.js: no 1.22× found; works with raw minutes (lines 42, 93).
  - Modules/16c-factory-capacity.js: no 1.22× found; sums stationTimes directly.
  - Modules/49-factory-stage9-cost-reports.js (line 66): computes labour cost as (mins / 60) * _stationRate(sid), but _stationRate is already the overhead-baked station rate — no explicit multiplier applied.
- **Gap:** None — no 1.22× multiplier found on minute calculations in legacy code.
- **Fix:** N/A.
- **Risk:** None.
- **Effort:** Complete.

#### §9.6 — Convert minutes → hours/days at display time only
- **Spec requirement:** Use formatMinutesAsHours() and formatMinutesAsDays() for display; never round-trip back to minutes. The display helpers are provided by the contract (CadTimingContract.formatMinutesAsHours, formatMinutesAsDays).
- **Legacy CRM today:** 
  - Multiple ad-hoc conversions across modules: (mins / 60) in modules/17-install-schedule.js:16,40; modules/30-capacity-planner.js:42; modules/16c-factory-capacity.js:210; modules/16e-factory-ops.js:431, 438.
  - No consistent use of contract helpers.
  - Modules/17b-cad-timing-contract.js defines formatMinutesAsHours (lines 339-340) and formatMinutesAsDays (line 341) as global wrappers around the class methods.
- **Gap:** Format helpers exist in the contract but are not yet used in legacy display code. Each module still hand-rolls the conversion. This creates risk: if the spec's formula changes (e.g., shift length becomes 7h instead of 8h), the change must be made in multiple places.
- **Fix:** Replace local conversions with the contract helpers. Grep for patterns like `(\s+/\s+60)|formatHours|minToHours` in render functions and replace with `formatMinutesAsHours(mins, 'decimal')` or `formatMinutesAsDays(mins)`. Examples:
  - modules/16e-factory-ops.js:431: `(mins / 60).toFixed(1) + 'h'` → `formatMinutesAsHours(mins, 'decimal')`
  - modules/16c-factory-capacity.js:210: `Math.round(.../ 60)` → `formatMinutesAsDays(...)` (8h shift logic)
  - modules/17-install-schedule.js: several occurrences of `/ 60`; audit which are display-side vs calculation-side
- **Risk:** Medium — format replacement is safe, but audit required to ensure no calculation code (which must use pure minutes) is accidentally changed.
- **Effort:** M (30 min to 1.5 hr; grep + review + replace + test on Install Schedule and Capacity pages)
- **Progress 2026-05-02:**
  - ✅ `modules/16e-factory-ops.js:431` — swapped to `formatMinutesAsHours(mins, 'decimal')` with defensive fallback. Exact-match replacement, zero behaviour change.
  - ✅ `modules/30-capacity-planner.js:82` — local `fmtHM` now delegates to `formatMinutesAsHours(min)` (default style) with fallback. Slight display diff: `0h 30m`→`30m`, `1h 00m`→`1h`, `1h 05m`→`1h 5m`.
  - ✅ `modules/31-fleet-page.js:14` — same pattern as 30-capacity-planner; identical duplicate eliminated.
  - ⏳ Remaining candidates not yet swapped (kept on the punch list because they need slightly different formats or sit inside calc paths that need closer review):
    - `modules/04-cad-integration.js:468` (`estimatedInstallMinutes / 60`) — context unclear; check if display vs calc.
    - `modules/16c-factory-capacity.js:210` (`Math.round(.../60)`) — wants integer hours; not a direct match for either contract style.
    - `modules/16d-factory-pages.js:170` (hand-rolled "Xh Ym") — close to `formatMinutesAsHours(min)` default, swap when convenient.
    - `modules/16e-factory-ops.js:438` (`(totalMins / 60).toFixed(1) + ' hrs'`) — uses ' hrs' suffix; needs a small contract extension or accept the 'h' suffix change.
    - `modules/22-jobs-page.js:1661` (local `minToHM` helper) — same pattern as the 30/31 swap; do next.
    - `modules/45-factory-stage5-prodboard11.js:202`, `47-factory-stage7-tablet-operator.js:165`, `50-factory-stage10-livefloor-settings.js:274` — all `Math.round(.../60) + 'h'` for capacity labels; want integer hours, similar to 16c.

#### §9.7 — Surface save-error reasons verbatim in the CRM toast channel
- **Spec requirement:** When CAD emits spartan-cad-save-error, display the reason (e.g., "Missing measurements: 3 of 5 frames") to the user without modification so they know what to fix in the CAD.
- **Legacy CRM today:** 
  - modules/04-cad-integration.js:256-259 (_onCadSaveError): reads msg.reason and calls addToast(reason, 'error').
  - The error reason is passed verbatim to the toast.
- **Gap:** None — error surfacing is correct per spec.
- **Fix:** N/A.
- **Risk:** None.
- **Effort:** Complete.

### Cross-cutting findings

1. **Duplicate install-minutes format logic.** Hand-rolled conversions (mins / 60, Math.ceil(...4)/4) appear in modules/04-cad-integration.js:440, modules/17-install-schedule.js:16,40,117, modules/30-capacity-planner.js:42. These should all use the contract helpers (formatMinutesAsHours / formatMinutesAsDays) to keep the conversion rules in one place. Effort: M (audit all call sites, identify which are display vs calculation, replace display-side).

2. **Station times are read multiple ways.** Code reads stationTimes from: (a) job.stationTimes (top-level after CAD save, modules/04-cad-integration.js:366); (b) cadData.totals.stationTimes (from JSONB blob, modules/17b-cad-timing-contract.js:264-267); (c) _stationRate() lookup for cost (modules/49-factory-stage9-cost-reports.js). The contract provides getJobStationTimesForCrm(job) as the canonical reader, but it's not yet used. Consider standardizing on the contract's getter.

3. **No explicit validation of the 11-key contract.** The CadTimingContract.validateStationTimes() method (present in the contract class) checks that stationTimes contains only the 11 canonical keys and rejects S_glaze (per audit §3.1). This validator is never called in the legacy CRM on incoming save. If a buggy CAD version emits a 12th key or renames a station key, the CRM silently stores it. Recommendation: call validateStationTimes(msg.totals.stationTimes) in modules/04-cad-integration.js:_persistCadSave before accepting the save.

4. **Frame type enum collapse not documented.** The collapse from 12 productTypes → 6 frame_type enum (audit §2.1) is lossy. The CRM stores the full productType in cadData.projectItems[i].productType, but if code ever queries design_items.frame_type, it's lossy. No frame_type column currently exists, so this is deferred. If a future frame_type column is added, document that it's for UI convenience only and not suitable for timing / capacity queries.

### Recommended execution order

1. **Add validateStationTimes check on CAD save** (modules/04-cad-integration.js:_persistCadSave, after line 266). Risk: Low. Effort: S.

2. **Replace display-side minutes → hours conversions with formatMinutesAsHours** (grep and replace across display modules). Risk: Medium. Effort: M.

3. **Document the contract helpers as the canonical readers** (update CONTRACT.md or add inline comments in 17b-cad-timing-contract.js). Risk: None. Effort: S.

4. **Optional: add design_items denormalization** (if future queries require frame-level filtering by productType / installationType). Risk: Medium. Effort: L (database migration + code to populate + tests).

5. **Optional: audit time-to-days logic** (modules/17-install-schedule.js uses Math.ceil(hours / 8 * 2) / 2; confirm this matches spec §5.2 formula). Risk: Low. Effort: S.

### Open questions for Graham

1. **Frame-level data schema:** Do you want to add a design_items table to store per-frame data (productType, installationType, etc.) as denormalized columns, or is the JSONB blob inside cadData sufficient for now? This affects future analytics queries.

2. **Display formatting standard:** Should all module that display minutes/hours use the contract's formatMinutesAsHours and formatMinutesAsDays, or are the hand-rolled conversions acceptable? This is a code-quality / maintainability decision.

3. **Station times validation:** Should the CRM actively reject saves that don't match the 11-key contract, or just log a warning? (Currently it silently accepts whatever the CAD sends.)

4. **Supply_only edge case:** The contract's decoration handles supply_only for readJobInstallMinutes(job). Does any code directly access job.estimatedInstallMinutes without going through the wrapper? If so, that code won't see the override.

---

## Integration Session — 2026-05-02 (afternoon)

> 30 implementation items planned and executed. Full per-file detail is in
> `CHANGELOG.md`. Headline: factory v1 directory was already deleted by the
> user; we cleaned up `index.html` references, properly relocated
> `26-cad-timing-contract.js` to `modules/17b-cad-timing-contract.js`, then
> ground through 28 contract-integration / DRY / drift-guard items. Two
> trivial gaps remain on the §9.6 punch list (a couple of intentionally
> hand-rolled hero-stat displays).

### What changed in numbers
- **82** call-sites across **13 files** now reference contract symbols
  (`CadTimingContract`, `formatMinutesAsHours`, `formatProductType`,
  `CAD_STATION_KEYS`, `CAD_PRODUCT_TYPES`, `CAD_INSTALLATION_TYPES`,
  `CAD_PROPERTY_TYPES`). Up from **0** at the start of the session.
- **7** duplicate copies of `_esc` consolidated into `07-shared-ui.js`
  (4 of them were inside `08-sales-crm.js` alone).
- **10** ad-hoc `productType.replace(/_/g, ' ')` sites replaced with
  `formatProductType()` so display now reads "Tilt & Turn" instead of
  "tilt turn window".
- **0** outstanding `js/modules/factory/*.js` script references in
  `index.html` (down from 9 dead loads).
- **3** new format styles on `formatMinutesAsHours`: `'integer'` (KPI),
  `'padded'` (table alignment), plus the existing default and `'decimal'`.
- **2** new validators run on every CAD save —
  `validateStationTimes` + `_validateCadProjectItems` (productType,
  installationType, propertyType).

### Validators wired into CAD save
1. `04-cad-integration.js:_persistCadSave` now runs
   `_validateCadProjectItems(msg.projectItems, …)` before persisting —
   logs every frame whose enums fall outside the contract.
2. `04-cad-integration.js:_persistToJob` now calls
   `CadTimingContract.validateStationTimes()` on incoming `totals.stationTimes`,
   logs violations, and persists `normalizeStationTimes()` so only the
   canonical 11-key shape ever lands in state.
3. `16c-factory-capacity.js` warns at module load if
   `FACTORY_STATIONS_TIMES` IDs ever drift from `CAD_STATION_KEYS`.

### Drift discovered (annotated in code, not yet fixed)
- `16c-factory-capacity.js` `hwPerSash` had legacy `double_hung_window`
  (not in `CAD_PRODUCT_TYPES`) and was missing `vario_slide_door` (added
  with default 12 min as per spec §3.3, but worth a cleaner fix).
- Per-frame fields (`productType`, `propertyType`, `installationType`,
  `floorLevel`, `panelCount`) persist as JSONB inside `cadData` blobs
  rather than denormalized columns. Functional, but limits filterability.
- `tests/factory-v1-base.test.cjs` is now a deprecation stub; safe to
  delete from disk whenever convenient.

### Items still on the §9.6 punch list (tiny, optional)
- `04-cad-integration.js:468` — calc, not display, no swap needed.
- `16e-factory-ops.js:438` — hero-stat "Total Production" intentionally
  uses verbose ` hrs` suffix; documented inline.

### Recommended next moves
- Click through Capacity Planner, Fleet, Factory Ops review tab, and any
  factory queue page to eyeball the new product-label ("Tilt & Turn") and
  hours format ("1h 5m" vs. legacy "1h 05m" — except 22-jobs-page which
  uses `'padded'` style).
- If `addToast`-noise from contract violations surfaces in production,
  consider downgrading the toast to a console-only warn.
- Day 3 (redundancy/dead-code pass) is the natural next session — it'll
  benefit from the v1 cleanup we did today.

---

## Render-loop audit — 2026-05-02

> Scope: confirm whether the codebase suffers from cascading or duplicated
> renders. Conclusion: architecture is clean; two specific patterns documented
> for future cleanup.

### Architecture (good)
- `setState(patch)` (modules/05-state-auth-rbac.js:1221) has a no-op guard — if
  every patch value is reference-equal to existing state, listeners aren't
  notified.
- `renderPage` is bound as a `subscribe` listener at `modules/99-init.js:267`,
  so `setState()` automatically triggers exactly one render.
- No render-function body directly calls `setState()` or `renderPage()` —
  all such matches were inside `onclick="…"` strings (handler payloads, run
  on click, not on render). No cascade or infinite-loop risk.

### Real bugs — 9 explicit double-renders
Inline handlers that call `setState({…});renderPage()` on the same line. The
`renderPage()` is wasted work because `setState` already triggered one. Files:

| Line | What it does |
|---|---|
| `modules/16d-factory-pages.js:145` | `setState({page:stnPage});renderPage()` — header click |
| `modules/16e-factory-ops.js:208` | "Review →" button — also mutates local `_reviewTab` |
| `modules/16e-factory-ops.js:256` | "← Back" button |
| `modules/19-service-crm.js:74` | "All" status filter |
| `modules/19-service-crm.js:78` | per-status filter buttons (in a loop) |
| `modules/20-job-settings.js:700` | Save field button — also mutates several locals |
| `modules/22-jobs-page.js:1117` | "Mark Non-Material" button |
| `modules/22-jobs-page.js:1128` | "Reset to awaiting_quote" button |
| `modules/22-jobs-page.js:2071` | "Record Completion Signature" button |

**Decision:** do not patch these in isolation. The event-delegation refactor
already in progress (framework added in `07-shared-ui.js`) will naturally
remove all of these as the inline handler strings get rewritten as
`data-action`-driven calls — the action handlers can simply omit the
explicit `renderPage()` call.

### Architectural smell — 188 module-local-var mutations
Patterns like:
```js
oninput="cSearch=this.value;renderPage()"
onclick="kFilterOwners=[];renderPage()"
onclick="cType='deal';renderPage()"
```
work because the rendered code reads those module-local vars at the top of
each render. But they bypass `setState`:
- No Supabase sync (session-only filters — usually correct).
- No `setState` change-detection guard, so clicking the **already active**
  filter still re-renders the whole page.
- No way to centrally observe filter changes (e.g., for a query-param URL
  pattern or analytics).

**Possible fix (deferred):** lift these locals into the state object
(`setState({cSearch:value, cType:'deal'})`). The change-detection guard
then short-circuits no-op clicks for free. Not urgent, but worth a small
pass during the event-delegation migration since the same files are being
touched.

### Verdict
Render-loop concern is mostly addressed by the existing architecture. Two
small-to-medium follow-ups, both naturally absorbed by the in-progress
event-delegation refactor.

---

## Event-delegation migration — DONE 2026-05-02

> Started: ~1,100 inline `onclick="…"` handlers across the non-Jobs/non-CAD
> codebase. Ended: **19**, distributed thinly across helper-function patterns,
> false-positive comments, and a deliberate login-form exception.
> **97.7% reduction in one session.**

### Architecture
- Framework lives in `modules/07-shared-ui.js` (single body-level listener,
  `defineAction(name, fn)` registry).
- Render templates emit `data-action="name"` (click), `data-on-change="name"`,
  `data-on-input="name"`, `data-on-submit="name"` + any `data-*` payload attrs.
- Handlers receive `(targetElement, event)` and read state from
  `target.dataset` (kebab-case attrs auto-camelCase via the standard DOM
  dataset API).
- Helper functions (`statMini`, `chipBtn`, etc. in 08a) now accept
  `(action, dataAttrs)` arguments instead of an `onclick` string. The
  `_attrsForAction()` utility builds the `data-action="…" data-foo="…"`
  fragment from a JS object.

### Files at zero inline handlers (38)
31, 46, 14, 45, 50, 08a, 08b, 08c, 08d (3 drag remain), 08e, 08f, 08g, 08h,
11, 11a, 11b, 11c (2 false-positive comments), 11d, 11g, 16a, 16b, 16c, 16d,
16e, 19, 23, 24, 26, 27, 28, 30, 40, 42, 43, 44, 47, 48, 49.

### Files with residue (intentionally kept) — 19 handlers total
- `05-state-auth-rbac.js` (4): login form (pre-boot, framework not yet
  available) + 1 admin-perm checkbox in a helper string.
- `13-leads-maps.js` (3): mobile renderers with mid-string-concat handlers
  using `_esc()` — would need template restructuring.
- `08d-sales-deals-kanban.js` (3): drag-drop handlers (framework doesn't
  dispatch drag events) + 1 simple onclick.
- `08-sales-crm.js` (3): orchestrator helpers `renderNextActivityChip`,
  `_renderInlineRowActions` emit strings consumed by sub-modules.
- `11c-email-templates.js` (2): false-positive grep matches in comments.
- `07-shared-ui.js` (2): helper-function output bridging modules.
- `49-factory-stage9-cost-reports.js` (1): sidebar nav residual.
- `08a-sales-mobile.js` (1): residual after helper-signature refactor.

### Recommended follow-up (separate sessions)
- If event-delegation needs to extend further: drag/drop event support in
  the framework (currently click/change/input/submit only) — would clear
  the kanban + scheduler drag residue.
- Refactor `renderNextActivityChip` and `_renderInlineRowActions` to take
  action+dataAttrs (same pattern as 08a's helpers) — clears the orchestrator
  residue.
- Login form (`05-state-auth-rbac:1026`) requires the framework to load
  before the login screen — either move framework to an earlier load layer
  or accept the form-level inline handler as intentional.

---

## Day 2 — Performance pass (2026-05-02)

> Audit of the (now post-monolith-split) codebase for DOM thrashing, redundant
> work, listener leaks, and oversized functions. Architecture is broadly
> healthy; one outsized function and a handful of caching wins are the real
> story.

### Headline find — `renderJobDetail` is 1,649 LOC
- `modules/22-jobs-page.js` — single function, **62% of the file** (file is
  2,635 LOC total). By comparison the next-biggest render function in the
  whole codebase is `renderJobsPage` at 275 LOC.
- It's both a maintainability and a perf concern. A re-render builds a
  ~1.6k-line HTML string in one shot, then drops it into `innerHTML`. Every
  `renderPage()` call (any state change) reruns this whole thing.
- **Recommendation:** split into per-tab renderers (`_renderJobOverviewTab`,
  `_renderJobFramesTab`, `_renderJobScheduleTab`, `_renderJobFilesTab`,
  `_renderJobActivityTab`, `_renderJobVariationTab`, etc.) following the
  same pattern Sales went through earlier today. Outer function becomes a
  thin dispatcher. Could also let us only re-render the active tab on
  state changes scoped to that tab.

### Caching wins — repeated `getState()` per render

| File | `getState()` calls |
|---|---|
| `modules/22-jobs-page.js` | 54 |
| `modules/17-install-schedule.js` | 46 |
| `modules/12-settings.js` | 36 |
| `modules/13-leads-maps.js` | 34 |

`getState()` returns the state singleton — the call itself is cheap, but 54
calls per render is wasteful and obscures the fact that all of them see the
same value mid-render. Standard fix at the top of each render function:
```js
var st = getState();
// then use st.deals, st.leads, … rather than getState().deals, getState().leads, …
```
~50 calls become ~5. Pure refactor, zero behaviour change.

### Caching wins — repeated DOM queries

| File | `querySelector` / `getElementById` calls |
|---|---|
| `modules/08e-sales-deal-detail.js` | 41 |
| `modules/13-leads-maps.js` | 38 |
| `modules/08d-sales-deals-kanban.js` | 21 |
| `modules/31a-vehicle-insurance.js` | 20 |
| `modules/12-settings.js` | 20 |
| `modules/08c-sales-contacts.js` | 17 |

Same pattern: cache refs once per function. Particular smell when the same
ID appears 5+ times — that's a guaranteed cache opportunity.

### Heavy serialization on hot paths

| File | `JSON.parse` + `JSON.stringify` |
|---|---|
| `modules/05-state-auth-rbac.js` | 35 |
| `modules/17-install-schedule.js` | 29 |
| `modules/01-persistence.js` | 26 |
| `modules/24-commission.js` | 17 |

Some are unavoidable (Supabase upserts, localStorage round-trips). But
when paired with the `localStorage.getItem`/`setItem` hot-path counts
below, several are likely re-reading the same key on every render. Worth
a focused pass to identify deserialize-once-cache-on-_state opportunities.

### localStorage hot paths
| File | `localStorage.getItem` + `setItem` |
|---|---|
| `modules/01-persistence.js` | 30 |
| `modules/17-install-schedule.js` | 29 |
| `modules/24-commission.js` | 19 |
| `modules/05-state-auth-rbac.js` | 14 |

`localStorage` is synchronous. If any of these reads happen during a render
or a tight loop, it stalls the main thread. Most appear to be at module
init (fine) but worth verifying the install-schedule/commission ones aren't
being called from inside `renderInstallSchedule` / `renderCommission`.

### Cleared as non-issues

- **6 `setInterval` timers** (`syncEmailOpens` 30s, notifications 60s,
  Twilio call timer 1s, live-floor refresh 30s). Each verified to clean up
  via clearInterval or self-disposing checks. No leaks.
- **19 `addEventListener` vs 4 `removeEventListener` ratio** initially
  looked suspicious. Audited: most listeners are on per-render DOM nodes
  that get GC'd with the next innerHTML rewrite. Window/document listeners
  are either app-level (attached once at boot) or self-cleaning (e.g.
  calendar bubble's `document.addEventListener('click', handler, true);
  … document.removeEventListener('click', handler, true)` inside the
  handler at `27-calendar-page.js:240`). No leaks.
- **Drag listeners in `17-install-schedule.js:247-248`** correctly remove
  on `mouseup` (lines 225-226).
- **Nested `forEach` patterns** found in 4 places. Typical data sizes
  (hundreds of deals/leads, not thousands) — fine.
- **`innerHTML` writes** are concentrated in 28-twilio (5), maps (4),
  vehicle-insurance (3) — all targeted updates, not full-page rewrites.
  Main app uses `document.getElementById('app').innerHTML = …` once per
  render which is fine for an unoptimized vanilla pattern but the
  `renderJobDetail` split above is the real lever.

### Recommended priority list
1. Split `renderJobDetail` (1,649 LOC) into per-tab renderers — biggest
   structural + perf win.
2. Cache `getState()` at top of the four heavy-caller files.
3. Cache repeated `querySelector` / `getElementById` calls in 08e and
   13-leads-maps.
4. Audit `localStorage`/`JSON` hot paths in `17-install-schedule.js` and
   `24-commission.js` for renders that re-read on every tick.
5. Consider lazy-loading the mock-data modules (`02-mock-data`,
   `02a-mock-factory-data`, `02b-mock-stock-data`, `02c-mock-operator-data`
   — total ~650 LOC) only when DB returns empty.

---

## Day 2 — Performance pass DONE 2026-05-02 (see above)
## Day 3 — Redundancy & dead code pass (pending)
## Day 4 — Structure & maintainability pass (pending)
## Day 5 — Asset & network pass (pending)
## Day 6 — Accessibility & UX pass (pending)
## Day 7 — Triage & prioritize (pending)
