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
    order_suffix:j.orderSuffix||'O', legal_entity:j.legalEntity||null, notes:j.notes||null,
    // DocuSign envelope tracking (set by docusign-send / updated by docusign-webhook)
    docusign_envelope_id:j.docusignEnvelopeId||null,
    docusign_status:j.docusignStatus||null,
    docusign_completed_at:j.docusignCompletedAt||null,
    docusign_declined_at:j.docusignDeclinedAt||null,
    // Variation flow (Manual §6.3) — separate envelope from Final Design.
    has_variation:!!j.hasVariation,
    variation_status:j.variationStatus||null,
    variation_amount:(typeof j.variationAmount === 'number') ? j.variationAmount : null,
    variation_notes:j.variationNotes||null,
    variation_envelope_id:j.variationEnvelopeId||null,
    variation_sent_at:j.variationSentAt||null,
    variation_signed_at:j.variationSignedAt||null,
    variation_resolved_at:j.variationResolvedAt||null,
    final_envelope_sent_at:j.finalEnvelopeSentAt||null,
    tools_required:Array.isArray(j.toolsRequired)?j.toolsRequired:[]};
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
    docusignEnvelopeId:r.docusign_envelope_id||null,
    docusignStatus:r.docusign_status||null,
    docusignCompletedAt:r.docusign_completed_at||null,
    docusignDeclinedAt:r.docusign_declined_at||null,
    // Variation flow round-trip — without these, the webhook's update to
    // variation_status='signed' never surfaces in the browser.
    hasVariation:!!r.has_variation,
    variationStatus:r.variation_status||null,
    variationAmount:(typeof r.variation_amount === 'number') ? r.variation_amount : (r.variation_amount != null ? Number(r.variation_amount) : null),
    variationNotes:r.variation_notes||null,
    variationEnvelopeId:r.variation_envelope_id||null,
    variationSentAt:r.variation_sent_at||null,
    variationSignedAt:r.variation_signed_at||null,
    variationResolvedAt:r.variation_resolved_at||null,
    finalEnvelopeSentAt:r.final_envelope_sent_at||null,
    toolsRequired:Array.isArray(r.tools_required)?r.tools_required:[],
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
    // Brief 5: deal-level type, independent of contact.type. Null is permitted on legacy rows;
    // backfill (Brief 5 Phase 3) will fill them. New deals must carry one of 'residential' | 'commercial'.
    deal_type:d.dealType||null,
    // Brief 4 Phase 2: per-stage entry timestamps {[stageId]: isoTimestamp}
    // populated by moveDealToStage. Used by the commission engine's age-
    // penalty calculation. Empty/null on pre-Phase-2 rows; the calc
    // engine falls back to created date when this is missing.
    stage_history:d.stageHistory||null,
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
    // Brief 5: deal-level type. Read as null when missing — backfill on boot will fill from contact.type
    // (Phase 3). Don't default to 'residential' here; that would short-circuit the backfill detection.
    dealType:r.deal_type||null,
    // Brief 4 Phase 2: stage-entry timestamp map. Empty object on legacy rows.
    stageHistory:r.stage_history||{},
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
function installerToDb(i) {
  return {
    id: i.id,
    first_name: i.firstName || '', last_name: i.lastName || '',
    name: i.name || ((i.firstName||'') + ' ' + (i.lastName||'')).trim(),
    phone: i.phone || null, email: i.email || null,
    street: i.street || null, suburb: i.suburb || null,
    state: i.state || null, postcode: i.postcode || null,
    emergency_name: i.emergencyName || null, emergency_phone: i.emergencyPhone || null,
    role: i.role || 'installer',
    employment_type: i.employmentType || 'employee',
    branch: i.branch || 'VIC',
    start_date: i.startDate || null,
    abn: i.abn || null, license_number: i.licenseNumber || null,
    hourly_rate: i.hourlyRate != null ? i.hourlyRate : 45,
    overtime_rate: i.overtimeRate != null ? i.overtimeRate : 67.50,
    max_hours_per_day: i.maxHoursPerDay != null ? i.maxHoursPerDay : 8,
    login_email: i.loginEmail || null, login_pin: i.loginPin || null,
    colour: i.colour || '#3b82f6',
    notes: i.notes || null,
    active: i.active !== false,
    efficiency_pct: i.efficiencyPct != null ? +i.efficiencyPct : 100,
    tools: i.tools || [], licenses: i.licenses || []
  };
}
function dbToInstaller(r) {
  return {
    id: r.id,
    firstName: r.first_name || '', lastName: r.last_name || '',
    name: r.name || ((r.first_name||'') + ' ' + (r.last_name||'')).trim(),
    phone: r.phone || '', email: r.email || '',
    street: r.street || '', suburb: r.suburb || '',
    state: r.state || '', postcode: r.postcode || '',
    emergencyName: r.emergency_name || '', emergencyPhone: r.emergency_phone || '',
    role: r.role || 'installer',
    employmentType: r.employment_type || 'employee',
    branch: r.branch || 'VIC',
    startDate: r.start_date || '',
    abn: r.abn || '', licenseNumber: r.license_number || '',
    hourlyRate: Number(r.hourly_rate) || 45,
    overtimeRate: Number(r.overtime_rate) || 67.50,
    maxHoursPerDay: Number(r.max_hours_per_day) || 8,
    loginEmail: r.login_email || '', loginPin: r.login_pin || '',
    colour: r.colour || '#3b82f6',
    notes: r.notes || '',
    active: r.active !== false,
    efficiencyPct: r.efficiency_pct != null ? Number(r.efficiency_pct) : 100,
    tools: r.tools || [], licenses: r.licenses || []
  };
}
// ── Vehicles (Jobs CRM fleet) — mirrors saveVehicles() in 17-install-schedule.js
function vehicleToDb(v) {
  var i = v.internal || {};
  return {
    id: v.id,
    name: v.name || '',
    rego: v.rego || null,
    type: v.type || 'van',
    size: v.size || 'medium',
    max_frames: v.maxFrames != null ? +v.maxFrames : 8,
    max_weight_kg: v.maxWeightKg != null ? +v.maxWeightKg : 600,
    internal_length_mm: +i.lengthMm || 0,
    internal_width_mm: +i.widthMm || 0,
    internal_height_mm: +i.heightMm || 0,
    assigned_to: v.assignedTo || null,
    notes: v.notes || null,
    active: v.active !== false
  };
}
function dbToVehicle(r) {
  return {
    id: r.id,
    name: r.name || '',
    rego: r.rego || '',
    type: r.type || 'van',
    size: r.size || 'medium',
    maxFrames: r.max_frames != null ? Number(r.max_frames) : 8,
    maxWeightKg: r.max_weight_kg != null ? Number(r.max_weight_kg) : 600,
    internal: {
      lengthMm: r.internal_length_mm || 0,
      widthMm: r.internal_width_mm || 0,
      heightMm: r.internal_height_mm || 0
    },
    assignedTo: r.assigned_to || '',
    notes: r.notes || '',
    active: r.active !== false
  };
}
// ── Tools (Jobs CRM tool registry) — mirrors saveTools() in 17-install-schedule.js
function toolToDb(t) {
  return {
    id: t.id,
    name: t.name || '',
    category: t.category || 'lifting',
    shared: t.shared !== false,
    assigned_to: t.assignedTo || null,
    notes: t.notes || null,
    active: t.active !== false
  };
}
function dbToTool(r) {
  return {
    id: r.id,
    name: r.name || '',
    category: r.category || 'lifting',
    shared: r.shared !== false,
    assignedTo: r.assigned_to || '',
    notes: r.notes || '',
    active: r.active !== false
  };
}
// ── Installer availability exceptions — mirrors saveAvailability() in 17-install-schedule.js
function availabilityToDb(a) {
  return {
    id: a.id,
    installer_id: a.installerId || '',
    date: a.date || null,
    type: a.type || 'unavailable',
    reason: a.reason || null
  };
}
function dbToAvailability(r) {
  return {
    id: r.id,
    installerId: r.installer_id || '',
    date: r.date || '',
    type: r.type || 'unavailable',
    reason: r.reason || ''
  };
}
// ── Install progress (per-job frame-stage tracking) — 17-install-schedule.js
// Note: progressToDb takes (jobId, progress) — there's no progress.id field
// on the local shape; the job id is the primary key.
function progressToDb(jobId, p) {
  return {
    job_id: jobId,
    arrived_at: (p && p.arrivedAt) || null,
    frame_stages: (p && Array.isArray(p.frameStages)) ? p.frameStages : []
  };
}
function dbToProgress(r) {
  return {
    arrivedAt: r.arrived_at || null,
    frameStages: Array.isArray(r.frame_stages) ? r.frame_stages : []
  };
}
// ── Per-job cost tracking — labour / materials / additional charges
// Note: jobCostsToDb takes (jobId, costs) — there's no costs.id; job_id is PK.
function jobCostsToDb(jobId, c) {
  c = c || {};
  return {
    job_id: jobId,
    labour: Array.isArray(c.labour) ? c.labour : [],
    materials: Array.isArray(c.materials) ? c.materials : [],
    additional: Array.isArray(c.additional) ? c.additional : []
  };
}
function dbToJobCosts(r) {
  return {
    labour: Array.isArray(r.labour) ? r.labour : [],
    materials: Array.isArray(r.materials) ? r.materials : [],
    additional: Array.isArray(r.additional) ? r.additional : []
  };
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

// ── Brief 5 Phase 3: dealType backfill for legacy deals ────────────────────
// Existing deals (those created before Brief 5 Phase 1 landed) carry
// dealType=null because the field didn't exist when they were written.
// Phase 1's dbToDeal explicitly preserves the null on read so this
// migration can detect them. Backfill rule: read the linked contact's
// type field — fall back to 'residential' for orphan deals (no contact
// found) since residential is the safer default in this business.
//
// Idempotent: once dealType is set on a deal, subsequent runs see no
// nulls and touch nothing. The flag prevents the per-deal scan on
// every reload after the first run completes.
//
// Caveat documented in the brief: a residential contact's commercial
// deal (or vice versa) gets misclassified. The audit entry + admin
// toast surface the migration so it can be reviewed. Phase 4 lands an
// inline-editable badge on Deal Detail for fixing individual cases.
var DEALTYPE_MIGRATION_FLAG = 'spartan_dealtype_migration_v1';

function _migrateDealTypeInPlace(deals, contacts) {
  var contactsById = {};
  (contacts || []).forEach(function (c) { if (c && c.id) contactsById[c.id] = c; });
  var touched = [];
  (deals || []).forEach(function (d) {
    // Already typed (either set by Phase 1 saveNewDeal, Phase 2 lead
    // conversion, or a previous run of this migration in another browser
    // session that wrote to Supabase). Skip — no work to do.
    if (d.dealType === 'residential' || d.dealType === 'commercial') return;
    var contact = d.cid ? contactsById[d.cid] : null;
    var inferred = (contact && contact.type === 'commercial') ? 'commercial' : 'residential';
    d.dealType = inferred;
    touched.push(d);
  });
  return touched;
}

function runDealTypeMigrationIfNeeded(deals, contacts) {
  try {
    if (localStorage.getItem(DEALTYPE_MIGRATION_FLAG) === '1') {
      return { ran: false, dealCount: 0, residentialCount: 0, commercialCount: 0 };
    }
  } catch(e) { /* localStorage unavailable — run anyway, safer than skipping */ }

  var touched = _migrateDealTypeInPlace(deals, contacts);
  var residentialCount = 0, commercialCount = 0;
  touched.forEach(function (d) {
    if (d.dealType === 'commercial') commercialCount++; else residentialCount++;
  });

  // Persist touched rows. Same fire-and-forget pattern as the other migrations.
  // If Supabase is offline the in-memory migration still applies for this
  // session; another browser will rerun and write on its own first boot.
  touched.forEach(function (d) { try { dbUpsert('deals', dealToDb(d)); } catch(e) {} });

  // Audit (Brief 2 Phase 2). One entry summarising the backfill — not one
  // per deal, which would flood the log. Skip if appendAuditEntry isn't
  // loaded yet (boot order is module-by-module; the audit primitive lands
  // before this in 05-state-auth-rbac.js so it should always be present,
  // but the typeof guard keeps us robust to future load-order changes).
  if (typeof appendAuditEntry === 'function' && touched.length > 0) {
    try {
      appendAuditEntry({
        entityType: 'system', entityId: null,
        action: 'system.dealtype_backfilled',
        summary: 'Backfilled dealType on ' + touched.length + ' deal' + (touched.length !== 1 ? 's' : '') + ' from linked contact (' + residentialCount + ' residential, ' + commercialCount + ' commercial)',
        metadata: { count: touched.length, residentialCount: residentialCount, commercialCount: commercialCount },
      });
    } catch(e) { /* audit is best-effort */ }
  }

  // Set flag BEFORE the toast — if the toast somehow throws, the flag
  // still gets set so we don't re-run the migration on next reload.
  try { localStorage.setItem(DEALTYPE_MIGRATION_FLAG, '1'); } catch(e) {}

  // Admin-only one-time toast surfacing the auto-classification so the
  // first admin who happens to load the app post-deploy can review.
  // Uses a long-lived toast (10s) since the user may be looking elsewhere
  // when boot completes. Deferred via setTimeout(0) so it doesn't get
  // wiped by the next renderPage that follows state-merge.
  if (touched.length > 0 && typeof addToast === 'function') {
    var cu = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (cu && cu.role === 'admin') {
      setTimeout(function () {
        try {
          addToast(touched.length + ' deals were auto-classified by type (' + residentialCount + ' residential, ' + commercialCount + ' commercial). Review and adjust on Deal Detail if needed.', 'info');
        } catch(e) {}
      }, 0);
    }
  }

  console.log('[Spartan] dealType migration complete — backfilled', touched.length, 'deals (' + residentialCount + ' residential, ' + commercialCount + ' commercial)');
  return { ran: true, dealCount: touched.length, residentialCount: residentialCount, commercialCount: commercialCount };
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
      _sb.from('call_logs').select('*').order('started_at', { ascending: false }).limit(500),              // index 14
      _sb.from('sms_logs').select('*').order('sent_at', { ascending: false }).limit(1000),                 // index 15
      _sb.from('sms_templates').select('*').order('name', { ascending: true }),                            // index 16
      _sb.from('phone_settings').select('*').eq('id', 'singleton').maybeSingle(),                          // index 17
      _sb.from('installers').select('*'),                                                                  // index 18
      _sb.from('entity_files').select('*'),                                                                // index 19
      _sb.from('vehicles').select('*'),                                                                    // index 20
      _sb.from('tools').select('*'),                                                                       // index 21
      _sb.from('installer_availability').select('*'),                                                      // index 22
      _sb.from('install_progress').select('*'),                                                            // index 23
      _sb.from('job_costs').select('*'),                                                                   // index 24
    ]);
    var errors = results.filter(function(r){ return r.error; });
    if (errors.length > 0) { console.warn('[Spartan] DB load errors:', errors.map(function(e){return e.error.message;})); }

    var contacts = (results[0].data||[]).map(dbToContact);
    var leads = (results[1].data||[]).map(dbToLead);
    var deals = (results[2].data||[]).map(function(r){ return dbToDeal(r); });
    var jobs = (results[3].data||[]).map(dbToJob);
    // Auto-migrate legacy status keys (e.g. e_ready_to_schedule → c2_order_schedule_standard)
    // so old jobs created before status rename render correctly and can advance through gates.
    if (typeof resolveStatusKey === 'function') {
      jobs.forEach(function(j){
        var canonical = resolveStatusKey(j.status);
        if (canonical !== j.status) {
          console.log('[Spartan] Migrating legacy status', j.status, '→', canonical, 'on job', j.jobNumber || j.id);
          j.status = canonical;
          if (typeof dbUpdate === 'function') dbUpdate('jobs', j.id, {status: canonical});
        }
      });
    }

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
    // Brief 5 Phase 3: backfill dealType for legacy deals from the linked
    // contact's type field. MUST run after contacts are loaded (above) — we
    // need the contact lookup to infer the type. New deals (Brief 5 Phase
    // 1+2) already carry a non-null dealType so the migration only touches
    // pre-Brief-5 records.
    runDealTypeMigrationIfNeeded(deals, contacts);
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
        // Metadata only — the multi-MB base64 in f.data_url stays in Supabase
        // and is fetched on demand via getJobFileDataUrl (17-install-schedule).
        // Storing it locally blew the ~5 MB localStorage quota.
        byJob[f.job_id].push({
          id: f.id,
          name: f.name,
          category: f.category,
          uploadedBy: f.uploaded_by,
          uploadedAt: f.created_at || f.uploaded_at || new Date().toISOString()
        });
      });
      Object.keys(byJob).forEach(function(jobId) {
        localStorage.setItem('spartan_files_' + jobId, JSON.stringify(byJob[jobId]));
      });
    }
    var installers = (results[18].data||[]).map(dbToInstaller);
    if (installers.length > 0) {
      localStorage.setItem('spartan_installers', JSON.stringify(installers));
      setState({installers: installers}, {skipSync: true});
    }
    // Vehicles (Jobs CRM fleet). Pulled into localStorage so the Settings tab
    // and the Fleet & Delivery / Smart Planner views see the same list across
    // browsers. saveVehicles() writes back via dbUpsert (17-install-schedule.js).
    // results[20] may have .error if the migration hasn't been applied yet —
    // that errors out benignly via the existing collector above.
    var vehicleRows = (results[20] && results[20].data) || [];
    if (vehicleRows.length > 0) {
      var vehicles = vehicleRows.map(dbToVehicle);
      localStorage.setItem('spartan_vehicles', JSON.stringify(vehicles));
    }
    // Tools (Jobs CRM tool registry). Same pattern as vehicles. saveTools()
    // writes back via dbUpsert (17-install-schedule.js).
    var toolRows = (results[21] && results[21].data) || [];
    if (toolRows.length > 0) {
      var tools = toolRows.map(dbToTool);
      localStorage.setItem('spartan_tools', JSON.stringify(tools));
    }
    // Installer availability exceptions. Always overwrite (full list is small
    // and represents the source of truth — no merge logic needed).
    var availRows = (results[22] && results[22].data) || [];
    var availability = availRows.map(dbToAvailability);
    localStorage.setItem('spartan_installer_availability', JSON.stringify(availability));
    // Install progress (per-job stage tracking). Stored locally as a single
    // {jobId: progress} map matching the original spartan_install_progress shape.
    var progRows = (results[23] && results[23].data) || [];
    if (progRows.length > 0) {
      var progressMap = {};
      progRows.forEach(function(r) { if (r.job_id) progressMap[r.job_id] = dbToProgress(r); });
      localStorage.setItem('spartan_install_progress', JSON.stringify(progressMap));
    }
    // Per-job costs. Each job gets its own localStorage key so the existing
    // getJobCosts() helper (which reads spartan_job_costs_<jobId>) keeps working.
    var costRows = (results[24] && results[24].data) || [];
    costRows.forEach(function(r) {
      if (!r.job_id) return;
      try { localStorage.setItem('spartan_job_costs_' + r.job_id, JSON.stringify(dbToJobCosts(r))); }
      catch(e) { console.warn('[Spartan] Failed to cache job_costs for', r.job_id, e); }
    });
    // entity_files (deals/leads/contacts file uploads — written by
    // 08-sales-crm.js addEntityFile and the mobile camera capture). Mirrors
    // the job_files pattern: bucket by entity_type+entity_id, keep the
    // dataUrl in localStorage so the desktop Files tab and mobile Files
    // section see uploads from any device. Errors load benignly via the
    // existing error-collection at line 500 — if the table doesn't exist,
    // results[19] will have an .error and .data === null, which is handled.
    var entFilesRows = (results[19] && results[19].data) || [];
    if (entFilesRows.length > 0) {
      var byEnt = {};
      entFilesRows.forEach(function(f) {
        var key = f.entity_type + '_' + f.entity_id;
        if (!byEnt[key]) byEnt[key] = [];
        byEnt[key].push({
          id: f.id,
          name: f.name,
          dataUrl: f.data_url,         // For Storage URLs this is the public URL
          size: 0,
          uploadedBy: f.uploaded_by,
          uploadedAt: f.created_at || f.uploaded_at || new Date().toISOString()
        });
      });
      Object.keys(byEnt).forEach(function(key) {
        localStorage.setItem('spartan_files_' + key, JSON.stringify(byEnt[key]));
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

    // ── Phone & IVR settings (stage 6) ──────────────────────────────────────
    var phoneSettings = (results[17] && results[17].data) || null;
    if (phoneSettings) {
      try {
        if (JSON.stringify(phoneSettings) !== JSON.stringify(getState().phoneSettings || null)) {
          setState({ phoneSettings: phoneSettings }, { skipSync: true });
        }
      } catch(e) { setState({ phoneSettings: phoneSettings }, { skipSync: true }); }
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
  // Split across two channels because Supabase Realtime has a per-channel
  // limit on postgres_changes subscriptions (~10). Putting all 14 on a
  // single channel silently drops the trailing subscriptions — confirmed
  // empirically by manually-attached test channels receiving events that
  // a 14-listener app channel didn't.
  // Channel A: high-cardinality entity tables.
  var channelA = _sb.channel('spartan-realtime-entities')
    .on('postgres_changes', {event:'*', schema:'public', table:'contacts'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'leads'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'deals'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'jobs'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'invoices'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'factory_orders'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'users'}, function(){ dbLoadAll(); })
    .subscribe(function(status){ console.log('[Spartan] Realtime A:', status); });
  // Channel B: communication + activity + file tables.
  var channelB = _sb.channel('spartan-realtime-comms')
    .on('postgres_changes', {event:'*', schema:'public', table:'call_logs'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'sms_logs'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'sms_templates'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'phone_settings'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'installers'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'vehicles'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'tools'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'installer_availability'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'install_progress'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'job_costs'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'activities'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'entity_files'}, function(){ dbLoadAll(); })
    .on('postgres_changes', {event:'*', schema:'public', table:'email_sent'}, function(){ dbLoadAll(); })
    .subscribe(function(status){ console.log('[Spartan] Realtime B:', status); });
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


