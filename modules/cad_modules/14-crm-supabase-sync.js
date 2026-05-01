// ═══════════════════════════════════════════════════════════════════════════
// CRM SYNC LAYER — actual Supabase I/O for the integration.
// Pairs with SPARTANCAD_CRM_INTEGRATION.md §1 (architecture), §2 (schema),
// §3 (URL handoff), §4 (entity load + draft design), §9.1 (offline queue).
//
// Design rules:
//   - If Supabase isn't configured OR URL params absent → CAD runs standalone.
//     Never throw on the happy-path boot. Existing behaviour must be preserved.
//   - All writes are debounced + queued to localStorage on failure, flushed
//     automatically on reconnect.
//   - camelCase in-memory ↔ snake_case at the Supabase boundary.
// ═══════════════════════════════════════════════════════════════════════════

// ─── SUPABASE DEFAULT CREDENTIALS ────────────────────────────────────────
// These are the production Spartan CRM Supabase instance. The anon/publishable
// key is DESIGNED to be exposed in client-side code (see spec §1.3); row-level
// security policies on each table are what actually protect data.
// To point CAD at a different instance (e.g. staging), override via either:
//   1. Settings → CRM Connection UI (writes to localStorage), OR
//   2. Before the app script, set window.SPARTAN_SUPABASE_URL / _ANON_KEY
// Clearing localStorage reverts to these defaults.
var SPARTAN_DEFAULT_SUPABASE_URL = 'https://sedpmsgiscowohpqdjza.supabase.co';
var SPARTAN_DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_yBluf2LlIAhewDUbNz3f5w_iiCNK6eY';

// Lazy-init Supabase client. Credentials come from (in priority order):
//   1. localStorage 'spartan_supabase_url' / 'spartan_supabase_anon_key'
//      (set via Settings → CRM Connection; lets users override without a redeploy)
//   2. window.SPARTAN_SUPABASE_URL / window.SPARTAN_SUPABASE_ANON_KEY
//      (inlined at deploy time for cad.spaartan.tech if needed)
//   3. SPARTAN_DEFAULT_SUPABASE_URL / _ANON_KEY — hardcoded production defaults.
// Returns null only if the Supabase JS library itself failed to load.
var _sbClient = null;
function sb() {
  if (_sbClient) return _sbClient;
  if (typeof supabase === 'undefined' || !supabase.createClient) return null;
  var url = (typeof localStorage !== 'undefined' && localStorage.getItem('spartan_supabase_url'))
         || (typeof window !== 'undefined' && window.SPARTAN_SUPABASE_URL)
         || SPARTAN_DEFAULT_SUPABASE_URL
         || '';
  var key = (typeof localStorage !== 'undefined' && localStorage.getItem('spartan_supabase_anon_key'))
         || (typeof window !== 'undefined' && window.SPARTAN_SUPABASE_ANON_KEY)
         || SPARTAN_DEFAULT_SUPABASE_ANON_KEY
         || '';
  if (!url || !key) return null;
  try {
    _sbClient = supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'spartan_cad_auth' },
      realtime: { params: { eventsPerSecond: 2 } },
    });
    return _sbClient;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('Supabase init failed', e);
    return null;
  }
}

// Reset the cached client (used when user updates credentials in settings).
function sbReset() { _sbClient = null; }

// Is the CRM link configured and reachable?
function sbConfigured() { return !!sb(); }

// ─── CAMEL ↔ SNAKE ADAPTERS ─────────────────────────────────────────────────
// Maps a CAD frame (camelCase, in-memory shape) to a Supabase design_items row
// (snake_case, DB shape). Pulls rollup values from a pre-calculated `priced`
// result so we don't recompute here.
function toDesignItemRow(designId, frame, priced, position, priceListId) {
  var di = frameToDesignItem(frame, priced, position);
  // Fill sale_price from the active price list (frame portion + install portion).
  var fp = priced || {};
  if (priceListId && fp.priceLists && typeof fp.priceLists[priceListId] === 'number') {
    di.salePrice = fp.priceLists[priceListId];
  } else if (fp.fullCost) {
    di.salePrice = fp.fullCost;
  }
  return {
    id:              di.id,
    design_id:       designId,
    position:        di.position,
    room:            di.room,
    frame_type:      di.frameType,
    width_mm:        di.widthMm,
    height_mm:       di.heightMm,
    depth_mm:        di.depthMm,
    profile_series:  di.profileSeries,
    profile_colour:  di.profileColour,
    glass_spec:      di.glassSpec,
    hardware_spec:   di.hardwareSpec,
    reveal_type:     di.revealType,
    flashing:        di.flashing,
    weight_kg:       di.weightKg,
    floor_level:     di.floorLevel,
    access_method:   di.accessMethod,
    surround_type:   di.surroundType,
    site_hazards:    di.siteHazards,
    material_cost:     di.materialCost,
    labour_prod_hours: di.labourProdHours,
    labour_install_hours: di.labourInstallHours,
    sale_price:      di.salePrice,
    cm_width_mm:     di.cmWidthMm,
    cm_height_mm:    di.cmHeightMm,
    cm_notes:        di.cmNotes,
    cm_confirmed:    di.cmConfirmed,
  };
}

// Maps a Supabase design_items row (snake_case) back to the in-memory frame
// shape. Used when loading an existing design on CAD boot.
function designItemRowToFrame(row) {
  // row.frame_type is the CRM enum ('awning','casement',...). We keep the
  // original camelCase productType in the CAD frame via row.position lookup if
  // available, otherwise best-guess map back. This is lossy without more info
  // because CRM 'casement' covers both casement_window AND tilt_turn_window.
  // To avoid surprises, store the original productType in a CAD-specific
  // column later; for now we pick the most common CAD value.
  var revMap = {
    awning: 'awning_window', casement: 'casement_window', fixed: 'fixed_window',
    sliding: 'sliding_window', door_hinged: 'hinged_door', door_sliding: 'vario_slide_door',
  };
  return {
    id: row.id,
    name: 'F' + String(row.position || 1).padStart(2, '0'),
    productType: revMap[row.frame_type] || 'fixed_window',
    width: row.width_mm, height: row.height_mm,
    panelCount: 1, opensIn: false, openStyle: 'top_hung',
    colour: 'white_body', colourInt: 'white_body',  // colour names are human-readable in DB; reverse-mapping deferred
    glassSpec: 'dgu_4_12_4',  // same — re-selection on load is deferred
    colonialGrid: null, transomPct: null,
    cellTypes: [['fixed']], gridCols: 1, gridRows: 1,
    zoneWidths: [row.width_mm], zoneHeights: [row.height_mm],
    hardwareColour: 'white', showFlyScreen: true,
    // Preserve CRM-originated fields
    room: row.room || '',
    floorLevel: row.floor_level || 0,
    accessMethod: row.access_method || null,
    surroundType: row.surround_type || null,
    siteHazards: row.site_hazards || '',
    flashing: !!row.flashing,
    revealType: row.reveal_type || null,
    cmWidthMm: row.cm_width_mm || null,
    cmHeightMm: row.cm_height_mm || null,
    cmNotes: row.cm_notes || '',
    cmConfirmed: !!row.cm_confirmed,
    hardwareCostOverride: null, profileOverrides: null, supplyOnly: !!row.supply_only, tracks: null,
    installationType: row.installation_type || (row.supply_only ? 'supply_only' : null),  // WIP23: loaded row may have either new or legacy field
  };
}

// ─── ENTITY FETCH ──────────────────────────────────────────────────────────
// Fetches a lead/deal/job from Supabase. If the entity has a linked contact
// (deals via `cid`, jobs via `contact_id`), also fetches the contact. Returns
// { entity, contact } or null on any failure.
async function fetchEntityContext(entityType, entityId) {
  var client = sb(); if (!client) return null;
  try {
    var tableMap = { lead: 'leads', deal: 'deals', job: 'jobs' };
    var table = tableMap[entityType]; if (!table) return null;
    var { data: entity, error: e1 } = await client.from(table).select('*').eq('id', entityId).maybeSingle();
    if (e1) throw e1;
    if (!entity) return null;
    var contact = null;
    var contactIdField = entityType === 'deal' ? 'cid' : (entityType === 'job' ? 'contact_id' : null);
    if (contactIdField && entity[contactIdField]) {
      var { data: c } = await client.from('contacts').select('*').eq('id', entity[contactIdField]).maybeSingle();
      contact = c || null;
    }
    return { entity: entity, contact: contact };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('fetchEntityContext failed', e);
    return null;
  }
}

// Resolves contact fields into a flat shape for design snapshot columns.
function contactSnapshotFor(entityType, entity, contact) {
  var firstN = entity && entity.fn;
  var lastN = entity && entity.ln;
  return {
    contact_name:  (contact && (contact.first_name || contact.fn || '') + ' ' + (contact.last_name || contact.ln || '')).trim()
                  || ((firstN || '') + ' ' + (lastN || '')).trim()
                  || entity && entity.name || '',
    contact_phone: (contact && (contact.phone || contact.mobile))
                  || entity && (entity.phone || entity.mobile) || '',
    contact_email: (contact && contact.email)
                  || entity && entity.email || '',
    site_street:   (entity && entity.street) || '',
    site_suburb:   (entity && entity.suburb) || '',
    site_state:    (entity && entity.state) || '',
    site_postcode: (entity && entity.postcode) || '',
  };
}

// Back-propagation of site address edits to the source CRM entity (spec §4.5).
// When the user edits the site address inside CAD and opts in via the
// "Also update [entity] address?" checkbox, we write the new address back to
// the original lead/deal/job row. Returns { ok, error }.
async function updateEntityAddress(entityType, entityId, fields) {
  var client = sb(); if (!client) return { ok: false, error: new Error('supabase not configured') };
  try {
    var tableMap = { lead: 'leads', deal: 'deals', job: 'jobs' };
    var table = tableMap[entityType];
    if (!table) return { ok: false, error: new Error('unsupported entity type: ' + entityType) };
    // Only write the four address columns — nothing else. Whitelist prevents
    // accidental writes to other entity columns if `fields` contains extras.
    var payload = {};
    if (typeof fields.street    === 'string') payload.street    = fields.street;
    if (typeof fields.suburb    === 'string') payload.suburb    = fields.suburb;
    if (typeof fields.state     === 'string') payload.state     = fields.state;
    if (typeof fields.postcode  === 'string') payload.postcode  = fields.postcode;
    if (Object.keys(payload).length === 0) return { ok: true, noop: true };
    var { error } = await client.from(table).update(payload).eq('id', entityId);
    if (error) return { ok: false, error: error };
    return { ok: true };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('updateEntityAddress failed', e);
    return { ok: false, error: e };
  }
}

// ─── DESIGN LOAD / CREATE ───────────────────────────────────────────────────
// Returns { design, items } for an existing design, or creates a new draft.
// §4.2 / §4.3 of the integration spec.
async function loadOrCreateDesign(entityType, entityId, opts) {
  opts = opts || {};
  var client = sb(); if (!client) return null;
  try {
    // Prefer the most recent design for this entity.
    var { data: existingList, error: eL } = await client
      .from('designs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (eL) throw eL;
    var design = (existingList && existingList[0]) || null;
    if (design) {
      var { data: itemsData } = await client
        .from('design_items').select('*').eq('design_id', design.id).order('position', { ascending: true });
      return { design: design, items: itemsData || [] };
    }
    // Create fresh draft per §4.3
    var snap = contactSnapshotFor(entityType, opts.entity, opts.contact);
    var newId = 'D_' + Date.now();
    var newRow = Object.assign({
      id: newId,
      entity_type: entityType, entity_id: entityId,
      branch: (opts.entity && opts.entity.branch) || null,
      status: 'draft', stage: 'design',
      created_by: opts.userId || null,
    }, snap);
    var { data: created, error: eC } = await client.from('designs').insert(newRow).select().maybeSingle();
    if (eC) throw eC;
    return { design: created, items: [] };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('loadOrCreateDesign failed', e);
    return null;
  }
}

// ─── OFFLINE QUEUE ──────────────────────────────────────────────────────────
// Writes that fail (network loss or Supabase down) go into localStorage and
// get retried on the next online save. §9.1.
var PENDING_KEY = 'spartan_cad_pending_writes';
function queuePendingWrite(op) {
  try {
    var q = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    q.push(Object.assign({ ts: Date.now() }, op));
    localStorage.setItem(PENDING_KEY, JSON.stringify(q));
  } catch (e) { /* localStorage full or disabled */ }
}
function pendingCount() {
  try { return (JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')).length; } catch (e) { return 0; }
}
async function flushPendingWrites() {
  var client = sb(); if (!client) return { flushed: 0, failed: 0 };
  var q; try { q = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { q = []; }
  if (!q.length) return { flushed: 0, failed: 0 };
  var remaining = [], flushed = 0;
  for (var i = 0; i < q.length; i++) {
    var op = q[i];
    try {
      if (op.op === 'upsert') {
        await client.from(op.table).upsert(op.data, op.options || {});
      } else if (op.op === 'delete') {
        await client.from(op.table).delete().eq(op.keyField || 'id', op.keyValue);
      } else if (op.op === 'update') {
        await client.from(op.table).update(op.patch).eq(op.keyField || 'id', op.keyValue);
      }
      flushed++;
    } catch (e) {
      remaining.push(op);
    }
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
  return { flushed: flushed, failed: remaining.length };
}

// ─── APP SETTINGS PERSISTENCE ───────────────────────────────────────────────
// The Settings panel (profile library, ancillaries, colours, glass, quote
// templates, pricing config…) all live under a single React state object.
// Without persistence every edit is lost on refresh. We mirror to localStorage
// (synchronous, always works) and Supabase table `cad_app_settings` (single
// shared row, jsonb `data` column). Missing-table / offline failures fall
// through to the offline queue and the localStorage copy still saves the user.
//
// Schema expected by saveAppSettingsToSupabase:
//   create table cad_app_settings (
//     id text primary key,
//     data jsonb not null,
//     updated_at timestamptz not null default now()
//   );
// If the table doesn't exist yet, save returns ok:false and queues the upsert
// for retry — local copy is still written so users don't lose work.
var APP_SETTINGS_LS_KEY = 'spartan_cad_app_settings';
var APP_SETTINGS_TABLE  = 'cad_app_settings';
var APP_SETTINGS_ROW_ID = 'global';

// localStorage payload is wrapped in a small envelope so we can tell which
// copy is fresher when reconciling with Supabase:
//   { data: <appSettings>, savedAt: <ms>, lastSyncedAt: <ms> }
// `savedAt` ticks on every local write; `lastSyncedAt` ticks only after a
// successful Supabase upsert. If `savedAt > lastSyncedAt`, the local copy has
// edits the server hasn't seen yet — the mount effect uses that to avoid
// pulling stale remote data over fresh local edits.
function loadAppSettingsLocal() {
  // Return just the data object; back-compat with pre-envelope payloads.
  try {
    if (typeof localStorage === 'undefined') return null;
    var raw = localStorage.getItem(APP_SETTINGS_LS_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.savedAt === 'number') {
      return parsed.data;
    }
    return parsed; // legacy payload — looks like the appSettings object directly
  } catch (e) { return null; }
}

// Mount-effect helper: returns the full envelope (or a synthesized one for
// legacy payloads) so the caller can compare timestamps.
function loadAppSettingsLocalEnvelope() {
  try {
    if (typeof localStorage === 'undefined') return null;
    var raw = localStorage.getItem(APP_SETTINGS_LS_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.savedAt === 'number') {
      return parsed;
    }
    // Legacy payload — pretend it was just saved so the merge code treats it
    // as freshly local until the next save rewrites it as a real envelope.
    return { data: parsed, savedAt: Date.now(), lastSyncedAt: 0 };
  } catch (e) { return null; }
}

function saveAppSettingsLocal(data) {
  try {
    if (typeof localStorage === 'undefined') return;
    var lastSynced = 0;
    try {
      var prev = JSON.parse(localStorage.getItem(APP_SETTINGS_LS_KEY) || 'null');
      if (prev && typeof prev.lastSyncedAt === 'number') lastSynced = prev.lastSyncedAt;
    } catch (e) {}
    var envelope = { data: data, savedAt: Date.now(), lastSyncedAt: lastSynced };
    localStorage.setItem(APP_SETTINGS_LS_KEY, JSON.stringify(envelope));
  } catch (e) { /* quota exceeded or disabled */ }
}

// Called after a successful Supabase upsert so the next mount effect can tell
// the local copy is in sync.
function markAppSettingsSynced(serverMs) {
  try {
    if (typeof localStorage === 'undefined') return;
    var raw = localStorage.getItem(APP_SETTINGS_LS_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (parsed && parsed.data) {
      parsed.lastSyncedAt = serverMs || Date.now();
      localStorage.setItem(APP_SETTINGS_LS_KEY, JSON.stringify(parsed));
    }
  } catch (e) {}
}

// "Table missing" is the expected state until the user provisions the schema —
// don't spam the console with red errors in that case. We track whether we've
// already logged once so transient failures still surface.
var _appSettingsTableMissing = false;
function _isMissingTable(msg) {
  if (!msg) return false;
  var s = String(msg).toLowerCase();
  return s.indexOf('does not exist') >= 0
      || s.indexOf('not found') >= 0
      || s.indexOf('relation') >= 0 && s.indexOf('does not') >= 0
      || s.indexOf('schema cache') >= 0;
}

async function loadAppSettingsFromSupabase() {
  var client = sb(); if (!client) return null;
  try {
    var res = await client.from(APP_SETTINGS_TABLE)
      .select('data, updated_at').eq('id', APP_SETTINGS_ROW_ID).maybeSingle();
    if (res.error) {
      if (_isMissingTable(res.error.message)) {
        if (!_appSettingsTableMissing && typeof console !== 'undefined') {
          console.info('[appSettings] Supabase table "' + APP_SETTINGS_TABLE + '" not provisioned yet — using localStorage only.');
        }
        _appSettingsTableMissing = true;
        return null;
      }
      if (typeof console !== 'undefined') console.warn('[appSettings] Supabase load failed:', res.error.message);
      return null;
    }
    if (!res.data) return null;
    var ms = res.data.updated_at ? Date.parse(res.data.updated_at) : 0;
    return { data: res.data.data, updatedAtMs: isNaN(ms) ? 0 : ms };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[appSettings] Supabase load threw:', e && e.message);
    return null;
  }
}

async function saveAppSettingsToSupabase(data) {
  var nowIso = new Date().toISOString();
  var nowMs = Date.now();
  var row = { id: APP_SETTINGS_ROW_ID, data: data, updated_at: nowIso };
  var client = sb();
  if (!client) return { ok: false, offline: true };
  try {
    var res = await client.from(APP_SETTINGS_TABLE).upsert(row);
    if (res.error) {
      if (_isMissingTable(res.error.message)) {
        if (!_appSettingsTableMissing && typeof console !== 'undefined') {
          console.info('[appSettings] Supabase table "' + APP_SETTINGS_TABLE + '" not provisioned yet — saved to localStorage instead.');
        }
        _appSettingsTableMissing = true;
        return { ok: false, missingTable: true };
      }
      queuePendingWrite({ op: 'upsert', table: APP_SETTINGS_TABLE, data: row });
      if (typeof console !== 'undefined') console.warn('[appSettings] Supabase save failed:', res.error.message);
      return { ok: false, error: res.error };
    }
    // Mark the local envelope as in sync so the next mount effect knows it
    // doesn't need to push or pull.
    markAppSettingsSynced(nowMs);
    return { ok: true, savedAtMs: nowMs };
  } catch (e) {
    queuePendingWrite({ op: 'upsert', table: APP_SETTINGS_TABLE, data: row });
    if (typeof console !== 'undefined') console.warn('[appSettings] Supabase save threw:', e && e.message);
    return { ok: false, error: e };
  }
}

// Deep merge so a stored payload that's missing newer keys still inherits the
// hardcoded defaults for those keys. Plain objects merge recursively; arrays
// and primitives from `loaded` win outright (treating arrays as user data).
function mergeAppSettings(defaults, loaded) {
  if (loaded == null || typeof loaded !== 'object' || Array.isArray(loaded)) {
    return loaded == null ? defaults : loaded;
  }
  if (defaults == null || typeof defaults !== 'object' || Array.isArray(defaults)) {
    return loaded;
  }
  var out = {};
  var k;
  for (k in defaults) {
    if (Object.prototype.hasOwnProperty.call(loaded, k)) {
      out[k] = mergeAppSettings(defaults[k], loaded[k]);
    } else {
      out[k] = defaults[k];
    }
  }
  for (k in loaded) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = loaded[k];
  }
  return out;
}

// Expose for headless tests + future debugging.
if (typeof window !== 'undefined') {
  window.loadAppSettingsLocal         = loadAppSettingsLocal;
  window.loadAppSettingsLocalEnvelope = loadAppSettingsLocalEnvelope;
  window.saveAppSettingsLocal         = saveAppSettingsLocal;
  window.markAppSettingsSynced        = markAppSettingsSynced;
  window.loadAppSettingsFromSupabase  = loadAppSettingsFromSupabase;
  window.saveAppSettingsToSupabase    = saveAppSettingsToSupabase;
  window.mergeAppSettings             = mergeAppSettings;
  window.APP_SETTINGS_LS_KEY          = APP_SETTINGS_LS_KEY;
  window.APP_SETTINGS_TABLE           = APP_SETTINGS_TABLE;
}

// ─── DESIGN SAVE ────────────────────────────────────────────────────────────
// Upserts designs row + design_items rows + entity cad_data. Called by the
// main component's debounced autosave. Returns { ok, error }.
async function saveDesignAndItems(designId, entityType, entityId, projectItems, appSettings, priceListId, meta) {
  var client = sb();
  var cadData = buildCadDataCache(designId, projectItems, appSettings, priceListId);
  meta = meta || {};

  // Always try to write — if the client is null or the call fails, queue it.
  function design_row() {
    return {
      id: designId,
      entity_type: entityType, entity_id: entityId,
      status: meta.status || cadData.status || 'draft',
      stage: meta.stage || cadData.stage || 'design',
      total_sale_value: cadData.totalPrice,
      total_material_cost: cadData.totalMaterialCost,
      total_labour_cost: cadData.totalLabourCost,
      total_cost: cadData.totalCost,
      gross_margin_pct: cadData.grossMarginPct,
      estimated_production_hours: cadData.estimatedProductionHours,
      estimated_install_hours: cadData.estimatedInstallHours,
      updated_at: new Date().toISOString(),
    };
  }
  function item_rows() {
    return projectItems.map(function(f, i) {
      var fp;
      try { fp = calculateFramePrice(f, appSettings.pricingConfig); } catch (e) { fp = {}; }
      return toDesignItemRow(designId, f, fp, i + 1, priceListId);
    });
  }
  function cad_data_patch() {
    return { cad_data: cadData, current_design_id: designId };
  }

  if (!client) {
    // Standalone mode: cache to localStorage only.
    try { localStorage.setItem('spartan_cad_preview_' + designId, JSON.stringify({ design: design_row(), items: item_rows(), cad_data: cadData })); }
    catch (e) {}
    return { ok: true, offline: true };
  }

  try {
    await client.from('designs').upsert(design_row());
    // Delete-then-insert design_items so position / removals stay in sync.
    // Using delete-by-design-id is simplest; for bigger designs a diff would be
    // more efficient, but projects are <50 frames in practice.
    await client.from('design_items').delete().eq('design_id', designId);
    if (item_rows().length) {
      await client.from('design_items').insert(item_rows());
    }
    var tableMap = { lead: 'leads', deal: 'deals', job: 'jobs' };
    var entTable = tableMap[entityType];
    if (entTable && entityId) {
      await client.from(entTable).update(cad_data_patch()).eq('id', entityId);
    }
    return { ok: true, offline: false };
  } catch (e) {
    // Network or permission error — queue the individual ops so they retry on reconnect.
    queuePendingWrite({ op: 'upsert', table: 'designs', data: design_row() });
    queuePendingWrite({ op: 'delete', table: 'design_items', keyField: 'design_id', keyValue: designId });
    item_rows().forEach(function(row) { queuePendingWrite({ op: 'upsert', table: 'design_items', data: row }); });
    if (entityType && entityId) {
      var tmap = { lead: 'leads', deal: 'deals', job: 'jobs' };
      queuePendingWrite({ op: 'update', table: tmap[entityType], patch: cad_data_patch(), keyField: 'id', keyValue: entityId });
    }
    return { ok: false, error: e, offline: true };
  }
}

// Realtime subscription to listen for external changes to our design or its
// parent entity. Returns an unsubscribe function.
function subscribeToDesignChanges(designId, entityType, entityId, onChange) {
  var client = sb(); if (!client) return function(){};
  var ch = client.channel('design-' + designId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'design_items', filter: 'design_id=eq.' + designId }, function(payload) { onChange('design_items', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'designs', filter: 'id=eq.' + designId }, function(payload) { onChange('designs', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'check_measures', filter: 'design_id=eq.' + designId }, function(payload) { onChange('check_measures', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'design_signatures', filter: 'design_id=eq.' + designId }, function(payload) { onChange('design_signatures', payload); })
    .subscribe();
  return function() { try { client.removeChannel(ch); } catch (e) {} };
}

