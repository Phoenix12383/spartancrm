// ═══════════════════════════════════════════════════════════════════════════
// FINALISATION / SIGNATURE HELPERS (spec §6)
// ═══════════════════════════════════════════════════════════════════════════

// Move a design to awaiting_signature and insert a design_signatures row.
// PDF generation itself is handled by the UI layer (jsPDF) and the returned
// URL is passed in; this function just persists the DB state.
async function createSignatureRequest(designId, entityType, entityId, recipientEmail, pdfUrl, currentUserId) {
  var client = sb();
  var sigId = 'SIG_' + Date.now();
  var token = (function(){
    var arr = new Uint8Array(24);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr, function(b){ return b.toString(36); }).join('').slice(0, 32);
  })();
  var cadBase = (typeof location !== 'undefined' ? location.origin : 'https://cad.spaartan.tech');
  var signingUrl = cadBase + '/?sign=' + token;
  var expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  var sigRow = {
    id: sigId, design_id: designId,
    entity_type: entityType, entity_id: entityId,
    document_url: pdfUrl || null,
    sent_to_email: recipientEmail,
    sent_by: currentUserId || null,
    signing_url: signingUrl, signing_token: token,
    status: 'sent', expires_at: expiresAt,
  };
  if (!client) {
    queuePendingWrite({ table: 'design_signatures', op: 'insert', data: sigRow });
    queuePendingWrite({ table: 'designs', op: 'update', id: designId,
                        data: { status: 'awaiting_signature', stage: 'final' }});
    return { ok: true, offline: true, signatureId: sigId, signingUrl: signingUrl, token: token };
  }
  try {
    await client.from('design_signatures').insert(sigRow);
    await client.from('designs').update({
      status: 'awaiting_signature', stage: 'final',
      updated_at: new Date().toISOString(),
    }).eq('id', designId);
    return { ok: true, offline: false, signatureId: sigId, signingUrl: signingUrl, token: token };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('createSignatureRequest failed', e);
    return { ok: false, error: e };
  }
}

// Read a signature record by its token (for the anonymous signing page).
// Uses the anon read policy from spec §2.4.
async function loadSignatureByToken(token) {
  var client = sb(); if (!client) return null;
  try {
    var res = await client.from('design_signatures')
      .select('*').eq('signing_token', token).maybeSingle();
    if (res.error) throw res.error;
    return res.data;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('loadSignatureByToken failed', e);
    return null;
  }
}

// Apply a customer signature: flips status, captures name+signature+IP.
async function submitSignature(token, typedName, signatureDataUrl) {
  var client = sb(); if (!client) return { ok: false, error: 'no supabase' };
  try {
    // Best-effort IP capture; safe to skip on error.
    var ip = null;
    try {
      var ipRes = await fetch('https://api.ipify.org?format=json').then(function(r){ return r.json(); });
      ip = ipRes && ipRes.ip;
    } catch (e) { /* ignore */ }
    var update = {
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_name: typedName,
      signature_data: signatureDataUrl,
      signed_ip: ip,
      updated_at: new Date().toISOString(),
    };
    var res = await client.from('design_signatures').update(update)
      .eq('signing_token', token).in('status', ['sent','viewed']).select().maybeSingle();
    if (res.error) throw res.error;
    if (res.data && res.data.design_id) {
      await client.from('designs').update({
        status: 'signed', stage: 'final',
        updated_at: new Date().toISOString(),
      }).eq('id', res.data.design_id);
    }
    return { ok: true, signature: res.data };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('submitSignature failed', e);
    return { ok: false, error: e };
  }
}

