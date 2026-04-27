# SPARTAN CRM — Module Contract

This document is the **authoritative reference for how the 28 modules talk to each other**. Before editing any module, skim the relevant section here so you don't break the contract with the rest of the app.

The app was originally one 17,000-line `<script>` block. The split files preserve that code byte-for-byte — nothing was rewritten. That means every function and variable declared at the top level of a module becomes a **global** shared with every other module, exactly as in the original. The "contract" below just makes that implicit sharing explicit.

---

## 1. How the modules communicate

Three mechanisms, in order of importance:

1. **Global functions and variables.** Every `function foo() {}` and `var x = ...` at the top of any module is a global. Modules call each other's globals directly. No imports. No `window.foo` needed — bare names work.
2. **The `_state` object + `setState()` / `subscribe()`.** The one place mutable application data lives. Modules read with `getState()` and write with `setState({partial})`. Every `setState` call re-runs `renderPage()` via the subscribe listener wired up in `99-init.js`.
3. **The DOM (`#app`).** Every render cycle clobbers `#app`'s innerHTML and rebuilds from scratch. Modules wire up event handlers via `onclick="..."` attributes that call global functions by name, or via `setTimeout(()=>document.getElementById(...).addEventListener(...))` deferred inside a render function.

There is no module system, no bundler, no framework. Think of it as 28 pages of one script that happen to live in 28 files.

---

## 2. Load order — do not reorder

Load order is set in `index.html` and matters for two reasons:

- `05-state-auth-rbac.js` defines `_state`, `getState`, `setState`, `subscribe`, `getCurrentUser`, `canEdit`, `isAdmin`. Every later module uses at least one of these.
- `02-mock-data.js` defines the seed constants (`DEALS`, `CONTACTS`, `NOTIFS`, `LEADS_DATA`, `EMAIL_INBOX_SEED`, `EMAIL_SENT_SEED`, and the `DEFAULT_*_FIELDS` / `DEFAULT_*_STATUSES`) that `_state` copies into itself on initialization. Move mock data after state and state will reference `undefined`.

Rule of thumb: if you're adding a new module, drop it **after `07-shared-ui.js`** and **before `99-init.js`**. That window is safe — all the core primitives exist and boot hasn't run yet.

---

## 3. Core globals every module can rely on

These come from modules 01–07. Once loaded, they're available to every module below.

### State (`05-state-auth-rbac.js`)

```js
_state               // the single source of truth (object)
getState()           // returns _state (read-only in spirit; don't mutate)
setState({patch})    // merge patch into _state and trigger re-render
subscribe(fn)        // register a listener; returns an unsubscribe function
addToast(msg, type)  // type = 'success' | 'error' | 'info'; auto-dismisses
```

**The `_state` shape** (defined in `05-state-auth-rbac.js` around line 2309 of the original). Keys you can rely on being present:

| Key | Type | Notes |
|---|---|---|
| `page` | string | current route, e.g. `'dashboard'`, `'jobs'`, `'servicelist'` — dispatched in `renderPage()` |
| `crmMode` | `'sales'` \| `'jobs'` | toggled by the top-level red module bar |
| `branch` | string | `'all'` or a specific branch filter |
| `sidebarOpen` | boolean | |
| `deals`, `contacts`, `leads`, `jobs` | array | core entity collections |
| `jobWindows` | array | per-window records linked to jobs |
| `serviceCalls`, `installers` | array | |
| `notifs`, `toasts` | array | |
| `dealDetailId`, `leadDetailId`, `contactDetailId`, `jobDetailId` | string \| null | when any is non-null, renderPage opens that detail page |
| `dealFields`, `leadFields`, `contactFields`, `jobFields` | array | custom field definitions |
| `dealStatuses`, `leadStatuses`, `contactStatuses` | array | custom status pipelines |
| `dealFieldValues`, `leadFieldValues`, `contactFieldValues`, `jobFieldValues` | object | keyed by entity id |
| `emailInbox`, `emailSent`, `emailDrafts`, `emailThreads` | various | email module state |
| `gmailConnected`, `gmailUser`, `gmailToken` | | gmail integration state |
| `scheduleWeekOffset` | number | |
| `weeklyTargets` | object | `{VIC, ACT, SA, TAS}` |

Writes go through `setState({jobs: [...updated]})` — never mutate `_state.jobs` in place. Any `setState` containing `contacts`, `leads`, `deals`, or `jobs` automatically schedules a debounced Supabase sync (see `01-persistence.js`).

### Persistence (`01-persistence.js`)

```js
_sb                  // Supabase client (null if offline)
initSupabase()       // call once on boot
dbLoadAll()          // returns a Promise<ok>; hydrates _state from DB
setupRealtime()      // subscribes to DB changes and merges into _state
dbUpsert(table, row) // fire-and-forget upsert with localStorage fallback
jobToDb / dbToJob    // camelCase ↔ snake_case field mappers (similar for contact/lead/deal)
```

### Auth & RBAC (`05-state-auth-rbac.js`)

```js
getCurrentUser()          // returns user object or null
setCurrentUser(id)        // on login
logout()                  // clears session and reloads
getRolePermissions()      // returns the permissions matrix
canEdit(moduleKey)        // moduleKey = 'sales' | 'jobs' | 'factory' | 'accounts' | 'service'
isAdmin()                 // shortcut for admin role check
ALL_ROLES                 // array of all role definitions
DEFAULT_PERMISSIONS       // default matrix used if localStorage is empty
```

Role values in the matrix: `true` = read+write, `'view'` = read-only, `false` = hidden.

### Shared UI (`07-shared-ui.js`)

```js
Icon({n, size, style, cls})         // SVG icon lookup — see inside the file for the n="..." names
Badge(label, type)                  // inline pill, type = 'gray' | 'red' | 'green' | ...
StatusBadge(status, variant)        // variant = 'deal' | 'lead' | 'contact' | 'job'
renderSidebar()                     // the left nav
renderTopBar()                      // the top bar (search, notifs, profile)
renderModuleBar()                   // the red bar at the very top (Sales CRM / Jobs CRM / ...)
renderToasts()                      // renders from _state.toasts into #toasts
MODULE_BAR_HEIGHT                   // pixel constant used by renderPage to offset <main>
```

### Boot (`99-init.js`)

```js
renderPage()         // the master dispatcher. Reads _state.page and calls the right render*() function
```

`renderPage()` contains a `pageRenderers` object mapping every `_state.page` value to a render function. If you add a new page, **add it to that map** or it won't route.

---

## 4. Per-module responsibilities

Every module owns a handful of globals. Listed below are the ones other modules are allowed to call — the "public API" of each file.

### 01-persistence.js
Owns: `_sb`, `initSupabase`, `dbLoadAll`, `setupRealtime`, `dbUpsert`, `jobToDb/dbToJob`, `contactToDb/dbToContact`, `leadToDb/dbToLead`, `dealToDb/dbToDeal`, multi-quote migration helpers.

### 02-mock-data.js
Owns: `DEALS`, `CONTACTS`, `NOTIFS`, `LEADS_DATA`, `EMAIL_INBOX_SEED`, `EMAIL_SENT_SEED`, `DEFAULT_DEAL_FIELDS`, `DEFAULT_LEAD_FIELDS`, `DEFAULT_CONTACT_FIELDS`, `DEFAULT_DEAL_STATUSES`, `DEFAULT_LEAD_STATUSES`, `DEFAULT_CONTACT_STATUSES`.

These are read once by `_state` on load. You can edit the seed data freely — changes appear on next page refresh if localStorage is cleared.

### 03-jobs-workflow.js
Owns: `JOB_STATUSES`, `DEFAULT_JOB_FIELDS`, job number generator, job CRUD (`createJob`, `updateJob`, job-window helpers), gate logic (`canTransitionJobStatus`, `getBlockedReason`), Check Measure completion + 45% invoice auto-generation.

**Gate logic is the most important part of this module.** Every job status transition must go through `canTransitionJobStatus(job, newStatus)` to enforce the workflow (e.g. can't go from "check_measure" to "in_production" without a completed CM and signed final design).

### 04-cad-integration.js
Owns: `SPARTAN_CAD_B64` (the embedded CAD app as base64), `openCAD()`, `openReadOnlyCAD()`, multi-quote helpers (`addQuoteToDeal`, `setActiveQuote`, `wonQuoteForDeal`), postMessage bridge listener.

**Note:** this file contains one line that is ~2 MB (the base64 CAD payload). Most editors will struggle. When you need to update the CAD app itself, consider extracting the payload to its own file that's fetched at runtime — but that's a refactor, not a must.

### 05-state-auth-rbac.js
Already covered in §3 above.

### 06-email-tracking.js
Owns: `pollEmailOpens()`, tracking-pixel handling, notification generation from email opens.

### 07-shared-ui.js
Already covered in §3 above. Also owns: `HELPERS` block (date formatters, initials, currency), `renderNotifications()`, `toggleBranchDrop`, `toggleNotifDrop`.

### 08-sales-crm.js (the big one — 3,500 lines)
Owns: `renderDashboard`, `renderDeals`, `renderContacts`, kanban logic, `renderEntityDetail`, `renderDealDetail`, `renderLeadDetail`, `renderContactDetail`, the tab-form renderer, Schedule Activity modal, deal action functions, the Step-4 Won Flow, inline map scheduler.

If you want to refactor anything, start here — it's the largest and most tangled file. Natural seams inside it:
- Dashboard (≈ first 570 lines)
- Deals list + kanban (≈ next 540 lines)
- Detail page renderer (≈ next 400 lines)
- Tab form renderer (≈ next 330 lines)
- Deal/Lead/Contact detail pages (≈ next 1,650 lines)

### 09-reports.js
Owns: `renderReports`, `renderReportBuilder`, saved reports state, data computation, Recharts rendering.

### 10-integrations.js
Owns: `gmailInit`, `autoRestoreGmail`, `gmailSend`, `gmailSyncInbox`, `gmailSyncSent`, Google Calendar OAuth + CRUD, `loadGoogleMaps`, `attachAllAutocomplete`.

### 11-email-page.js
Owns: `renderEmailPage`, `renderEmailList`, `renderEmailDetail`, `renderEmailComposer`, template system, tracking UI, `emailCloseCompose`.

### 12-settings.js
Owns: `renderSettings`, custom fields actions (`addCustomField`, `deleteCustomField`, ...), custom status actions (`addCustomStatus`, `reorderStatus`, ...), RBAC editor UI.

### 13-leads-maps.js
Owns: `renderLeads`, `renderMapPage`, `renderAddLeadDrawer`, smart scheduling (proximity clustering), suburb lookup table.

### 14-profile.js
Owns: `renderProfilePage`, `toggleProfileDrop`, profile password change.

### 15-jobs-crm.js
Owns: `renderJobDashboard` (the Job CRM landing page).

### 16-factory-crm.js
Owns: `renderFactoryDash`, `renderProdQueue`, `renderProdBoard`, `renderFactoryBOM`, `renderFactoryCapacity`, `renderFactoryDispatch`, glass/profile ordering protocols, BOM & cut sheets.

### 17-install-schedule.js
Owns: `renderInstallSchedule`, `renderCapacityPlanning`, scheduler week/day views, drag handlers, schedule-job modal, smart capacity auto-scheduling.

### 18-accounts-crm.js
Owns: `renderAccDash`, `renderAccOutstanding`, `renderAccCashFlow`, `renderAccRecon`, `renderAccBills`, `renderAccWeekly`, `renderAccBranch`, `renderAccXero`.

### 19-service-crm.js
Owns: `renderServiceList`, `renderServiceMap`, `renderSvcSchedule`.

### 20-job-settings.js
Owns: `renderJobSettings` — separate from Sales CRM settings. This is where production staff/installers configure job-specific defaults.

### 21-cm-schedule.js
Owns: `renderCMMapPage` — Check Measure proximity booking.

### 22-jobs-page.js
Owns: `renderJobsPage` (jobs list), job detail page, `renderFinalSignOff` (sales-manager approval queue).

### 23-won-deals.js
Owns: `renderWonPage`.

### 24-commission.js
Owns: `renderCommissionPage`, commission calculation.

### 25-invoicing.js
Owns: progress-claim logic, `createInvoiceFromDeal`, `updateClaimPercentage`, `sendReminder`, `checkAutoReminders`, Xero export, GST + PDF generation.

### 26-invoicing-page.js
Owns: `renderInvoicingPage`, `renderDealInvoiceSection`.

### 27-calendar-page.js
Owns: `renderCalendarPage`, `renderCalEventModal`, `renderCalendarCreateModal`, `renderCalendarWidget`, `calOpenEventByIndex`, `MODULE_BAR_HEIGHT` references.

### 99-init.js
Owns: `renderPage` (the master dispatcher), global keyboard shortcuts, outside-click dismissal, the boot sequence.

---

## 5. Rules for working on one module without breaking the others

1. **Don't rename globals without grepping.** If you rename `createJob` inside `03-jobs-workflow.js`, at least 5 other modules are calling it. Run `grep -rn "createJob" modules/` before any rename.
2. **Don't move code between modules without checking load-order dependencies.** If a function currently defined in `07` uses a constant from `02`, moving it to `01` will break it.
3. **Don't add new top-level code that runs immediately unless you're sure its dependencies are loaded.** Top-of-file `var x = someFunction()` in module `08` is only safe if `someFunction` is defined in modules `01–07`.
4. **Always write state updates through `setState`.** Direct mutation like `_state.jobs.push(j)` won't trigger a re-render and won't sync to Supabase.
5. **When you add a new page, three things must happen:** define `renderYourPage()` in your module, add `yourpage: renderYourPage` to `pageRenderers` in `99-init.js`, and add a nav item in the `renderSidebar()` inside `07-shared-ui.js` that calls `setState({page:'yourpage'})`.
6. **When you add a new permission-gated feature, also update** `DEFAULT_PERMISSIONS` in `05-state-auth-rbac.js` so roles that should see it get it.
7. **Check the CAD payload line before editing `04-cad-integration.js`.** That 2-MB single line will wrap weirdly in editors — don't let an accidental newline in the middle of the base64 string slip through.

---

## 6. Known-fragile areas (inherited from the original)

These are things the split **did not fix** — they exist in the original monolith too, so flagging them for when you touch these areas:

- **`var ALL_ROLES` is declared twice** in `05-state-auth-rbac.js` (once around original line 1986, once around 2078). The second declaration silently overwrites the first. Harmless today; worth cleaning up.
- **`SPARTAN_CAD_B64` is a single 2-million-character line** in `04-cad-integration.js`. See §5 rule 7.
- **The "New Frame" panel bug** (per your ongoing work notes) is inside `04-cad-integration.js` — the panel ignores user-entered dimensions and hardcodes 900×900.
- **`MODULE_BAR_HEIGHT`** is referenced in `renderPage` but defined inside `07-shared-ui.js`. Don't remove it without updating both.
- **Event handlers via `onclick="foo()"` string attributes** are everywhere. These names must resolve to globals at click time. If you refactor a function into a closure, every one of those string handlers breaks silently.

---

## 7. Quick recipes

**Add a new field to jobs:**
1. Add the column to `jobs` in Supabase.
2. Add the field to `jobToDb` and `dbToJob` mappers in `01-persistence.js`.
3. Add the default value to `_state.jobs` entries where applicable.
4. Update the relevant render function (`renderJobsPage` in `22-jobs-page.js` or `renderJobDashboard` in `15-jobs-crm.js`).

**Add a new module (e.g. HR CRM):**
1. Create `modules/28-hr-crm.js`.
2. Define `renderHRDash()` and any supporting functions at the top level.
3. Add a `<script src="modules/28-hr-crm.js"></script>` to `index.html`, before `99-init.js`.
4. Add `hrdash: renderHRDash` to `pageRenderers` in `99-init.js`.
5. Add a nav item + permission key.

**Debug a "function not defined" error:**
It means a module is calling a global whose defining module loads later (or isn't loaded at all). Check the script-tag order in `index.html` against the grep result for the function name.
