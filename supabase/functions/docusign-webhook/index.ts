// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: docusign-webhook
// ─────────────────────────────────────────────────────────────────────────────
// Receives DocuSign Connect callbacks. Configure in DocuSign Admin →
// Connect → Add Configuration:
//
//   Name:                Spartan Jobs CRM
//   URL:                 https://<project-ref>.supabase.co/functions/v1/docusign-webhook
//   Format:              JSON
//   Events:              Envelope Sent, Envelope Delivered, Envelope Completed,
//                        Envelope Declined, Envelope Voided
//   Include:             Documents (so we get the signed PDF), Certificate of
//                        Completion, Time Zone Information
//   HMAC Signature:      Enable, set a secret (also set as DOCUSIGN_HMAC_SECRET
//                        in Supabase secrets so we can verify)
//
// On envelope-completed, this handler:
//   1. Verifies the HMAC signature
//   2. Looks up the job by envelope ID (queries jobs table for matching docusign_envelope_id)
//   3. Updates job: docusign_status, completion timestamp
//   4. Stores the signed PDF in job_files
//   5. Transitions status d → c2 (Final Sign Off → Order & Schedule)
//      (status transition lives in the CRM — webhook stamps the necessary
//       fields and a job-page render runs the transition next time the user
//       opens the job, OR we POST back to a CRM-side trigger if needed)
// ─────────────────────────────────────────────────────────────────────────────

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifyHmac(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = Deno.env.get('DOCUSIGN_HMAC_SECRET');
  if (!secret) {
    // No secret configured → skip verification (dev mode). Log a warning.
    console.warn('DOCUSIGN_HMAC_SECRET not set — skipping HMAC verification');
    return true;
  }
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const sigBytes = new Uint8Array(sigBuf);
  let bin = '';
  for (let i = 0; i < sigBytes.length; i++) bin += String.fromCharCode(sigBytes[i]);
  const computed = btoa(bin);
  return computed === signatureHeader;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('POST required', { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get('X-DocuSign-Signature-1');
  const ok = await verifyHmac(rawBody, sigHeader);
  if (!ok) {
    console.error('HMAC verification failed');
    return new Response('signature mismatch', { status: 401, headers: corsHeaders });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch (_e) { return new Response('bad json', { status: 400, headers: corsHeaders }); }

  // Debug: log incoming payload top-level keys + event field so we can see
  // what DocuSign is actually sending. Trim to keep logs readable.
  console.log('[docusign-webhook] event=', payload.event, 'eventType=', payload.eventType,
              'envelopeId=', payload.data?.envelopeId || payload.envelopeId,
              'top-keys=', Object.keys(payload || {}).join(','));

  // Persist the parsed event + payload shape to a Supabase table so we can
  // SQL-inspect what DocuSign is sending. Survives log rotation and avoids
  // dashboard log-tab discoverability issues. Best-effort — failures here
  // don't block the rest of the handler.
  try {
    const _supaUrl = Deno.env.get('SUPABASE_URL');
    const _supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (_supaUrl && _supaKey) {
      const _dbg = createClient(_supaUrl, _supaKey);
      // Strip heavy document bytes so the row stays small
      const slim = JSON.parse(JSON.stringify(payload));
      if (slim?.data?.envelopeSummary?.documents) {
        slim.data.envelopeSummary.documents = slim.data.envelopeSummary.documents.map((d: any) => ({
          ...d, PDFBytes: d.PDFBytes ? `[${d.PDFBytes.length} bytes]` : null,
        }));
      }
      await _dbg.from('docusign_webhook_events').insert({
        received_at: new Date().toISOString(),
        event: payload.event || payload.eventType || null,
        envelope_id: payload.data?.envelopeId || payload.envelopeId || null,
        top_keys: Object.keys(payload || {}),
        payload: slim,
      });
    }
  } catch (logEx) {
    console.error('debug log table insert failed:', logEx);
  }

  // DocuSign Connect (JSON v2 format) sends:
  //   payload.event            — e.g. "envelope-completed"
  //   payload.data.envelopeId
  //   payload.data.envelopeSummary  — full envelope details
  //   payload.data.envelopeSummary.documents[] — base64 PDFs (when "Include Documents" enabled)
  const event = payload.event || payload.eventType || '';
  const envelopeId = payload.data?.envelopeId || payload.envelopeId;
  if (!envelopeId) {
    return new Response('no envelopeId in payload', { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    return new Response('server config error', { status: 500, headers: corsHeaders });
  }
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // Find the job this envelope belongs to. Final Design envelopes are stored
  // on docusign_envelope_id; Variation envelopes go to variation_envelope_id
  // (so a single job can have one of each in flight). Match either column.
  const { data: jobs, error: lookupErr } = await sb
    .from('jobs')
    .select('id, docusign_envelope_id, variation_envelope_id, status, has_variation')
    .or(`docusign_envelope_id.eq.${envelopeId},variation_envelope_id.eq.${envelopeId}`)
    .limit(1);

  if (lookupErr) {
    console.error('Job lookup failed:', lookupErr);
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const job = jobs && jobs[0];
  if (!job) {
    console.warn('No job found for envelope', envelopeId);
    // Acknowledge anyway — DocuSign retries non-2xx responses; we don't want
    // infinite retries when the mapping never existed (e.g. test envelopes).
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  // Determine kind — first by which column matched the envelope ID (most
  // reliable, doesn't depend on DocuSign Connect including customFields in
  // the payload), then fall back to the spartan_kind custom field stamped
  // by docusign-send for legacy / cross-validation cases.
  let kind: 'final_design' | 'variation' = 'final_design';
  if ((job as Record<string, unknown>).variation_envelope_id === envelopeId) {
    kind = 'variation';
  } else if ((job as Record<string, unknown>).docusign_envelope_id === envelopeId) {
    kind = 'final_design';
  } else {
    // Fall back to customFields if the matched column wasn't either
    // (shouldn't happen with the current schema but defensive).
    const customFields = payload.data?.envelopeSummary?.customFields?.textCustomFields
                      || payload.data?.envelopeSummary?.envelopeCustomFields?.textCustomFields
                      || [];
    const kindCF = (customFields as Array<{ name?: string; value?: string }>).find(
      (cf) => (cf.name || '').toLowerCase() === 'spartan_kind'
    );
    if (kindCF?.value === 'variation') kind = 'variation';
  }
  console.log('[docusign-webhook] dispatching event', event, 'as kind=', kind, 'for envelopeId=', envelopeId);

  // The shared docusign_status / docusign_completed_at columns track ONLY the
  // Final Design envelope. Variation events used to write into them too,
  // which polluted the Final Design badge — fixed here by scoping below.
  const updates: Record<string, unknown> = {};

  // On completed → stamp signature time, transition status, attach signed PDF.
  if (event === 'envelope-completed') {
    const signedAt = payload.data?.envelopeSummary?.completedDateTime || new Date().toISOString();

    if (kind === 'variation') {
      // Legacy path: customer signed a standalone Variation envelope. Only
      // touch the variation_* columns — the shared docusign_* ones belong to
      // the Final Design envelope.
      updates.variation_status = 'signed';
      updates.variation_signed_at = signedAt;
    } else {
      // Final Design — customer signed the binding contract. Stamp
      // finalSignedAt and advance the job to c2. CRM transition gate is
      // bypassed here because DocuSign already verified every clause.
      updates.docusign_status = event;
      updates.docusign_completed_at = signedAt;
      updates.final_signed_at = signedAt;
      updates.status = 'c2_order_schedule_standard';
      // Option B (variation folded into Final): when the Final envelope had
      // a variation_acceptance clause active (job.has_variation === true),
      // signing the Final IS signing the variation. Mark it accordingly so
      // the existing variation invoice flow (ensureVariationClaim) fires.
      if ((job as Record<string, unknown>).has_variation) {
        updates.variation_status = 'signed';
        updates.variation_signed_at = signedAt;
      }
    }

    // Attach signed PDF if included in the payload.
    const docs = payload.data?.envelopeSummary?.documents || payload.documents || [];
    const matchRegex = kind === 'variation' ? /variation/i : /final.*design/i;
    const signedDoc = docs.find((d: any) =>
      d.documentId === '1' || (d.name && matchRegex.test(d.name))
    );
    if (signedDoc && signedDoc.PDFBytes) {
      const fileName = (kind === 'variation'
          ? `variation-signed-${envelopeId}.pdf`
          : `final-design-signed-${envelopeId}.pdf`);
      const category = kind === 'variation' ? 'variation_signed' : 'final_design_signed';
      try {
        const { error: storageErr } = await sb.storage
          .from('job-files')
          .upload(`${job.id}/${fileName}`, Uint8Array.from(atob(signedDoc.PDFBytes), (c) => c.charCodeAt(0)), {
            contentType: 'application/pdf',
            upsert: true,
          });
        if (!storageErr) {
          await sb.from('job_files').insert({
            job_id: job.id,
            file_name: fileName,
            category: category,
            uploaded_at: signedAt,
            uploaded_by: 'docusign-webhook',
          });
        }
      } catch (storageEx) {
        console.error('Failed to store signed PDF:', storageEx);
      }
    }
  } else if (event === 'envelope-declined' || event === 'envelope-voided') {
    if (kind === 'variation') {
      // Customer declined / voided the variation. Roll back the in-progress
      // status so the Sales Manager can re-issue or mark non-material.
      // Don't touch the shared docusign_declined_at — it belongs to the
      // Final Design envelope.
      updates.variation_status = 'awaiting_quote';
    } else {
      updates.docusign_status = event;
      updates.docusign_declined_at = new Date().toISOString();
      // Final Design declined: keep job status at c1; SM sees decline + chases.
    }
  } else {
    // Other envelope events (sent / delivered / etc.) only update the shared
    // status column when this is a Final Design envelope.
    if (kind !== 'variation') updates.docusign_status = event;
  }

  const { error: updErr } = await sb.from('jobs').update(updates).eq('id', job.id);
  if (updErr) {
    console.error('Job update failed:', updErr);
    return new Response('update failed', { status: 500, headers: corsHeaders });
  }

  return new Response('ok', { status: 200, headers: corsHeaders });
});
