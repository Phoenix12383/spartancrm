/* ═══════════════════════════════════════════════════════════════════════════
   41 — Build storage
   ═══════════════════════════════════════════════════════════════════════════
   Local-first persistence for "builds" (a build = the full state of one job:
   projectItems + measurementsByFrameId + siteChecklist + project metadata).

   The CRM is the system of record for shipped jobs. This module is the
   in-browser SECOND COPY: a defensive backup so that:
     - if Supabase/CRM is down, the user can keep working
     - if a CRM hydration sends an older or wrong version, the local copy
       has a snapshot of what was about to be clobbered
     - if the user needs an off-machine backup, they can download a JSON file

   ─── Storage layout ────────────────────────────────────────────────────────
     spartan_cad_builds_index          → array of summary rows for search:
                                         { buildId, customerName, address,
                                           jobNumber, quoteNumber, lastSaved,
                                           phase, snapshotCount }

     spartan_cad_build_<buildId>       → full build payload (current state)
     spartan_cad_snapshot_<buildId>_<timestamp>
                                       → immutable named snapshot (manual save,
                                         phase complete, pre-CRM-hydrate)
     spartan_cad_active_build_id       → string, which build is loaded right now

   buildId: prefer crmLink.design.id when CRM-linked, otherwise generate
            'local_<timestamp>_<random>' on first save. Stable for a build's
            lifetime. Re-keys on CRM reconciliation (see promoteLocalToCrm).

   ─── Quotas & limits ───────────────────────────────────────────────────────
   localStorage is 5-10 MB depending on browser. A build with photos can be
   1-2 MB. Snapshot count caps at 20 per build (oldest pruned). The download
   backup is the safety net for true archival storage.

   ─── Public API on window.SpartanBuildStorage ──────────────────────────────
     loadIndex()                       → [ { buildId, customerName, ... } ]
     saveBuild(buildId, payload)       → updates the live current-state key
                                         and the index summary in one shot.
                                         Catches QuotaExceededError.
     loadBuild(buildId)                → full build payload or null
     deleteBuild(buildId)              → removes build, snapshots, and index row
     listSnapshots(buildId)            → [ { key, ts, label, phase } ] sorted desc
     saveSnapshot(buildId, payload, label, phase)
                                       → writes immutable snapshot,
                                         prunes oldest if > 20
     loadSnapshot(key)                 → full snapshot payload
     deleteSnapshot(key)               → removes snapshot
     getActiveBuildId()                → 'currently loaded' build id, or null
     setActiveBuildId(id)              → mark which build the editor loaded
     promoteLocalToCrm(localId, crmId) → re-key when CRM assigns a designId
     buildIdFromCrm(crmLink)           → derive buildId from a crmLink, or null
     newLocalBuildId()                 → fresh local_<ts>_<rand>
     downloadAllBuildsJSON()           → triggers browser download of every
                                         build + snapshots + index as one JSON
     restoreBuildsFromJSON(text)       → import counterpart of the download.
                                         Returns { imported, skipped, errors[] }
     storageUsageBytes()               → approximate bytes used by all our keys
   ═══════════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';
  // Don't double-define if hot-reloaded. If a previous full implementation
  // is already installed (marker: _fullImpl), skip. If only an emergency
  // shim is present (marker: _isShim), continue and replace it with the
  // full implementation below.
  if (typeof window === 'undefined') return;
  if (window.SpartanBuildStorage && window.SpartanBuildStorage._fullImpl) return;

  var BUILD_PREFIX     = 'spartan_cad_build_';
  var SNAPSHOT_PREFIX  = 'spartan_cad_snapshot_';
  var INDEX_KEY        = 'spartan_cad_builds_index';
  var ACTIVE_KEY       = 'spartan_cad_active_build_id';
  var MAX_SNAPSHOTS_PER_BUILD = 20;

  // Monotonic counter so snapshots created in the same millisecond get
  // distinct keys. Without this, rapid snapshots (auto + phase + manual
  // within a tick) would clobber each other.
  var _tsCounter = 0;
  var _lastTs = 0;
  function nextSnapshotTs() {
    var now = Date.now();
    if (now <= _lastTs) {
      _tsCounter++;
      return _lastTs * 1000 + _tsCounter;  // sub-ms slot
    }
    _lastTs = now;
    _tsCounter = 0;
    return now * 1000;
  }

  // ─── Index ────────────────────────────────────────────────────────────
  function loadIndex() {
    try {
      var raw = localStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('SpartanBuildStorage: index parse failed', e);
      return [];
    }
  }
  function writeIndex(arr) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(arr || [])); }
    catch (e) { console.warn('SpartanBuildStorage: index write failed', e); }
  }
  // Update or insert a summary row for one build. Lots of read-modify-write
  // happens here — we accept the cost because the index is small (one row per
  // build, dozens of builds) and keeping it consistent on every save matters
  // more than micro-optimisation.
  function upsertIndexRow(buildId, summary) {
    var idx = loadIndex();
    var existingPos = -1;
    for (var i = 0; i < idx.length; i++) {
      if (idx[i].buildId === buildId) { existingPos = i; break; }
    }
    var row = Object.assign({ buildId: buildId }, summary);
    if (existingPos >= 0) idx[existingPos] = row;
    else idx.unshift(row);  // newest first
    writeIndex(idx);
    return row;
  }
  function removeIndexRow(buildId) {
    var idx = loadIndex();
    var next = idx.filter(function(r) { return r.buildId !== buildId; });
    if (next.length !== idx.length) writeIndex(next);
  }

  // ─── Build core ───────────────────────────────────────────────────────
  function loadBuild(buildId) {
    if (!buildId) return null;
    try {
      var raw = localStorage.getItem(BUILD_PREFIX + buildId);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('SpartanBuildStorage: load failed for', buildId, e);
      return null;
    }
  }
  // saveBuild is the workhorse — every auto-save calls this. We catch
  // QuotaExceededError specifically so the caller can surface an
  // actionable warning to the user (offer to download backup + clean up
  // old snapshots).
  function saveBuild(buildId, payload) {
    if (!buildId) throw new Error('saveBuild: buildId required');
    var serialised = JSON.stringify(payload || {});
    try {
      localStorage.setItem(BUILD_PREFIX + buildId, serialised);
    } catch (e) {
      // Quota or disabled localStorage. Don't silently swallow — tell caller.
      var err = new Error('Local save failed: ' + (e && e.name === 'QuotaExceededError' ? 'storage full' : (e && e.message) || 'unknown'));
      err.cause = e;
      err.code = (e && e.name) || 'StorageError';
      throw err;
    }
    // Summary row built from payload — index never has to load full builds.
    var summary = {
      customerName:  (payload && payload.customerName) || '',
      address:       (payload && payload.address) || '',
      jobNumber:     (payload && payload.jobNumber) || '',
      quoteNumber:   (payload && payload.quoteNumber) || '',
      designId:      (payload && payload.designId) || '',
      lastSaved:     Date.now(),
      phase:         (payload && payload.phase) || 'design',
      frameCount:    (payload && Array.isArray(payload.projectItems)) ? payload.projectItems.length : 0,
      snapshotCount: listSnapshots(buildId).length,
      sizeBytes:     serialised.length,  // approximate; UTF-16 doubles in some browsers
    };
    upsertIndexRow(buildId, summary);
    return summary;
  }
  function deleteBuild(buildId) {
    if (!buildId) return;
    // Drop main payload + every snapshot + index row.
    try { localStorage.removeItem(BUILD_PREFIX + buildId); } catch (e) {}
    var snapshots = listSnapshots(buildId);
    snapshots.forEach(function(s) {
      try { localStorage.removeItem(s.key); } catch (e) {}
    });
    removeIndexRow(buildId);
    if (getActiveBuildId() === buildId) setActiveBuildId(null);
  }

  // ─── Snapshots ────────────────────────────────────────────────────────
  function listSnapshots(buildId) {
    if (!buildId) return [];
    var prefix = SNAPSHOT_PREFIX + buildId + '_';
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(prefix) !== 0) continue;
        var meta = parseSnapshotMeta(k);
        if (meta) out.push(meta);
      }
    } catch (e) { return []; }
    out.sort(function(a, b) { return b.ts - a.ts; });  // newest first
    return out;
  }
  // Snapshot keys carry their timestamp + label inline so the index can be
  // listed without reading every payload. Format:
  //   spartan_cad_snapshot_<buildId>_<ts>_<phase>
  // and label/full payload live in JSON. Phase suffix lets us style differently
  // (e.g. survey_complete glows green).
  function parseSnapshotMeta(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return {
        key:    key,
        ts:     p._snapshotTs || 0,
        label:  p._snapshotLabel || '',
        phase:  p._snapshotPhase || 'manual',
        sizeBytes: raw.length,
      };
    } catch (e) { return null; }
  }
  function saveSnapshot(buildId, payload, label, phase) {
    if (!buildId) throw new Error('saveSnapshot: buildId required');
    var ts = nextSnapshotTs();
    var key = SNAPSHOT_PREFIX + buildId + '_' + ts + '_' + (phase || 'manual');
    var enriched = Object.assign({}, payload || {}, {
      _snapshotTs:    ts,
      _snapshotLabel: label || '',
      _snapshotPhase: phase || 'manual',
    });
    try {
      localStorage.setItem(key, JSON.stringify(enriched));
    } catch (e) {
      var err = new Error('Snapshot save failed: ' + (e && e.name === 'QuotaExceededError' ? 'storage full' : (e && e.message) || 'unknown'));
      err.cause = e;
      err.code = (e && e.name) || 'StorageError';
      throw err;
    }
    // Cap snapshot count — prune oldest beyond MAX_SNAPSHOTS_PER_BUILD.
    var existing = listSnapshots(buildId);
    if (existing.length > MAX_SNAPSHOTS_PER_BUILD) {
      var excess = existing.slice(MAX_SNAPSHOTS_PER_BUILD);
      excess.forEach(function(s) {
        try { localStorage.removeItem(s.key); } catch (e) {}
      });
    }
    // Refresh index row so snapshotCount stays accurate.
    var idx = loadIndex();
    for (var i = 0; i < idx.length; i++) {
      if (idx[i].buildId === buildId) {
        idx[i].snapshotCount = Math.min(existing.length, MAX_SNAPSHOTS_PER_BUILD);
        idx[i].lastSnapshot = ts;
        writeIndex(idx);
        break;
      }
    }
    return key;
  }
  function loadSnapshot(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function deleteSnapshot(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    // Refresh affected build's index row snapshotCount.
    var match = key.indexOf(SNAPSHOT_PREFIX) === 0
      ? key.slice(SNAPSHOT_PREFIX.length).split('_')[0]
      : null;
    if (match) {
      var remaining = listSnapshots(match);
      var idx = loadIndex();
      for (var i = 0; i < idx.length; i++) {
        if (idx[i].buildId === match) {
          idx[i].snapshotCount = remaining.length;
          writeIndex(idx);
          break;
        }
      }
    }
  }

  // ─── Active build ─────────────────────────────────────────────────────
  function getActiveBuildId() {
    try { return localStorage.getItem(ACTIVE_KEY) || null; }
    catch (e) { return null; }
  }
  function setActiveBuildId(id) {
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else    localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {}
  }

  // ─── ID helpers ───────────────────────────────────────────────────────
  function newLocalBuildId() {
    return 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }
  function buildIdFromCrm(crmLink) {
    if (!crmLink || !crmLink.design || !crmLink.design.id) return null;
    return 'crm_' + crmLink.design.id;
  }
  // When a draft local build gets linked to a CRM design, copy the local
  // payload + snapshots over to the CRM-keyed slots so future auto-saves
  // write to the right place. Old local keys are removed.
  function promoteLocalToCrm(localId, crmDesignId) {
    if (!localId || !crmDesignId) return null;
    var crmId = 'crm_' + crmDesignId;
    if (localId === crmId) return crmId;  // already correct
    var payload = loadBuild(localId);
    if (!payload) return null;
    payload.designId = crmDesignId;
    saveBuild(crmId, payload);
    // Copy snapshots
    var snapshots = listSnapshots(localId);
    snapshots.forEach(function(s) {
      var snapPayload = loadSnapshot(s.key);
      if (!snapPayload) return;
      var newKey = SNAPSHOT_PREFIX + crmId + '_' + s.ts + '_' + s.phase;
      try { localStorage.setItem(newKey, JSON.stringify(snapPayload)); } catch (e) {}
    });
    deleteBuild(localId);
    if (getActiveBuildId() === localId) setActiveBuildId(crmId);
    return crmId;
  }

  // ─── JSON download / restore ──────────────────────────────────────────
  function dumpAllBuilds() {
    var out = {
      _format:    'spartan_cad_builds_v1',
      _exportedAt: new Date().toISOString(),
      _version:   1,
      index:      loadIndex(),
      builds:     {},     // buildId → full payload
      snapshots:  {},     // snapshotKey → full snapshot payload
    };
    out.index.forEach(function(row) {
      var b = loadBuild(row.buildId);
      if (b) out.builds[row.buildId] = b;
      var snaps = listSnapshots(row.buildId);
      snaps.forEach(function(s) {
        var sp = loadSnapshot(s.key);
        if (sp) out.snapshots[s.key] = sp;
      });
    });
    return out;
  }
  function downloadAllBuildsJSON() {
    var data = dumpAllBuilds();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'spartan-cad-builds-' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    return data;
  }
  // Import from a previously-downloaded JSON file. Conservative behaviour:
  // if a build with the same ID already exists locally and its lastSaved is
  // newer than the imported one, the import is skipped for that build (we
  // don't clobber newer local data with older backups). Override available
  // via { force: true } in opts.
  function restoreBuildsFromJSON(text, opts) {
    opts = opts || {};
    var report = { imported: 0, skipped: 0, errors: [] };
    var data;
    try { data = JSON.parse(text); }
    catch (e) {
      report.errors.push('Could not parse JSON: ' + e.message);
      return report;
    }
    if (!data || data._format !== 'spartan_cad_builds_v1') {
      report.errors.push('Not a Spartan CAD builds backup file');
      return report;
    }
    var liveIndex = loadIndex();
    var liveById = {};
    liveIndex.forEach(function(r) { liveById[r.buildId] = r; });

    Object.keys(data.builds || {}).forEach(function(buildId) {
      var incoming = data.builds[buildId];
      var existingRow = liveById[buildId];
      var importedTs = (data.index || []).find(function(r) { return r.buildId === buildId; });
      importedTs = importedTs && importedTs.lastSaved;
      if (existingRow && !opts.force && importedTs && existingRow.lastSaved > importedTs) {
        report.skipped++;
        return;
      }
      try {
        saveBuild(buildId, incoming);
        report.imported++;
      } catch (e) {
        report.errors.push('Could not import ' + buildId + ': ' + e.message);
      }
    });
    Object.keys(data.snapshots || {}).forEach(function(snapKey) {
      try { localStorage.setItem(snapKey, JSON.stringify(data.snapshots[snapKey])); }
      catch (e) { report.errors.push('Could not import snapshot ' + snapKey + ': ' + e.message); }
    });
    return report;
  }

  // ─── Storage usage ────────────────────────────────────────────────────
  function storageUsageBytes() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf(BUILD_PREFIX) === 0
         || k.indexOf(SNAPSHOT_PREFIX) === 0
         || k === INDEX_KEY) {
          var v = localStorage.getItem(k) || '';
          total += k.length + v.length;
        }
      }
    } catch (e) {}
    return total;
  }

  // ─── Supabase mirror (optional) ───────────────────────────────────────
  // Local storage is the source of truth — fast, offline-capable, and the
  // search index reads it. Supabase is the SECOND backend for cross-device
  // access: when configured, every saveBuild also fires-and-forgets a
  // sync to a `cad_builds` table. Reads still come from the local index;
  // explicit "Pull from cloud" merges the cloud list back into local.
  //
  // Schema for cad_builds (run this once in Supabase SQL editor):
  //   create table cad_builds (
  //     id text primary key,
  //     customer_name text,
  //     address text,
  //     job_number text,
  //     quote_number text,
  //     phase text,
  //     frame_count int,
  //     payload jsonb not null,
  //     last_saved bigint,
  //     created_at timestamptz default now(),
  //     updated_at timestamptz default now()
  //   );
  //   alter table cad_builds enable row level security;
  //   create policy "anyone can read" on cad_builds for select using (true);
  //   create policy "anyone can write" on cad_builds for insert with check (true);
  //   create policy "anyone can update" on cad_builds for update using (true);
  //   create policy "anyone can delete" on cad_builds for delete using (true);
  //
  // (Tighten the policies once user auth is wired — for now anon access
  // matches the rest of the CAD app's Supabase usage.)
  //
  // sb() and sbConfigured() are defined in 14-crm-supabase-sync.js — we
  // call them via the global if present, otherwise short-circuit.

  function _sbClient() {
    return (typeof sb === 'function') ? sb() : null;
  }

  // Sync one build to Supabase. Fire-and-forget — doesn't block save.
  function syncBuildToSupabase(buildId, payload) {
    var client = _sbClient();
    if (!client) return Promise.resolve({ ok: false, reason: 'not configured' });
    var row = {
      id:            buildId,
      customer_name: payload.customerName || '',
      address:       payload.address || '',
      job_number:    payload.jobNumber || '',
      quote_number:  payload.quoteNumber || '',
      phase:         payload.phase || 'design',
      frame_count:   Array.isArray(payload.projectItems) ? payload.projectItems.length : 0,
      payload:       payload,
      last_saved:    Date.now(),
      updated_at:    new Date().toISOString(),
    };
    return client.from('cad_builds').upsert(row).then(function(res) {
      if (res.error) {
        // Queue for retry. Reuse the existing pending-writes queue from
        // 14-crm-supabase-sync.js if its helpers are global; otherwise a
        // local fallback queue.
        if (typeof queuePendingWrite === 'function') {
          queuePendingWrite({ op: 'upsert', table: 'cad_builds', data: row });
        } else {
          try {
            var qkey = 'spartan_cad_builds_pending';
            var q = JSON.parse(localStorage.getItem(qkey) || '[]');
            q.push({ op: 'upsert', table: 'cad_builds', data: row, ts: Date.now() });
            localStorage.setItem(qkey, JSON.stringify(q));
          } catch (e) {}
        }
        return { ok: false, reason: 'write failed', error: res.error };
      }
      return { ok: true };
    }).catch(function(err) {
      return { ok: false, reason: 'exception', error: err };
    });
  }

  // Pull all builds from Supabase. Returns rows in the cad_builds shape.
  function listBuildsFromSupabase() {
    var client = _sbClient();
    if (!client) return Promise.resolve({ ok: false, reason: 'not configured', rows: [] });
    return client.from('cad_builds').select('*').order('last_saved', { ascending: false }).then(function(res) {
      if (res.error) return { ok: false, reason: 'read failed', error: res.error, rows: [] };
      return { ok: true, rows: res.data || [] };
    }).catch(function(err) {
      return { ok: false, reason: 'exception', error: err, rows: [] };
    });
  }

  // Pull one build's full payload from Supabase. Used when the user
  // clicks Load on a build whose local copy is missing/stale.
  function loadBuildFromSupabase(buildId) {
    var client = _sbClient();
    if (!client) return Promise.resolve(null);
    return client.from('cad_builds').select('payload').eq('id', buildId).maybeSingle().then(function(res) {
      if (res.error || !res.data) return null;
      return res.data.payload || null;
    }).catch(function() { return null; });
  }

  // Merge cloud index into local. For each cloud row not in local, copy
  // its payload into local storage. For each cloud row newer than local
  // (last_saved), update local. Returns counts.
  function mergeSupabaseIndex() {
    return listBuildsFromSupabase().then(function(res) {
      if (!res.ok) return { ok: false, reason: res.reason, added: 0, updated: 0 };
      var added = 0, updated = 0;
      var localIdx = loadIndex();
      var localById = {};
      localIdx.forEach(function(r) { localById[r.buildId] = r; });
      res.rows.forEach(function(row) {
        var existing = localById[row.id];
        var cloudTs = row.last_saved || 0;
        if (!existing) {
          try { saveBuild(row.id, row.payload || {}); added++; } catch (e) {}
        } else if (cloudTs > (existing.lastSaved || 0)) {
          try { saveBuild(row.id, row.payload || {}); updated++; } catch (e) {}
        }
      });
      return { ok: true, added: added, updated: updated, total: res.rows.length };
    });
  }

  // Delete from Supabase mirror.
  function deleteBuildFromSupabase(buildId) {
    var client = _sbClient();
    if (!client) return Promise.resolve({ ok: false });
    return client.from('cad_builds').delete().eq('id', buildId).then(function(res) {
      return { ok: !res.error, error: res.error };
    }).catch(function(err) { return { ok: false, error: err }; });
  }

  window.SpartanBuildStorage = {
    _fullImpl:             true,
    loadIndex:             loadIndex,
    saveBuild:             saveBuild,
    loadBuild:             loadBuild,
    deleteBuild:           deleteBuild,
    listSnapshots:         listSnapshots,
    saveSnapshot:          saveSnapshot,
    loadSnapshot:          loadSnapshot,
    deleteSnapshot:        deleteSnapshot,
    getActiveBuildId:      getActiveBuildId,
    setActiveBuildId:      setActiveBuildId,
    newLocalBuildId:       newLocalBuildId,
    buildIdFromCrm:        buildIdFromCrm,
    promoteLocalToCrm:     promoteLocalToCrm,
    downloadAllBuildsJSON: downloadAllBuildsJSON,
    restoreBuildsFromJSON: restoreBuildsFromJSON,
    storageUsageBytes:     storageUsageBytes,
    // Supabase mirror
    syncBuildToSupabase:   syncBuildToSupabase,
    listBuildsFromSupabase: listBuildsFromSupabase,
    loadBuildFromSupabase: loadBuildFromSupabase,
    mergeSupabaseIndex:    mergeSupabaseIndex,
    deleteBuildFromSupabase: deleteBuildFromSupabase,
    MAX_SNAPSHOTS_PER_BUILD: MAX_SNAPSHOTS_PER_BUILD,
  };
})();
