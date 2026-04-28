// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: docusign-send
// ─────────────────────────────────────────────────────────────────────────────
// Builds and sends a DocuSign envelope from the Spartan Final Design template.
//
// Request body (POST JSON):
//   {
//     jobId: string,              // for our own audit + return
//     templateId: string,         // override template (optional; default DOCUSIGN_TEMPLATE_FINAL_DESIGN)
//     customerName: string,
//     customerEmail: string,
//     emailSubject?: string,
//     emailBlurb?: string,
//     pdfBase64: string,          // CAD-generated Final Design PDF (base64, no data: prefix)
//     flags: {                    // controls which conditional clause tabs to include
//       renderWarning?: boolean,
//       specialColour?: boolean,
//       hasVariation?: boolean,
//     }
//   }
//
// Response (200):
//   { ok: true, envelopeId: string, status: string, sentAt: string }
//
// Response (4xx/5xx):
//   { ok: false, error: string, detail?: any }
// ─────────────────────────────────────────────────────────────────────────────

import { corsHeaders } from '../_shared/cors.ts';
import { getDocuSignAccessToken, getDocuSignApiBase, getDocuSignAccountId } from '../_shared/docusign-jwt.ts';

interface SendRequest {
  jobId: string;
  templateId?: string;
  customerName: string;
  customerEmail: string;
  emailSubject?: string;
  emailBlurb?: string;
  pdfBase64: string;
  flags?: {
    renderWarning?: boolean;
    specialColour?: boolean;
    hasVariation?: boolean;
  };
}

// Map of clause key → tabLabel + anchor string. Tab labels match the Data Labels
// configured on the DocuSign template; anchor strings are what CAD prints into
// the Final Design PDF (1pt white text). DocuSign places the signature at each
// anchor position regardless of where the tab was originally dropped in the
// template designer.
const CLAUSE_TABS: Record<string, { tabLabel: string; anchorString: string; conditional?: keyof NonNullable<SendRequest['flags']> }> = {
  opening_dir:      { tabLabel: 'sp_sig_opening_dir',     anchorString: '\\sp_sig_opening_dir\\' },
  glass_type:       { tabLabel: 'sp_sig_glass_type',      anchorString: '\\sp_sig_glass_type\\' },
  override:         { tabLabel: 'sp_sig_override',        anchorString: '\\sp_sig_override\\' },
  render_warning:   { tabLabel: 'sp_sig_render_warning',  anchorString: '\\sp_sig_render_warning\\',  conditional: 'renderWarning' },
  special_colour:   { tabLabel: 'sp_sig_special_colour',  anchorString: '\\sp_sig_special_colour\\',  conditional: 'specialColour' },
  variation:        { tabLabel: 'sp_sig_variation',       anchorString: '\\sp_sig_variation\\',       conditional: 'hasVariation' },
  production_auth:  { tabLabel: 'sp_sig_production_auth', anchorString: '\\sp_sig_production_auth\\' },
};

function buildSignHereTabs(flags: NonNullable<SendRequest['flags']>) {
  const tabs: Array<Record<string, string>> = [];
  for (const key of Object.keys(CLAUSE_TABS)) {
    const cl = CLAUSE_TABS[key];
    if (cl.conditional && !flags[cl.conditional]) continue;
    tabs.push({
      tabLabel:      cl.tabLabel,
      anchorString:  cl.anchorString,
      anchorXOffset: '0',
      anchorYOffset: '0',
      anchorUnits:   'inches',
      anchorIgnoreIfNotPresent: 'true',
    });
  }
  return tabs;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST required' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // TODO (production hardening): require a shared secret in a custom header
  // so the function isn't callable by anyone who guesses the URL. Set
  // SPARTAN_SHARED_SECRET in Supabase secrets and pass it from the CRM via
  // _sb.functions.invoke('docusign-send', { headers: { 'x-spartan-secret': ... } }).
  // For sandbox/development this is unnecessary (function URL isn't public).
  const sharedSecret = Deno.env.get('SPARTAN_SHARED_SECRET');
  if (sharedSecret) {
    const got = req.headers.get('x-spartan-secret');
    if (got !== sharedSecret) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let body: SendRequest & { action?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Debug actions (gate behind a debug flag in production) ──
  //   POST {action:"list-templates"}                            → list templates
  //   POST {action:"get-envelope",  envelopeId:"..."}            → envelope status
  //   POST {action:"get-template",  templateId?:"..."}           → template tabs/recipients
  if (body.action === 'list-templates' || body.action === 'get-envelope' || body.action === 'get-template') {
    let dbgToken: string;
    try { dbgToken = await getDocuSignAccessToken(); }
    catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'Auth failed', detail: String(e) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const acctBase = `${getDocuSignApiBase()}/v2.1/accounts/${getDocuSignAccountId()}`;
    let dbgUrl = '';
    if (body.action === 'list-templates') {
      dbgUrl = `${acctBase}/templates`;
    } else if (body.action === 'get-envelope') {
      const envId = (body as { envelopeId?: string }).envelopeId;
      if (!envId) {
        return new Response(JSON.stringify({ ok: false, error: 'envelopeId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      dbgUrl = `${acctBase}/envelopes/${envId}?include=recipients`;
    } else { // get-template
      const tplId = (body as { templateId?: string }).templateId
                    || Deno.env.get('DOCUSIGN_TEMPLATE_FINAL_DESIGN');
      if (!tplId) {
        return new Response(JSON.stringify({ ok: false, error: 'templateId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Full template fetch — includes documents, recipients, tabs, etc.
      dbgUrl = `${acctBase}/templates/${tplId}?include=recipients,documents,tabs`;
    }
    const dr = await fetch(dbgUrl, { headers: { 'Authorization': `Bearer ${dbgToken}` } });
    const dj = await dr.json();
    return new Response(JSON.stringify(dj, null, 2), {
      status: dr.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Required fields
  for (const f of ['jobId', 'customerName', 'customerEmail', 'pdfBase64'] as const) {
    if (!body[f]) {
      return new Response(JSON.stringify({ ok: false, error: `Missing required field: ${f}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const templateId = body.templateId || Deno.env.get('DOCUSIGN_TEMPLATE_FINAL_DESIGN');
  if (!templateId) {
    return new Response(JSON.stringify({ ok: false, error: 'DOCUSIGN_TEMPLATE_FINAL_DESIGN not set and no templateId in body' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let accessToken: string;
  try {
    accessToken = await getDocuSignAccessToken();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'DocuSign auth failed', detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const flags = body.flags || {};
  const signHereTabs = buildSignHereTabs(flags);

  // Build a composite envelope (no template). All recipient + tab config
  // lives in this request — DocuSign just routes the envelope. Avoids the
  // fragility of a template that depends on UI-side tab-to-recipient
  // assignment surviving every edit.
  const envelopeDef = {
    emailSubject: body.emailSubject || `Action Required: Sign your Spartan Final Design — Job ${body.jobId}`,
    emailBlurb:   body.emailBlurb   || `Hi ${body.customerName},\n\nYour Spartan Double Glazing Final Design is ready for your signature. Please review the attached document and sign each clause to authorise production.`,
    status: 'sent',
    documents: [{
      documentBase64: body.pdfBase64,
      name: `Final Design — ${body.jobId}.pdf`,
      fileExtension: 'pdf',
      documentId: '1',
    }],
    recipients: {
      signers: [{
        email:  body.customerEmail,
        name:   body.customerName,
        roleName: 'Customer',
        recipientId: '1',
        routingOrder: '1',
        tabs: {
          signHereTabs: signHereTabs.map(t => ({
            ...t,
            documentId:  '1',
            recipientId: '1',
          })),
        },
      }],
    },
  };
  // (Template kept around for backwards compat — not used in this flow.)
  void templateId;

  const apiBase = getDocuSignApiBase();
  const accountId = getDocuSignAccountId();
  const envUrl = `${apiBase}/v2.1/accounts/${accountId}/envelopes`;

  const dsResp = await fetch(envUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelopeDef),
  });
  const dsJson = await dsResp.json();

  if (!dsResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'DocuSign envelope create failed', status: dsResp.status, detail: dsJson }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    envelopeId: dsJson.envelopeId,
    status: dsJson.status,
    sentAt: new Date().toISOString(),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
