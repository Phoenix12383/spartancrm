// ═══════════════════════════════════════════════════════════════════════════
// CHECK-MEASURE HELPERS (per spec §5)
// ═══════════════════════════════════════════════════════════════════════════

// Compute crew size, lift gear, scaffold, crane required from the set of
// frames in a design. Per spec §5.5.
function autoCalcInstallPlanning(projectItems, appSettings) {
  // Equipment / crew planning (unchanged from WIP8 — drives Check Measure).
  var maxWeight = 0, anyUpperFloor = false, anyHeavy60 = false,
      anyUpperNoLift = false, anyCraneWeight = false;

  // Install time planning (WIP9 — new property-type × size + floor bucket formula).
  // Total per-frame minutes = base[propertyType][sizeBucket] + floorAddOn[floorBucket].
  // Legacy frames without propertyType fall back to brick_veneer so totals don't zero.
  var ip = (appSettings && appSettings.pricingConfig && appSettings.pricingConfig.installPlanning)
         || (typeof window !== 'undefined' && window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.installPlanning)
         || null;
  var threshold = (ip && typeof ip.sizeThresholdSqm === 'number') ? ip.sizeThresholdSqm : 2.0;
  var baseTable = (ip && ip.baseMinutes) || {};
  var floorTable = (ip && ip.floorAddOn) || {};

  var totalInstallMinutes = 0;

  (projectItems || []).forEach(function(f) {
    // ── Equipment planning inputs (weight + floor presence) ─────────────
    var wkg = Number(f.weightKg || f.weight_kg) || 0;
    if (!wkg && typeof calcFrameWeightKg === 'function' && typeof calculateFramePrice === 'function') {
      try {
        var pc = (appSettings && appSettings.pricingConfig) || (window.PRICING_DEFAULTS || {});
        wkg = calcFrameWeightKg(calculateFramePrice(f, pc));
      } catch (e) { wkg = 0; }
    }
    maxWeight = Math.max(maxWeight, wkg);
    var floorN = Number(f.floorLevel) || 0;
    if (floorN > 0) anyUpperFloor = true;
    if (floorN >= 2) {
      if (f.accessMethod !== 'scissor_lift') anyUpperNoLift = true;
    }
    if (wkg > 60 || floorN >= 2) anyHeavy60 = true;
    if (wkg > 200) anyCraneWeight = true;

    // ── Install minutes for this frame (WIP9 formula) ───────────────────
    var ptype = f.propertyType || 'brick_veneer';
    var areaSqm = (Number(f.width) || 0) * (Number(f.height) || 0) / 1e6;
    var sizeBucket = (areaSqm < threshold) ? 'under' : 'over';
    var baseRow = baseTable[ptype] || baseTable.brick_veneer || { under: 0, over: 0 };
    var baseMin = Number(baseRow[sizeBucket]) || 0;
    var floorBucket = (typeof floorLevelToBucket === 'function')
      ? floorLevelToBucket(floorN)
      : (floorN <= 0 ? 'ground' : floorN === 1 ? 'first' : floorN === 2 ? 'second' : floorN === 3 ? 'third' : 'above3');
    var floorMin = Number(floorTable[floorBucket]) || 0;
    totalInstallMinutes += (baseMin + floorMin);
  });

  // ── Crew / equipment verdict (unchanged from WIP8) ────────────────────
  var crewSize = 2;
  if (maxWeight > 80) crewSize = 3;
  else if (maxWeight > 40 || anyUpperFloor) crewSize = 2;

  // Convert total minutes → hours → days (8h shifts, rounded to 0.5d).
  var totalInstallHours = totalInstallMinutes / 60;
  var days = Math.ceil((totalInstallHours / 8) * 2) / 2;
  if (days < 0.5) days = 0.5;

  return {
    crewSizeRequired:     crewSize,
    liftingGearRequired:  anyHeavy60,
    scaffoldRequired:     anyUpperNoLift,
    craneRequired:        anyCraneWeight,
    estimatedInstallHours: +totalInstallHours.toFixed(2),
    estimatedInstallDays:  days,
    maxWeightKg: +maxWeight.toFixed(1),
  };
}

// camelCase frame (or CM form state) ↔ snake_case check_measure row
function toCheckMeasureRow(cm) {
  return {
    id: cm.id, design_id: cm.designId,
    entity_type: cm.entityType, entity_id: cm.entityId,
    measured_by: cm.measuredBy || null,
    crew_size_required:    Number(cm.crewSizeRequired) || 2,
    lifting_gear_required: !!cm.liftingGearRequired,
    scaffold_required:     !!cm.scaffoldRequired,
    crane_required:        !!cm.craneRequired,
    estimated_install_days: Number(cm.estimatedInstallDays) || 1,
    earliest_install_date:  cm.earliestInstallDate || null,
    customer_preferred_date: cm.customerPreferredDate || null,
    parking_notes:         cm.parkingNotes || '',
    delivery_access_notes: cm.deliveryAccessNotes || '',
    site_notes:            cm.siteNotes || '',
    overall_hazards:       cm.overallHazards || '',
    photo_urls:            cm.photoUrls || [],
    completed:             !!cm.completed,
    updated_at: new Date().toISOString(),
  };
}

function checkMeasureRowToState(row) {
  if (!row) return null;
  return {
    id: row.id, designId: row.design_id,
    entityType: row.entity_type, entityId: row.entity_id,
    measuredBy: row.measured_by,
    crewSizeRequired:    row.crew_size_required,
    liftingGearRequired: row.lifting_gear_required,
    scaffoldRequired:    row.scaffold_required,
    craneRequired:       row.crane_required,
    estimatedInstallDays: Number(row.estimated_install_days),
    earliestInstallDate:  row.earliest_install_date,
    customerPreferredDate: row.customer_preferred_date,
    parkingNotes:         row.parking_notes || '',
    deliveryAccessNotes:  row.delivery_access_notes || '',
    siteNotes:            row.site_notes || '',
    overallHazards:       row.overall_hazards || '',
    photoUrls:            row.photo_urls || [],
    completed:            !!row.completed,
  };
}

// Load the active check_measure row for a design, or create a blank draft.
async function loadOrCreateCheckMeasure(designId, entityType, entityId) {
  var client = sb(); if (!client) return null;
  try {
    var ex = await client.from('check_measures')
      .select('*').eq('design_id', designId).eq('completed', false)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (ex.data) return checkMeasureRowToState(ex.data);
    // No in-progress CM — create a blank draft.
    var id = 'CM_' + Date.now();
    var blank = toCheckMeasureRow({
      id: id, designId: designId, entityType: entityType, entityId: entityId,
      crewSizeRequired: 2, estimatedInstallDays: 1, completed: false,
    });
    var ins = await client.from('check_measures').insert(blank).select().maybeSingle();
    if (ins.error) throw ins.error;
    return checkMeasureRowToState(ins.data || blank);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('loadOrCreateCheckMeasure failed', e);
    return null;
  }
}

async function saveCheckMeasure(cm) {
  var client = sb();
  if (!client) {
    queuePendingWrite({ table: 'check_measures', op: 'upsert', data: toCheckMeasureRow(cm) });
    return { ok: true, offline: true };
  }
  try {
    var row = toCheckMeasureRow(cm);
    var res = await client.from('check_measures').upsert(row).select().maybeSingle();
    if (res.error) throw res.error;
    return { ok: true, offline: false };
  } catch (e) {
    queuePendingWrite({ table: 'check_measures', op: 'upsert', data: toCheckMeasureRow(cm) });
    return { ok: true, offline: true, error: e };
  }
}

// Complete the check-measure: flip completed=true on the CM row, advance the
// design stage, write planning rollup to the job, notify the CRM opener.
async function completeCheckMeasure(cm, designId, entityType, entityId) {
  var client = sb();
  var completedCm = Object.assign({}, cm, { completed: true });
  if (!client) {
    queuePendingWrite({ table: 'check_measures', op: 'upsert', data: toCheckMeasureRow(completedCm) });
    queuePendingWrite({ table: 'designs', op: 'update', id: designId,
                        data: { status: 'check_measured', stage: 'check_measure' }});
    return { ok: true, offline: true };
  }
  try {
    await client.from('check_measures').upsert(toCheckMeasureRow(completedCm));
    await client.from('designs').update({
      status: 'check_measured', stage: 'check_measure',
      updated_at: new Date().toISOString(),
    }).eq('id', designId);
    // Push planning fields to jobs row if entity is a job.
    if (entityType === 'job') {
      await client.from('jobs').update({
        estimated_install_days: completedCm.estimatedInstallDays,
        crew_size_required:     completedCm.crewSizeRequired,
        earliest_install_date:  completedCm.earliestInstallDate || null,
        updated_at: new Date().toISOString(),
      }).eq('id', entityId);
    }
    return { ok: true, offline: false };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('completeCheckMeasure failed', e);
    return { ok: false, error: e };
  }
}

// Upload a photo to the check-measure-photos bucket, return public URL.
async function uploadCheckMeasurePhoto(designId, file) {
  var client = sb(); if (!client) return null;
  try {
    var ext = (file.name || 'photo').split('.').pop();
    var path = designId + '/' + Date.now() + '_' + Math.random().toString(36).slice(2,8) + '.' + ext;
    var up = await client.storage.from('check-measure-photos').upload(path, file, {
      cacheControl: '3600', upsert: false,
    });
    if (up.error) throw up.error;
    var urlRes = client.storage.from('check-measure-photos').getPublicUrl(path);
    return urlRes.data && urlRes.data.publicUrl || null;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('uploadCheckMeasurePhoto failed', e);
    return null;
  }
}

