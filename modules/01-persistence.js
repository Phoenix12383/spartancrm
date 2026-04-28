// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 01-persistence.js
// Extracted from original index.html lines 57-521
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE — Supabase + localStorage cache
// ══════════════════════════════════════════════════════════════════════════════
var SUPABASE_URL = 'https://sedpmsgiscowohpqdjza.supabase.co';
var SUPABASE_KEY = 'sb_publishable_yBluf2LlIAhewDUbNz3f5w_iiCNK6eY';
var _sb = null;
var _dbReady = false;

function initSupabase() {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[Spartan] Supabase client initialised');
    return true;
  }
  console.warn('[Spartan] Supabase JS not loaded — running in offline mode');
  return false;
}

// -- Field mapping: JS camelCase <-> DB snake_case --
function jobToDb(j) {
  return {id:j.id, job_number:j.jobNumber||null, deal_id:j.dealId||null, contact_id:j.contactId||null,
    title:j.title||'', status:j.status||'a_check_measure', branch:j.branch||'VIC',
    street:j.street||'', suburb:j.suburb||'', state:j.state||'', postcode:j.postcode||'',
    val:j.val||0, payment_method:j.paymentMethod||'cod',
    cad_data:j.cadData||null, cad_survey_data:j.cadSurveyData||null,
    // Step 5 §2.1: cadFinalData is the Sales-Manager-locked design that gets e-signed.
    // Step 5 §2.1: per-frame time estimates sourced from CAD's totals payload on save.
    // Both nullable for legacy/pre-Step-5 jobs.
    cad_final_data:j.cadFinalData||null,
    estimated_install_minutes:(typeof j.estimatedInstallMinutes === 'number') ? j.estimatedInstallMinutes : null,
    estimated_production_minutes:(typeof j.estimatedProductionMinutes === 'number') ? j.estimatedProductionMinutes : null,
    station_times:j.stationTimes||null,
    // Step 4 §4: track which quote this job originated from (null for legacy jobs built pre-Step-4).
    source_quote_id:j.sourceQuoteId||null,
    cm_booked_date:j.cmBookedDate||null, cm_booked_time:j.cmBookedTime||null,
    cm_assigned_to:j.cmAssignedTo||null, cm_completed_at:j.cmCompletedAt||null,
    // Step 5 §4: PDF fields now round-trip via serialisers. cm_doc_url was already
    // being written at line ~1089 but wasn't being read back — fixing that here too.
    cm_doc_url:j.cmDocUrl||null,
    final_signed_pdf_url:j.finalSignedPdfUrl||null,
    final_rendered_pdf_url:j.finalRenderedPdfUrl||null,
    final_signed_at:j.finalSignedAt||null,
    install_date:j.installDate||null, install_time:j.installTime||null,
    install_crew:j.installCrew||[], install_completed_at:j.installCompletedAt||null,
    production_status:j.productionStatus||null, factory_order_id:j.factoryOrderId||null,
    claims:j.claims||null, held:!!j.held, hold_reason:j.holdReason||null,
    order_suffix:j.orderSuffix||'O', legal_entity:j.legalEntity||null, notes:j.notes||null};
}
function dbToJob(r) {
  return {id:r.id, jobNumber:r.job_number, dealId:r.deal_id, contactId:r.contact_id,
    title:r.title, status:r.status, branch:r.branch,
    street:r.street||'', suburb:r.suburb||'', state:r.state||'', postcode:r.postcode||'',
    val:Number(r.val)||0, paymentMethod:r.payment_method||'cod',
    cadData:r.cad_data, cadSurveyData:r.cad_survey_data,
    // Step 5 §2.1: final design data, time estimates, per-station breakdown.
    cadFinalData:r.cad_final_data||null,
    estimatedInstallMinutes:(typeof r.estimated_install_minutes === 'number') ? r.estimated_install_minutes : null,
    estimatedProductionMinutes:(typeof r.estimated_production_minutes === 'number') ? r.estimated_production_minutes : null,
    stationTimes:r.station_times||null,
    sourceQuoteId:r.source_quote_id||null,
    cmBookedDate:r.cm_booked_date, cmBookedTime:r.cm_booked_time,
    cmAssignedTo:r.cm_assigned_to, cmCompletedAt:r.cm_completed_at,
    // Step 5 §4: PDF fields now round-trip.
    cmDocUrl:r.cm_doc_url||null,
    finalSignedPdfUrl:r.final_signed_pdf_url||null,
    finalRenderedPdfUrl:r.final_rendered_pdf_url||null,
    finalSignedAt:r.final_signed_at,
    installDate:r.install_date, installTime:r.install_time,
    installCrew:r.install_crew||[], installCompletedAt:r.install_completed_at,
    productionStatus:r.production_status, factoryOrderId:r.factory_order_id,
    claims:r.claims, held:!!r.held, holdReason:r.hold_reason,
    orderSuffix:r.order_suffix||'O', legalEntity:r.legal_entity, notes:r.notes,
    created:r.created_at};
}

// -- Field mapping: JS camelCase <-> DB snake_case --
function dealToDb(d) {
  return {id:d.id, title:d.title, cid:d.cid||null, pid:d.pid, sid:d.sid, val:d.val||0,
    rep:d.rep||'', branch:d.branch||'VIC', street:d.street||'', suburb:d.suburb||'',
    state:d.state||'', postcode:d.postcode||'', age:d.age||0,
    won:!!d.won, lost:!!d.lost, won_date:d.wonDate||null, created:d.created||null,
    close_date:d.closeDate||null, job_ref:d.jobRef||null, payment_method:d.paymentMethod||null,
    cad_data:d.cadData||null,
    // Multi-quote fields (spec §3.1) — cad_data is kept as a mirror of the last-saved quote for backward compat
    quotes:d.quotes||[], active_quote_id:d.activeQuoteId||null, won_quote_id:d.wonQuoteId||null,
    // Step 4 §5: previous stage id captured before won-transition, so unwind can restore it.
    pre_won_stage_id:d.preWonStageId||null,
    tags:d.tags||[], activities:d.activities||[]};
}
function dbToDeal(r) {
  return {id:r.id, title:r.title, cid:r.cid, pid:r.pid, sid:r.sid, val:Number(r.val)||0,
    rep:r.rep, branch:r.branch, street:r.street||'', suburb:r.suburb||'',
    state:r.state||'', postcode:r.postcode||'', age:r.age||0,
    won:!!r.won, lost:!!r.lost, wonDate:r.won_date, created:r.created,
    closeDate:r.close_date, jobRef:r.job_ref, paymentMethod:r.payment_method,
    cadData:r.cad_data,
    // Multi-quote fields (spec §3.1) — default to empty/null so legacy rows behave as if they have no quotes yet
    quotes:Array.isArray(r.quotes)?r.quotes:[], activeQuoteId:r.active_quote_id||null, wonQuoteId:r.won_quote_id||null,
    preWonStageId:r.pre_won_stage_id||null,
    tags:r.tags||[], activities:r.activities||[]};
}
function leadToDb(l) {
  return {id:l.id, fn:l.fn||'', ln:l.ln||'', phone:l.phone||'', email:l.email||'',
    street:l.street||'', suburb:l.suburb||'', state:l.state||'VIC', postcode:l.postcode||'',
    val:l.val||0, source:l.source||'',
    owner:l.owner||'', branch:l.branch||'VIC', status:l.status||'New',
    notes:l.notes||'', converted:!!l.converted, converted_deal_id:l.convertedDealId||l.dealRef||null,
    // Multi-quote fields (spec §3.1 — leads mirror deals so quotes transfer verbatim on conversion)
    quotes:l.quotes||[], active_quote_id:l.activeQuoteId||null, won_quote_id:l.wonQuoteId||null,
    created:l.created||null};
}
function dbToLead(r) {
  return {id:r.id, fn:r.fn, ln:r.ln, phone:r.phone, email:r.email,
    street:r.street||'', suburb:r.suburb, state:r.state, postcode:r.postcode||'',
    val:Number(r.val)||0, source:r.source,
    owner:r.owner, branch:r.branch, status:r.status,
    notes:r.notes, converted:!!r.converted, convertedDealId:r.converted_deal_id, dealRef:r.converted_deal_id,
    // Multi-quote fields (spec §3.1)
    quotes:Array.isArray(r.quotes)?r.quotes:[], activeQuoteId:r.active_quote_id||null, wonQuoteId:r.won_quote_id||null,
    created:r.created, activities:[]};
}
function contactToDb(c) {
  return {id:c.id, fn:c.fn||'', ln:c.ln||'', co:c.co||'', email:c.email||'',
    phone:c.phone||'', street:c.street||'', suburb:c.suburb||'', state:c.state||'VIC',
    postcode:c.postcode||'',
    type:c.type||'residential', source:c.source||'', rep:c.rep||'',
    branch:c.branch||'VIC', tags:c.tags||[], status:c.status||'Active'};
}
function dbToContact(r) {
  return {id:r.id, fn:r.fn, ln:r.ln, co:r.co, email:r.email,
    phone:r.phone, street:r.street||'', suburb:r.suburb, state:r.state,
    postcode:r.postcode||'',
    type:r.type, source:r.source, rep:r.rep,
    branch:r.branch, tags:r.tags||[], status:r.status||'Active'};
}
function actToDb(a, entityType, entityId) {
  return {id:a.id, entity_type:entityType, entity_id:entityId, type:a.type||'note',
    subject:a.subject||'', text:a.text||'', by_user:a.by||'', date:a.date||'',
    time:a.time||'', done:!!a.done, due_date:a.dueDate||'', duration:a.duration||null,
    scheduled:!!a.scheduled, opens:a.opens||0, opened:!!a.opened, opened_at:a.openedAt||null,
    clicked:!!a.clicked, gmail_msg_id:a.gmailMsgId||null, to_addr:a.to||'', cc:a.cc||'',
    cal_link:a.calLink||null};
}
function dbToAct(r) {
  return {id:r.id, type:r.type, subject:r.subject, text:r.text, by:r.by_user,
    date:r.date, time:r.time, done:!!r.done, dueDate:r.due_date,
    duration:r.duration, scheduled:!!r.scheduled, opens:r.opens||0,
    opened:!!r.opened, openedAt:r.opened_at, clicked:!!r.clicked,
    gmailMsgId:r.gmail_msg_id, to:r.to_addr, cc:r.cc, calLink:r.cal_link};
}
function emailToDb(e) {
  return {id:e.id, to_addr:e.to||'', to_name:e.toName||'', subject:e.subject||'',
    body:e.body||'', date:e.date||'', time:e.time||'', by_user:e.by||'',
    gmail_msg_id:e.gmailMsgId||null, deal_id:e.dealId||null, lead_id:e.leadId||null,
    contact_id:e.contactId||null, entity_type:e.entityType||'', entity_id:e.entityId||'',
    opened:!!e.opened, opened_at:e.openedAt||null, opens:e.opens||0, clicked:!!e.clicked};
}
function dbToEmail(r) {
  return {id:r.id, to:r.to_addr, toName:r.to_name, subject:r.subject,
    body:r.body, date:r.date, time:r.time, by:r.by_user,
    gmailMsgId:r.gmail_msg_id, dealId:r.deal_id, leadId:r.lead_id,
    contactId:r.contact_id, entityType:r.entity_type, entityId:r.entity_id,
    opened:!!r.opened, openedAt:r.opened_at, opens:r.opens||0, clicked:!!r.clicked};
}

// -- Supabase data layer --
// ── Multi-quote migration (spec §3.1) ────────────────────────────────────────
// One-time migration: for any deal/lead with legacy non-null cadData, create a
// single `Quote 1` entry in deal.quotes[] / lead.quotes[] and set activeQuoteId='q_1'.
// Legacy cadData is preserved as a mirror for backward compat with code that still reads it.
// Runs once per browser (flag: spartan_quotes_migration_v1). Safe to run again if the flag is cleared.
var QUOTES_MIGRATION_FLAG = 'spartan_quotes_migration_v1';

function _buildQuoteFromCadData(cadData) {
  var items = (cadData && Array.isArray(cadData.projectItems)) ? cadData.projectItems : [];
  return {
    id: 'q_1',
    label: 'Quote 1',
    projectItems: items,
    totalPrice: (cadData && typeof cadData.totalPrice === 'number') ? cadData.totalPrice : 0,
    frameCount: items.length,
    savedAt: (cadData && cadData.savedAt) ? cadData.savedAt : null,
    // (v3.1) Preserve install/production/station time totals when present
    // on legacy cadData so the won-quote selection can read them later
    // without re-opening CAD. Null when CAD pre-v2.0 wrote the original.
    totals: (cadData && cadData.totals) ? cadData.totals : null,
    notes: ''
  };
}

// Migrates the in-memory arrays in place and returns counts + the rows it touched
// (so the caller can persist them). Does NOT check the migration flag — caller decides.
function _migrateQuotesInPlace(deals, leads) {
  var touchedDeals = [];
  var touchedLeads = [];
  (deals || []).forEach(function(d) {
    // Only migrate if legacy cadData exists AND quotes[] is currently empty/missing.
    // This keeps the migration idempotent and avoids clobbering anything already migrated.
    var hasCad = d.cadData && d.cadData.projectItems && d.cadData.projectItems.length > 0;
    var hasQuotes = Array.isArray(d.quotes) && d.quotes.length > 0;
    if (hasCad && !hasQuotes) {
      d.quotes = [_buildQuoteFromCadData(d.cadData)];
      d.activeQuoteId = 'q_1';
      // Leave d.cadData intact — spec §3.1 says keep it as a mirror for backward compat.
      touchedDeals.push(d);
    }
  });
  (leads || []).forEach(function(l) {
    var hasCad = l.cadData && l.cadData.projectItems && l.cadData.projectItems.length > 0;
    var hasQuotes = Array.isArray(l.quotes) && l.quotes.length > 0;
    if (hasCad && !hasQuotes) {
      l.quotes = [_buildQuoteFromCadData(l.cadData)];
      l.activeQuoteId = 'q_1';
      touchedLeads.push(l);
    }
  });
  return { deals: touchedDeals, leads: touchedLeads };
}

function runQuotesMigrationIfNeeded(deals, leads) {
  try {
    if (localStorage.getItem(QUOTES_MIGRATION_FLAG) === '1') {
      return { ran: false, dealCount: 0, leadCount: 0 };
    }
  } catch(e) { /* localStorage unavailable — run anyway, safer than skipping */ }

  var touched = _migrateQuotesInPlace(deals, leads);

  // Persist touched rows back to Supabase so the migration is durable.
  // dbUpsert is fire-and-forget; if Supabase is offline the in-memory migration still took effect for this session.
  touched.deals.forEach(function(d) { try { dbUpsert('deals', dealToDb(d)); } catch(e) {} });
  touched.leads.forEach(function(l) { try { dbUpsert('leads', leadToDb(l)); } catch(e) {} });

  try { localStorage.setItem(QUOTES_MIGRATION_FLAG, '1'); } catch(e) {}

  console.log('[Spartan] Multi-quote migration complete — migrated', touched.deals.length, 'deals and', touched.leads.length, 'leads');
  return { ran: true, dealCount: touched.deals.length, leadCount: touched.leads.length };
}

// ── Step 4 §6: won-quote migration for legacy won deals ─────────────────────
// Any deal with won:true but wonQuoteId:null needs its wonQuoteId backfilled so
// that Step 4's gatekeeper (`_requestWonTransition`) and the unwind path both
// have something to work with. Prefer activeQuoteId if it still points at a
// real quote; fall back to the first quote. Runs once per browser, same pattern
// as the Step 1 migration. Flag: spartan_won_quote_migration_v1.
var WON_QUOTE_MIGRATION_FLAG = 'spartan_won_quote_migration_v1';

function _migrateWonQuotesInPlace(deals) {
  var touched = [];
  (deals || []).forEach(function(d) {
    if (d.won === true && !d.wonQuoteId && Array.isArray(d.quotes) && d.quotes.length > 0) {
      var hasActive = d.activeQuoteId && d.quotes.some(function(q){ return q.id === d.activeQuoteId; });
      var targetId = hasActive ? d.activeQuoteId : d.quotes[0].id;
      d.wonQuoteId = targetId;
      // We don't know the pre-won stage retroactively; unwind modal falls back
      // to "first non-won non-lost stage" when preWonStageId is null.
      if (!('preWonStageId' in d) || d.preWonStageId === undefined) d.preWonStageId = null;
      touched.push(d);
    }
  });
  return touched;
}

function runWonQuoteMigrationIfNeeded(deals) {
  try {
    if (localStorage.getItem(WON_QUOTE_MIGRATION_FLAG) === '1') {
      return { ran: false, dealCount: 0 };
    }
  } catch(e) { /* localStorage unavailable — run anyway, safer than skipping */ }

  var touched = _migrateWonQuotesInPlace(deals);
  touched.forEach(function(d) { try { dbUpsert('deals', dealToDb(d)); } catch(e) {} });
  try { localStorage.setItem(WON_QUOTE_MIGRATION_FLAG, '1'); } catch(e) {}

  console.log('[Spartan] Won-quote migration complete — backfilled', touched.length, 'deals');
  return { ran: true, dealCount: touched.length };
}

// Structural equality check for arrays of CRM records. Realtime echoes and
// periodic refetches produce fresh-reference arrays whose contents are
// identical to current state; without this, every refetch triggers a full
// re-render and kicks focus out of any active input (e.g. leads search).
function _recordsEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    var x = a[i], y = b[i];
    if (x === y) continue;
    if (!x || !y) return false;
    var xk = Object.keys(x), yk = Object.keys(y);
    if (xk.length !== yk.length) return false;
    for (var j = 0; j < xk.length; j++) {
      var k = xk[j];
      if (x[k] === y[k]) continue;
      if (typeof x[k] === 'object' && typeof y[k] === 'object' && x[k] !== null && y[k] !== null) {
        // Nested object/array: fall back to JSON compare. Slower but rare.
        try { if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return false; } catch(e) { return false; }
      } else {
        return false;
      }
    }
  }
  return true;
}

async function dbLoadAll() {
  if (!_sb) { if (!initSupabase()) return false; }
  try {
    var results = await Promise.all([
      _sb.from('contacts').select('*'),
      _sb.from('leads').select('*'),
      _sb.from('deals').select('*'),
      _sb.from('jobs').select('*'),
      _sb.from('invoices').select('*'),
      _sb.from('factory_orders').select('*'),
      _sb.from('factory_items').select('*'),
      _sb.from('supplier_bills').select('*'),
      _sb.from('expenses').select('*'),
      _sb.from('recon_items').select('*'),
      _sb.from('service_calls').select('*'),
      _sb.from('users').select('*'),
      _sb.from('activities').select('*'),
      _sb.from('job_files').select('*'),
      _sb.from('call_logs').select('*').order('started_at', { ascending: false }).limit(500),
      _sb.from('sms_logs').select('*').order('sent_at', { ascending: false }).limit(1000),
      _sb.from('sms_templates').select('*').order('name', { ascending: true }),
    ]);
    var errors = results.filter(function(r){ return r.error; });
    if (errors.length > 0) { console.warn('[Spartan] DB load errors:', errors.map(function(e){return e.error.message;})); }

    var contacts = (results[0].data||[]).map(dbToContact);
    var leads = (results[1].data||[]).map(dbToLead);
    var deals = (results[2].data||[]).map(function(r){ return dbToDeal(r); });
    var jobs = (results[3].data||[]).map(dbToJob);

    // ── Activities: bucket by entity so we can attach them below ────────────
    // Activities live in their own table (not embedded on the entity row).
    // dbToLead / dbToDeal / dbToJob return entities with `activities: []`, so
    // without this step every dbLoadAll wipes locally-added activities.
    var actRows = results[12].data || [];
    var actBuckets = {};  // key "type:id" → array of activities, newest first
    actRows.forEach(function(row) {
      if (!row.entity_id || !row.entity_type) return;
      var key = row.entity_type + ':' + row.entity_id;
      (actBuckets[key] = actBuckets[key] || []).push(dbToAct(row));
    });
    // Sort each bucket by date + time desc so the timeline shows newest first.
    Object.keys(actBuckets).forEach(function(k) {
      actBuckets[k].sort(function(a, b) {
        var ka = (a.date || '') + ' ' + (a.time || '');
        var kb = (b.date || '') + ' ' + (b.time || '');
        return kb.localeCompare(ka);
      });
    });
    // Merge helper — remote activities plus any local-only orphans (activities
    // added locally that haven't yet landed in Supabase, so dbInsert's async
    // write didn't make it into this fetch).
    function _mergeActivities(remote, local) {
      var remoteIds = {};
      remote.forEach(function(a){ if (a && a.id) remoteIds[a.id] = 1; });
      var orphans = (local || []).filter(function(a){ return a && a.id && !remoteIds[a.id]; });
      return orphans.concat(remote);
    }
    // Attach to entities. Leads/deals/jobs embed activities in each record;
    // contacts have their own top-level map (state.contactActivities).
    var _stForActs = getState();
    var localLeadsById = {}; (_stForActs.leads || []).forEach(function(l){ localLeadsById[l.id] = l; });
    var localDealsById = {}; (_stForActs.deals || []).forEach(function(d){ localDealsById[d.id] = d; });
    var localJobsById  = {}; (_stForActs.jobs  || []).forEach(function(j){ localJobsById[j.id]  = j; });
    leads.forEach(function(l) {
      l.activities = _mergeActivities(actBuckets['lead:' + l.id] || [], (localLeadsById[l.id] || {}).activities);
    });
    deals.forEach(function(d) {
      d.activities = _mergeActivities(actBuckets['deal:' + d.id] || [], (localDealsById[d.id] || {}).activities);
    });
    jobs.forEach(function(j) {
      j.activities = _mergeActivities(actBuckets['job:' + j.id] || [], (localJobsById[j.id] || {}).activities);
    });
    // Contact activities map — merged the same way.
    var nextContactActs = {};
    var localCA = _stForActs.contactActivities || {};
    Object.keys(actBuckets).forEach(function(k) {
      if (k.indexOf('contact:') === 0) {
        var cid = k.slice('contact:'.length);
        nextContactActs[cid] = _mergeActivities(actBuckets[k], localCA[cid]);
      }
    });
    // Preserve local-only contact activity buckets (contacts with orphan activities only).
    Object.keys(localCA).forEach(function(cid) {
      if (!nextContactActs[cid]) nextContactActs[cid] = _mergeActivities([], localCA[cid]);
    });

    // Run the one-time multi-quote migration (spec §3.1) before state merge so
    // downstream code sees the already-migrated shape on first render.
    runQuotesMigrationIfNeeded(deals, leads);
    // Step 4 §6: backfill wonQuoteId for legacy won deals. MUST run after Step 1
    // migration so every deal has a quotes[] array before this one reads it.
    runWonQuoteMigrationIfNeeded(deals);
    var invoices = results[4].data||[];
    var factoryOrders = results[5].data||[];
    var factoryItems = results[6].data||[];
    var supplierBills = results[7].data||[];
    var expenses = results[8].data||[];
    var reconItems = results[9].data||[];
    var serviceCalls = results[10].data||[];
    var dbUsers = results[11].data||[];

    // Merge into state
    var st = getState();
    if (contacts.length > 0 || leads.length > 0 || deals.length > 0 || jobs.length > 0) {
      // Preserve any locally-created entities that haven't landed in Supabase yet.
      // dbInsert is fire-and-forget, so there's a window where a realtime event
      // on a *different* table (e.g. leads after lead-to-deal conversion) can
      // trigger dbLoadAll before the deal insert has completed. Without this
      // guard, the merge below would wipe the new deal from local state and
      // briefly strand the user on a "deal not found" bounce.
      function _preserveLocal(loaded, local) {
        if (!Array.isArray(loaded) || !Array.isArray(local)) return loaded;
        var loadedIds = {};
        loaded.forEach(function(r){ if (r && r.id) loadedIds[r.id] = 1; });
        var orphans = local.filter(function(r){ return r && r.id && !loadedIds[r.id]; });
        return orphans.length > 0 ? orphans.concat(loaded) : loaded;
      }
      // Only include slices that actually changed, so setState doesn't notify
      // listeners (and trigger renderPage) when realtime echoes unchanged rows.
      var nextContacts = contacts.length > 0 ? _preserveLocal(contacts, st.contacts) : st.contacts;
      var nextLeads    = leads.length    > 0 ? _preserveLocal(leads, st.leads)       : st.leads;
      var nextDeals    = deals.length    > 0 ? _preserveLocal(deals, st.deals)       : st.deals;
      var nextJobs     = jobs.length     > 0 ? _preserveLocal(jobs, st.jobs)         : st.jobs;
      var _patch = {};
      if (!_recordsEqual(nextContacts, st.contacts)) _patch.contacts = nextContacts;
      if (!_recordsEqual(nextLeads,    st.leads))    _patch.leads    = nextLeads;
      if (!_recordsEqual(nextDeals,    st.deals))    _patch.deals    = nextDeals;
      if (!_recordsEqual(nextJobs,     st.jobs))     _patch.jobs     = nextJobs;
      // Contact activities map — compare via JSON since it's an object map
      // rather than an array of records (_recordsEqual only handles arrays).
      try {
        if (JSON.stringify(nextContactActs) !== JSON.stringify(st.contactActivities || {})) {
          _patch.contactActivities = nextContactActs;
        }
      } catch(e) { _patch.contactActivities = nextContactActs; }
      // skipSync is critical here — without it, data we JUST loaded from
      // Supabase gets re-upserted to Supabase, which echoes back via realtime
      // and triggers another dbLoadAll, on loop. Every iteration wipes the
      // DOM via renderPage, which is what kicks focus out of inputs.
      if (Object.keys(_patch).length > 0) setState(_patch, {skipSync: true});
    }

    // Persist individual stores
    if (invoices.length > 0) localStorage.setItem('spartan_invoices', JSON.stringify(invoices));
    if (factoryOrders.length > 0) localStorage.setItem('spartan_factory_orders', JSON.stringify(factoryOrders));
    if (factoryItems.length > 0) localStorage.setItem('spartan_factory_items', JSON.stringify(factoryItems));
    if (supplierBills.length > 0) localStorage.setItem('spartan_supplier_bills', JSON.stringify(supplierBills));
    if (expenses.length > 0) localStorage.setItem('spartan_expenses', JSON.stringify(expenses));
    if (reconItems.length > 0) localStorage.setItem('spartan_recon', JSON.stringify(reconItems));
    if (serviceCalls.length > 0) localStorage.setItem('spartan_service_calls', JSON.stringify(serviceCalls));
    var jobFilesRows = results[13].data || [];
    if (jobFilesRows.length > 0) {
      var byJob = {};
      jobFilesRows.forEach(function(f) {
        if (!byJob[f.job_id]) byJob[f.job_id] = [];
        byJob[f.job_id].push({ name:f.name, category:f.category, dataUrl:f.data_url, uploadedBy:f.uploaded_by, at:f.created_at });
      });
      Object.keys(byJob).forEach(function(jobId) {
        localStorage.setItem('spartan_files_' + jobId, JSON.stringify(byJob[jobId]));
      });
    }
    if (dbUsers.length > 0) {
      dbUsers = dbUsers.map(function(u) {
        return { id:u.id, name:u.name, email:u.email, role:u.role, branch:u.branch,
          phone:u.phone, initials:u.initials, active:u.active!==false,
          customPerms:u.custom_perms||null,
          serviceStates:Array.isArray(u.service_states)?u.service_states:null,
          googlePic:u.google_pic||null,
          pw:u.pw||'spartan2026' };
      });
      // Defensive: if the currently signed-in user isn't yet reflected in Supabase
      // (e.g. a just-saved user whose upsert is still in flight), keep them in the
      // local list to prevent getCurrentUser() returning null and emptying the sidebar.
      var currentUid = localStorage.getItem('spartan_current_user');
      if (currentUid && !dbUsers.find(function(u){return u.id===currentUid;})) {
        var localUsers = (function(){ try { return JSON.parse(localStorage.getItem('spartan_users')||'[]'); } catch(e) { return []; } })();
        var cached = localUsers.find(function(u){return u.id===currentUid;});
        if (cached) dbUsers.push(cached);
      }
      localStorage.setItem('spartan_users', JSON.stringify(dbUsers));
    }

    // ── Call logs (Twilio Voice, stage 2) ────────────────────────────────────
    // Most recent 500 outbound + inbound calls. Browser-side renderers
    // (call history list, deal-detail timeline filters) read from state.callLogs.
    var callLogs = (results[14] && results[14].data) || [];
    if (callLogs.length > 0 || (getState().callLogs || []).length > 0) {
      // Only patch state when the slice actually changed — avoids the cascading
      // re-render that the comment around line 440 warns about.
      if (!_recordsEqual(callLogs, getState().callLogs || [])) {
        setState({ callLogs: callLogs }, { skipSync: true });
      }
    }

    // ── SMS logs + templates (Twilio SMS, stage 4) ──────────────────────────
    var smsLogs = (results[15] && results[15].data) || [];
    if (smsLogs.length > 0 || (getState().smsLogs || []).length > 0) {
      if (!_recordsEqual(smsLogs, getState().smsLogs || [])) {
        setState({ smsLogs: smsLogs }, { skipSync: true });
      }
    }
    var smsTemplates = (results[16] && results[16].data) || [];
    if (smsTemplates.length > 0 || (getState().smsTemplates || []).length > 0) {
      if (!_recordsEqual(smsTemplates, getState().smsTemplates || [])) {
        setState({ smsTemplates: smsTemplates }, { skipSync: true });
      }
    }

    _dbReady = true;
    console.log('[Spartan] Loaded from Supabase:', contacts.length, 'contacts,', leads.length, 'leads,', deals.length, 'deals,', jobs.length, 'jobs,', callLogs.length, 'call logs,', smsLogs.length, 'SMS,', smsTemplates.length, 'SMS templates');
    return true;
  } catch(e) {
    console.error('[Spartan] DB load failed, using localStorage cache:', e);
    return false;
  }
}

// -- Persist helpers (write to Supabase + keep localStorage in sync) --
// Schema / RLS errors can repeat thousands of times per session (every render
// re-fires the same failing write). Dedupe by table+message so the console
// stays readable and the toast only fires once per unique failure.
var _dbWarnedFailures = {};
function _dbWarnOnce(op, table, msg, showToast) {
  var key = op + '|' + table + '|' + msg;
  if (_dbWarnedFailures[key]) return;
  _dbWarnedFailures[key] = true;
  console.warn('[Spartan] ' + op + ' error (' + table + '):', msg);
  if (showToast && typeof addToast === 'function') {
    addToast("Couldn't save to database — changes only apply to your session", 'warning');
  }
}
function dbInsert(table, row) {
  if (!_sb) return;
  _sb.from(table).insert(row).then(function(res){
    if (res.error) _dbWarnOnce('Insert', table, res.error.message, true);
  });
}
function dbUpdate(table, id, changes) {
  if (!_sb) return;
  // Convert camelCase field names to snake_case for DB
  var dbChanges = {};
  Object.keys(changes).forEach(function(k) {
    var snakeKey = k.replace(/([A-Z])/g, function(m){ return '_' + m.toLowerCase(); });
    dbChanges[snakeKey] = changes[k];
  });
  dbChanges.updated_at = new Date().toISOString();
  _sb.from(table).update(dbChanges).eq('id', id).then(function(res){
    if (res.error) _dbWarnOnce('Update', table, res.error.message, false);
  });
}
function dbDelete(table, id) {
  if (!_sb) return;
  _sb.from(table).delete().eq('id', id).then(function(res){
    if (res.error) _dbWarnOnce('Delete', table, res.error.message, false);
  });
}
function dbUpsert(table, row) {
  if (!_sb) return;
  // Match dbUpdate — convert camelCase field names to snake_case. Without this
  // conversion, every upsert of an invoice / factory order / factory item with
  // camelCased fields (claimPercent, dealValueIncGst, lineItems, issueDate, ...)
  // was being rejected by Postgres and the error swallowed in a console warn.
  var dbRow = {};
  Object.keys(row).forEach(function(k) {
    var snakeKey = k.replace(/([A-Z])/g, function(m){ return '_' + m.toLowerCase(); });
    dbRow[snakeKey] = row[k];
  });
  dbRow.updated_at = new Date().toISOString();
  _sb.from(table).upsert(dbRow).then(function(res){
    if (res.error) _dbWarnOnce('Upsert', table, res.error.message, false);
  });
}

// -- Sync individual storage to Supabase (fire-and-forget) --
function dbSyncInvoices() {
  if (!_sb) return;
  var invoices = JSON.parse(localStorage.getItem('spartan_invoices')||'[]');
  invoices.forEach(function(inv) { dbUpsert('invoices', inv); });
}
function dbSyncFactoryOrders() {
  if (!_sb) return;
  var orders = JSON.parse(localStorage.getItem('spartan_factory_orders')||'[]');
  orders.forEach(function(o) { dbUpsert('factory_orders', o); });
}
function dbSyncFactoryItems() {
  if (!_sb) return;
  var items = JSON.parse(localStorage.getItem('spartan_factory_items')||'[]');
  items.forEach(function(i) { dbUpsert('factory_items', i); });
}

// -- Realtime subscriptions --
function setupRealtime() {
  if (!_sb) return;
  var channel = _sb.channel('spartan-realtime')
    .on('postgres_changes', {event:'*', schema:'public', table:'contacts'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'leads'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'deals'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'jobs'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'invoices'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'factory_orders'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'users'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'call_logs'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'sms_logs'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'sms_templates'}, function(){ dbLoadAll(); })
    .subscribe(function(status){ console.log('[Spartan] Realtime:', status); });
}

// ── MOCK DATA ──────────────────────────────────────────────────────────────
const CONTACTS=[];

const PIPELINES=[
  {id:'p1',name:'Residential',stages:[
    {id:'s1',name:'New Enquiry',prob:10,col:'#94a3b8',ord:1},
    {id:'s2',name:'Measure Booked',prob:25,col:'#60a5fa',ord:2},
    {id:'s3',name:'Quote Sent',prob:50,col:'#f59e0b',ord:3},
    {id:'s4',name:'Follow Up',prob:65,col:'#f97316',ord:4},
    {id:'s5',name:'Won',prob:100,col:'#22c55e',ord:5,isWon:true},
    {id:'s6',name:'Not Proceeding',prob:0,col:'#ef4444',ord:6,isLost:true},
  ]},
  {id:'p2',name:'Commercial',stages:[
    {id:'s7',name:'Initial Contact',prob:10,col:'#94a3b8',ord:1},
    {id:'s8',name:'Site Survey',prob:30,col:'#60a5fa',ord:2},
    {id:'s9',name:'Proposal Sent',prob:50,col:'#f59e0b',ord:3},
    {id:'s10',name:'Negotiation',prob:75,col:'#f97316',ord:4},
    {id:'s11',name:'Won',prob:100,col:'#22c55e',ord:5,isWon:true},
    {id:'s12',name:'Not Proceeding',prob:0,col:'#ef4444',ord:6,isLost:true},
  ]},
];

const DEALS=[];

const NOTIFS=[];

const STATUS_FLOW=[];


