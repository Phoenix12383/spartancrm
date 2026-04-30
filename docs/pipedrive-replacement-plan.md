# Pipedrive Replacement Plan — Spartan Sales Mobile

**Goal:** Retire Pipedrive entirely and replace it with the Spartan CRM mobile wrapper. Reps keep their Pipedrive-shaped habits; we keep the data inside our own webapp.

**Scope decisions (locked in):**
- **No data migration.** Fresh start in Spartan.
- **Mobile-first.** Reps live in the wrapper; desktop is for managers.
- **"Pipedrive-shaped skin."** Surface UI mirrors Pipedrive habits; backend is Spartan.
- **Tiers 1 + 2 only.** Tier 3 (custom fields, workflow automation, web visitor tracking, smart contact data) is explicitly out of scope for this plan.
- **They sell windows.** Pipeline is already roughly modelled in Spartan; refinements happen alongside this work.

**The single non-negotiable habit Pipedrive enforces:** every open deal has a *next scheduled activity*, and the Today view is sorted by what's overdue. If we don't replicate that, reps will revolt. Phases 1–5 exist to nail that loop before anything else.

**Effort scale:** S = ½–1 day, M = 2–3 days, L = 4–7 days. Estimates assume one engineer working alongside other ongoing work.

---

## Foundation already shipped — DO NOT REWORK

This plan is a **skin on top of what already exists**. None of the phases below should touch these, except to add new entry points / call sites.

- **Capacitor wrapper** (`com.spartandoubleglazing.sales`) + native Google Sign-In via `@capgo/capacitor-social-login` (Credential Manager flow), with `idToken` persisted to `localStorage.spartan_native_id_token` for backend auth.
- **`isNativeWrapper()`** runtime branch + `SALES_WRAPPER_PAGES` whitelist in `05-state-auth-rbac.js` — every new mobile feature uses this same pattern.
- **Mobile chrome:** `renderTopBar()` (native variant), `renderBottomNav()` (7 tabs), `renderModuleBar`/`renderSidebar` suppressed on native — all in `07-shared-ui.js`.
- **Mobile renderers in `08-sales-crm.js`:** `renderTodayMobile`, `renderDealsMobile`, `renderLeadsMobile` (and Contacts/More/etc.), `_renderEntityDetailMobile`, `advanceDealStageMobile`, three-button deal actions (advance / Mark Lost with note / Reopen), Mark Lost note flow, mobile note modal, mobile email modal stub.
- **Camera pipeline:** `takeMobilePhoto()` → `@capacitor/camera` → Supabase Storage upload → `entity_files` row → `activities` row of type `file` → realtime push to desktop. `entity_files` is on the realtime publication and is processed back into `spartan_files_<type>_<id>` localStorage by `dbLoadAll`.
- **Calendar push:** `addToDeviceCalendar()` via `@ebarooni/capacitor-calendar`, plus `renderCalendarMobile`.
- **Twilio:** `dialViaTwilioBridge` (PSTN-bridge outbound), `hangUpActiveCallMobile`, `renderActiveCallBannerMobile`, `_activeCallSidMobile` state, `api/twilio/dial.js`, `api/twilio/hangup.js` (with idToken-vs-access-token auto-detection in `verifyGoogleIdTokenAndLookupUser`).
- **Realtime split:** `spartan-realtime-entities` + `spartan-realtime-comms` in `01-persistence.js` (Supabase per-channel listener cap workaround). New tables added by phases below should slot into one of these two channels — do not create a third without checking the cap.
- **Build versioning:** `BUILD_VERSION` query-param cache-bust on every module load via `index.html`. Bump it on every ship.

**The rule:** every phase below either (a) adds new files/modules, (b) adds new entry points to existing renderers, or (c) restructures content *inside* an existing mobile renderer. No phase rebuilds the wrapper, the bottom nav, the realtime layer, the camera flow, or the Twilio call flow.

---

## Tier 1 — The Daily Loop (Phases 1–10)

The minimum surface area a rep needs to feel "this is Pipedrive but Spartan." Every phase below has to ship before cutover is even discussable.

### Phase 1 — Next-activity data model — **S**
- Add `next_activity_at`, `next_activity_type`, `next_activity_note` to deals (and leads, mirrored).
- Backfill: existing deals get `next_activity_at = NULL` → they all show as "no activity scheduled" until a rep schedules one. That's the right starting state.
- Realtime: include the new columns in the entities channel payload so desktop + mobile stay in sync.
- **Depends on:** nothing.
- **Exit criteria:** column visible in Supabase, mobile + desktop both read it without crashing.

### Phase 2 — Schedule-activity modal (mobile) — **M**
- Bottom-sheet modal: type chip row (Call / SMS / Email / Meeting / Task), date picker (Today / Tomorrow / +3d / pick), one-line note.
- Writes back to the deal/lead row + logs an `activities` row of type `scheduled`.
- Big tap targets, no scroll on standard phone height.
- **Depends on:** Phase 1.
- **Exit criteria:** rep can schedule a "Call tomorrow 10am" in under 5 taps from a deal detail screen.

### Phase 3 — Deal card "next activity" chip — **S**
- On every deal/lead card across mobile (Today, Deals kanban, search results) show the next-activity chip.
- Color-code: red = overdue, amber = today, green = future, grey = none scheduled.
- Tap chip → opens Phase 2 modal pre-filled.
- **Depends on:** Phase 1, Phase 2.
- **Exit criteria:** every card in the wrapper shows the chip; colors are correct relative to "now" not "midnight".

### Phase 4 — Post-action "what's next?" prompt — **M**
- After every logged action, show a "Schedule next activity?" sheet *before* returning the rep to where they were.
- Hook into existing handlers (don't rewrite them) — drop a single `maybePromptNextActivity(entityId, entityType, hint)` call at the success-path tail of: `dialViaTwilioBridge` end-of-call, mobile SMS send, mobile email send, mobile note save, `takeMobilePhoto`, `advanceDealStageMobile`, Mark Lost confirm.
- Defaults: pre-select sensible type via the `hint` arg ("Call" after SMS, "Meeting" after stage-advance to Quoted, etc.).
- Skip button is allowed but visibly secondary.
- **Depends on:** Phase 2.
- **Exit criteria:** every existing action handler routes through this prompt with a single added line; no handler logic is rewritten.

### Phase 5 — Overdue handling + Today badge — **S**
- The "Today" bottom-nav tab gets a red badge with count of overdue activities.
- On the Today screen, overdue deals sort to top with a red left-border accent.
- Pull-to-refresh recomputes overdueness.
- **Depends on:** Phases 1, 3.
- **Exit criteria:** open the app at 9am with two overdue calls from yesterday → badge shows "2", both deals are top of list.

### Phase 6 — Today view rebuild (data layer) — **S**
- Today payload = today's appointments + overdue activities + today-scheduled activities + recent activity (last 24h) on my deals.
- Single query, sorted, capped at ~50 entries.
- **Depends on:** Phase 1.
- **Exit criteria:** payload available as `getTodayPayload(userId)` returning a flat sorted array.

### Phase 7 — Today view restructure + above-the-fold tuning — **M**
- Restructure the *content* of the existing `renderTodayMobile` (don't replace the function or its callers) into a Pipedrive-style stacked list: time-bucketed sections (Overdue / Today / Tomorrow / Later this week).
- The existing black hero, 2x2 stat grid, and recent-deals block stay as buildable pieces — they get reordered/resized below the work queue, not deleted. The 2x2 stat grid collapses into a single thin metric strip at the very top so the work queue lands above the fold on a mid-range Android.
- Each row = next-activity chip + customer name + deal title + value.
- Tap row → existing deal detail screen.
- **Depends on:** Phase 6, Phase 3.
- **Exit criteria:** rep opens app and the first thing they see is "what to do next, in order," with ≥3 actionable rows above the fold on a mid-range Android.

### Phase 8 — Persistent contact actions on every screen — **M**
- Pipedrive shows tap-to-call and tap-to-SMS *everywhere* a contact appears, not just on the detail screen. Match that.
- **Inline row actions:** add small call + SMS icon buttons on every list row that has a phone — Today rows, Deals kanban cards, Leads list, search results, Contacts list. Stop event propagation so they don't open the row.
- **Sticky action bar on detail screens:** below the tab strip from Phase 9 (or above the bottom nav, whichever feels right in dogfood), a thin sticky bar with Call / SMS / Email buttons against the deal/lead's primary contact. Always visible while scrolling the detail content.
- **Hang-up is already global:** `renderActiveCallBannerMobile` already overlays above the bottom nav across all routes — confirm it survives every new screen we add and doesn't get clobbered by tab switches inside Phase 9.
- **Wiring:** all buttons reuse existing plumbing — `dialViaTwilioBridge(phone, entityId, entityType, contactName)` for call, the existing mobile SMS modal for SMS, the mobile email modal for email. No new endpoints; no new state.
- **Friendly errors:** if the contact has no phone, the call/SMS button is hidden (not greyed); if the rep has no mobile in their profile, tap shows the existing "Add your mobile in Settings → My Profile" toast.
- **Depends on:** existing Twilio dial/hangup foundation; Phase 9 only for the sticky-bar placement (the inline row actions can ship before Phase 9).
- **Exit criteria:** rep can call any customer from any list in 2 taps (call icon + confirm), and can hang up from any screen via the active-call banner without losing context.

### Phase 9 — Mobile deal detail: tab strip — **S**
- Add a horizontal tab strip *inside* the existing `_renderEntityDetailMobile`: Activity / Notes / Email / SMS / Files / Person.
- The current single-column content moves into the Activity tab as its first version (so the screen looks identical on day one of this phase). Subsequent phases peel pieces out into their own tabs.
- Tab content lazy-renders; selected tab persisted in `_state` keyed by entity for the session.
- **Depends on:** nothing.
- **Exit criteria:** tab strip visible, switches without flicker, no existing detail-screen feature is removed.

### Phase 10 — Activity tab — **M**
- Reverse-chronological feed: scheduled activities (future) at top, then completed/logged activities below.
- Each row: icon + type + when + one-line preview + who did it.
- Inline complete/reschedule action on scheduled rows.
- **Depends on:** Phase 9, Phase 1, Phase 2.
- **Exit criteria:** matches Pipedrive's deal "activity" feel within an A/B side-by-side.

---

## Tier 2 — Habit Reinforcement (Phases 11–17)

Once the daily loop holds, these are the features reps lean on weekly. Without them they'd grumble but wouldn't quit. With them, the wrapper feels finished.

### Phase 11 — Notes tab — **S**
- Threaded notes for the deal, newest first. Tap-to-expand long notes.
- Uses the existing mobile note modal (already built) for create/edit.
- **Depends on:** Phase 9.
- **Exit criteria:** notes added on desktop appear on mobile within realtime latency, and vice-versa.

### Phase 12 — Email tab + auto-log on send — **M**
- Email tab shows send history per deal.
- When email is sent from mobile (once Path A unblocks), auto-create an `email_sent` row tagged to the deal.
- Tap email row → preview body + reply button.
- **Depends on:** Phase 9 + email send infrastructure (currently blocked on org policy).
- **Exit criteria:** rep sends email from mobile, switches to desktop, sees it in the deal's email tab without refresh.

### Phase 13 — SMS tab + auto-log inbound — **M**
- SMS tab shows the per-deal SMS thread (existing data + new entries).
- Inbound SMS routing: when a customer texts the company Twilio number, match by phone → newest open deal for that contact → log + push.
- **Depends on:** Phase 9, existing Twilio inbound webhook.
- **Exit criteria:** customer sends a text, rep gets a push, opens app, inbound message is on the SMS tab of the right deal.

### Phase 14 — Inbound call routing + auto-log — **M**
- Inbound call to company number → look up number → newest open deal for that contact → forward to assigned rep → after-call webhook logs + creates `call_logs` row tagged to deal.
- If no deal match: ring a default queue + create a "new lead" stub.
- **Depends on:** existing Twilio infrastructure.
- **Exit criteria:** customer calls in, rep sees it logged on the deal within a minute, with recording link if applicable.

### Phase 15 — Files tab (mobile-aware) — **S**
- Files tab on deal detail. Reuses the existing `takeMobilePhoto` and `entity_files` pipeline as-is — this phase is purely a render surface.
- "Take photo" CTA at top calls `takeMobilePhoto(entityId, entityType)` unchanged.
- Existing files render as a grid of thumbnails (with PDF icon for non-images), reading from the already-populated `spartan_files_<type>_<id>` localStorage that `dbLoadAll` hydrates.
- **Depends on:** Phase 9.
- **Exit criteria:** rep takes a photo on a window measurement visit, returns to office, photo is on the deal's Files tab on desktop.

### Phase 16 — Person tab — **S**
- Person tab: contact name, phone (tap-to-call), email (tap-to-compose), address (tap-to-map).
- Edit-in-place for the four fields.
- **Depends on:** Phase 9.
- **Exit criteria:** rep can update a customer's phone number entirely on mobile in under 4 taps.

### Phase 17 — Push notifications — **L**
- Wire `@capacitor/push-notifications` (or Firebase) into the wrapper.
- Backend triggers: inbound SMS to my deal, inbound call to my deal, deal reassigned to me, activity scheduled by manager on my behalf, overdue activity reminder at 9am local.
- Per-user preferences UI inside the More tab (toggle each trigger).
- **Depends on:** Phases 13, 14 for the inbound triggers; otherwise standalone.
- **Exit criteria:** rep is offline, customer sends SMS, rep's phone vibrates within 30s of receipt.

---

## Cutover (Phases 18–20)

These exist to make the switch *real* — not technical features, but the things that decide whether reps actually stop opening Pipedrive.

### Phase 18 — Quick-add + Lost-reason polish — **M**
- Floating quick-add button (visible from any tab) → New Deal / New Lead / New Activity sheet.
- Lost-reason picker: replace the current free-text "Mark Lost note" with a chip picker (Price / Timing / Competitor / No-response / Other + free-text). Already half-built; this finishes it.
- Lost-reasons aggregate report visible to managers (desktop only — reps don't need it).
- **Depends on:** existing Mark Lost flow.
- **Exit criteria:** all new deals/leads can be created from any screen in ≤3 taps; manager can pull a lost-reason breakdown by month.

### Phase 19 — Dogfood + bug bash — **L**
- 1 week of live use by 2 reps + sales manager. Daily standup to triage what's broken or missing.
- Fix list capped at things that block daily use; everything else gets parked.
- Specific things to verify under load: realtime channel cap (we're at 2 channels, watch for ~10-listener drift), camera upload retry on flaky cell signal, Twilio call leg hangup race, activity-prompt fatigue (do reps start always-skipping?).
- **Depends on:** all prior phases.
- **Exit criteria:** zero P0 bugs open for 48 hours; reps voluntarily report it feels "as good as Pipedrive" for their main loop.

### Phase 20 — Cutover + Pipedrive shutoff — **M**
- Pick cutover style with the boss: hard cut (everyone moves Monday) vs parallel run (2-week overlap, double-entry tolerated).
- Recommendation: hard cut on a Monday after a Friday training session. Parallel run sounds safer but reps will keep using Pipedrive and never actually move.
- Training: 30-minute screen-share walkthrough + 1-page laminated cheat-sheet (Pipedrive habit → Spartan equivalent, side-by-side).
- Cancel Pipedrive subscription only after 2 full weeks of clean Spartan usage with no rep escalations.
- **Depends on:** Phase 19.
- **Exit criteria:** Pipedrive subscription cancelled; no rep has logged into Pipedrive for 14 consecutive days.

---

## Dependency map (high-level)

```
Phase 1 (data model)
   ├─→ Phase 2 (schedule modal) ─→ Phase 3 (chip) ─┐
   │                            └─→ Phase 4 (prompt)│
   ├─→ Phase 5 (overdue badge) ←─┘                  │
   └─→ Phase 6 (today data) ─→ Phase 7 (today render + above-fold)

Phase 8 (contact actions everywhere) — uses existing Twilio foundation; sticky-bar sub-piece slots in once Phase 9 lands

Phase 9 (tab strip)
   ├─→ Phase 10 (Activity)
   ├─→ Phase 11 (Notes)
   ├─→ Phase 12 (Email)  ←── blocked on email send (org policy)
   ├─→ Phase 13 (SMS)
   ├─→ Phase 15 (Files)
   └─→ Phase 16 (Person)

Phase 14 (inbound calls) — independent
Phase 17 (push) — needs 13, 14 for triggers
Phase 18 (quick-add + lost-reasons) — independent
Phase 19 (dogfood) — needs everything above
Phase 20 (cutover) — needs 19
```

## Rough total

- Tier 1 (1–10): ~3 weeks of focused engineering
- Tier 2 (11–17): ~3 weeks
- Cutover (18–20): ~2 weeks including the dogfood window

**Realistic calendar with one engineer + other ongoing work: 10–12 weeks from kickoff to Pipedrive shutoff.**

## Things this plan deliberately does NOT do

- No data migration from Pipedrive (per direction).
- No rework of the Capacitor wrapper, Google Sign-In, bottom nav, realtime split, camera pipeline, calendar push, or Twilio call/hangup flow — those are foundation, locked.
- No custom fields per pipeline (Tier 3, skipped).
- No workflow automation engine (Tier 3, skipped).
- No web visitor tracking / Smart Docs / Smart Contact data (Tier 3, skipped).
- No desktop UI rework — desktop stays as-is; this is a mobile-first cutover.
- No new pipeline structure — we use what's already in Spartan; refinements happen during dogfood (Phase 19) if reps surface them.

## Open questions for the boss before kickoff

1. Hard cut vs parallel run? (Recommendation in Phase 20.)
2. Who are the 2 dogfood reps for Phase 19?
3. Confirm we can cancel Pipedrive billing on rep sign-off (no contract lock-in surprises).
4. Push notification provider: Firebase (free) vs OneSignal (managed, ~$0 at our volume) — preference?
5. Lost-reason chip list — does sales manager want to define these or let us seed defaults and adjust later?
