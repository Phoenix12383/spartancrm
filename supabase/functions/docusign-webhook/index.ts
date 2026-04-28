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

  // Find the job this envelope belongs to. We store the envelope ID on the job
  // when sending. If we haven't yet added a docusign_envelope_id column, fall
  // back to a metadata search — the CRM-side store of envelope→job mapping is
  // expected to be the system of record.
  const { data: jobs } = await sb
    .from('jobs')
    .select('id, docusign_envelope_id, status, audit_log')
    .eq('docusign_envelope_id', envelopeId)
    .limit(1);

  const job = jobs && jobs[0];
  if (!job) {
    console.warn('No job found for envelope', envelopeId);
    // Acknowledge anyway — DocuSign retries non-2xx responses; we don't want
    // infinite retries when the mapping never existed (e.g. test envelopes).
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const updates: Record<string, unknown> = {
    docusign_status: event,
  };

  // On completed → stamp signature time, transition status, attach signed PDF.
  if (event === 'envelope-completed') {
    const signedAt = payload.data?.envelopeSummary?.completedDateTime || new Date().toISOString();
    updates.final_signed_at = signedAt;
    updates.docusign_completed_at = signedAt;
    // Transition d → c2. The CRM's transitionJobStatus normally runs this with
    // canTransition gating; we trust DocuSign here because the customer signed.
    updates.status = 'c2_order_schedule_standard';

    // Attach signed PDF if included in the payload.
    const docs = payload.data?.envelopeSummary?.documents || payload.documents || [];
    const signedDoc = docs.find((d: any) =>
      d.documentId === '1' || (d.name && /final.*design/i.test(d.name))
    );
    if (signedDoc && signedDoc.PDFBytes) {
      const fileName = `final-design-signed-${envelopeId}.pdf`;
      try {
        // Upload to Supabase Storage bucket 'job-files'
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
            category: 'final_design_signed',
            uploaded_at: signedAt,
            uploaded_by: 'docusign-webhook',
          });
        }
      } catch (storageEx) {
        console.error('Failed to store signed PDF:', storageEx);
      }
    }
  } else if (event === 'envelope-declined' || event === 'envelope-voided') {
    updates.docusign_declined_at = new Date().toISOString();
    // Keep status at d (Final Sign Off). Sales Manager sees decline + chases.
  }

  const { error: updErr } = await sb.from('jobs').update(updates).eq('id', job.id);
  if (updErr) {
    console.error('Job update failed:', updErr);
    return new Response('update failed', { status: 500, headers: corsHeaders });
  }

  return new Response('ok', { status: 200, headers: corsHeaders });
});
