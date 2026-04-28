# DocuSign Edge Function — deployment guide

This walks you through installing the Supabase Edge Functions for the Final
Design DocuSign flow. **Run all commands yourself in your terminal** — the
RSA private key never leaves your machine via Claude.

## Prereqs

- Node.js installed (you'll already have this)
- A terminal in the repo root: `cd ~/Documents/htdocs/spartan/spartancrm`
- Your DocuSign RSA private key file (the `.key` or `.pem` you downloaded
  when generating the keypair). Save the path — we'll reference it as
  `/path/to/docusign-private.key` below.

## 1. Install Supabase CLI (one-time)

```bash
brew install supabase/tap/supabase
```

(Or `npm install -g supabase` if you prefer npm.)

Verify:

```bash
supabase --version
```

## 2. Log in + link the project (one-time)

```bash
supabase login
supabase link --project-ref sedpmsgiscowohpqdjza
```

The login opens a browser, you authorise. The link command ties this repo
to the Spartan Supabase project (id `sedpmsgiscowohpqdjza`).

## 3. Set the Edge Function secrets (one-time)

These are the credentials each function reads via `Deno.env.get(...)`.
**Replace the path on the last line with your actual private key path.**

```bash
supabase secrets set \
  DOCUSIGN_INTEGRATION_KEY=129a6d05-9ac7-4ae9-b903-cf8184ce007d \
  DOCUSIGN_USER_ID=be57dfb8-8ea0-4d1d-a934-0d4b6b45f83e \
  DOCUSIGN_ACCOUNT_ID=2314e0f4-6739-4106-8d41-ac82ae040278 \
  DOCUSIGN_BASE_URL=https://demo.docusign.net/restapi \
  DOCUSIGN_AUTH_BASE_URL=https://account-d.docusign.com \
  DOCUSIGN_TEMPLATE_FINAL_DESIGN=7ede9d19-402d-4754-af82-1693528db597

# RSA private key — install separately so the multi-line content is preserved
supabase secrets set DOCUSIGN_PRIVATE_KEY="$(cat /path/to/docusign-private.key)"
```

Verify with:

```bash
supabase secrets list
```

You should see all 7 keys listed (without their values).

## 4. Deploy the functions

```bash
supabase functions deploy docusign-send
supabase functions deploy docusign-webhook
```

Each command takes ~30 seconds. On success you'll see:

```
Deployed Function docusign-send
Deployed Function docusign-webhook
```

## 5. Test the send function (optional smoke test)

From the CRM app, open a job at status "d. Final Sign Off" and click
**📤 Send DocuSign**. Watch the browser console for any errors. If
successful you'll see a green toast "DocuSign sent to <email>" and the
job's Final Design tab will show an envelope status badge.

You can also test the function directly:

```bash
curl -X POST \
  https://sedpmsgiscowohpqdjza.supabase.co/functions/v1/docusign-send \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "test-1",
    "customerName": "Test Customer",
    "customerEmail": "your-email@example.com",
    "pdfBase64": "<base64-pdf>",
    "flags": {}
  }'
```

(Replace `YOUR_SUPABASE_ANON_KEY` with the publishable key from `index.html`.)

## 6. Configure DocuSign Connect webhook (one-time)

In DocuSign Admin (developer sandbox):

1. **Settings → Integrations → Connect**
2. **Add Configuration → Custom**
3. Fill in:

| Field | Value |
|---|---|
| Name | `Spartan Jobs CRM` |
| URL to publish | `https://sedpmsgiscowohpqdjza.supabase.co/functions/v1/docusign-webhook` |
| Sign Message Body using HMAC | **Yes** — generate or paste a secret string |
| Format | JSON |
| Send messages for: | Envelope Sent, Envelope Delivered, Envelope Completed, Envelope Declined, Envelope Voided |
| Include Documents | Yes |
| Include Certificate of Completion | Yes |
| Include Time Zone Information | Yes |

4. Save.

5. Copy the HMAC secret you generated and install it as a Supabase secret:

```bash
supabase secrets set DOCUSIGN_HMAC_SECRET=<the-secret-string>
```

(If you skip this step, the webhook still works but signature verification is
disabled — fine for sandbox testing, **must** be set for production.)

## 7. Optional — add jobs columns for envelope tracking

The webhook updates `jobs.docusign_envelope_id`, `docusign_status`,
`docusign_completed_at`, `docusign_declined_at`. If those columns don't yet
exist, run this SQL in the Supabase SQL editor:

```sql
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS docusign_envelope_id   TEXT,
  ADD COLUMN IF NOT EXISTS docusign_status        TEXT,
  ADD COLUMN IF NOT EXISTS docusign_completed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS docusign_declined_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_docusign_envelope_id
  ON jobs (docusign_envelope_id);
```

Until then, envelope→job mapping is held in the browser's localStorage
(`spartan_docusign_envelopes`). The webhook will log "No job found for
envelope" and 200 the request — fine for testing, but signed PDFs won't be
auto-attached to jobs until the columns + index exist.

## 8. Move to production (later)

When you're ready to go live:

1. Promote your DocuSign integration from Development → Production in
   DocuSign Admin (the "Promote to production" button in Apps and Keys).
2. Get a new Account ID + User ID + RSA keypair for production
3. Update Supabase secrets:
   ```bash
   supabase secrets set \
     DOCUSIGN_BASE_URL=https://www.docusign.net/restapi \
     DOCUSIGN_AUTH_BASE_URL=https://account.docusign.com \
     DOCUSIGN_INTEGRATION_KEY=<prod-integration-key> \
     DOCUSIGN_USER_ID=<prod-user-id> \
     DOCUSIGN_ACCOUNT_ID=<prod-account-id> \
     DOCUSIGN_TEMPLATE_FINAL_DESIGN=<prod-template-id>
   supabase secrets set DOCUSIGN_PRIVATE_KEY="$(cat /path/to/docusign-prod-private.key)"
   ```
4. Update DocuSign Connect's webhook URL to point at the same Supabase
   function (URL doesn't change).
5. Redeploy the functions: `supabase functions deploy docusign-send && supabase functions deploy docusign-webhook`

## Troubleshooting

**"DocuSign auth failed: consent_required"**
The API user hasn't granted impersonation consent. Open this URL once in a
browser, log in as the API user, click Accept:
```
https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=129a6d05-9ac7-4ae9-b903-cf8184ce007d&redirect_uri=https%3A%2F%2Fwww.docusign.com
```

**"DocuSign envelope create failed: 401"**
JWT signing or token exchange failed. Common causes: wrong RSA private key
(verify the keypair was the one tied to the integration), wrong
`DOCUSIGN_USER_ID`, expired consent.

**Customer doesn't receive the email**
Check sandbox-account email throttling in DocuSign Admin → Settings →
Email. Sandbox accounts have a 100/day envelope cap and email may be
delayed.

**Anchor strings not finding signature positions**
The CAD-generated PDF must include the anchor strings. Today the CRM
client (`modules/29-docusign.js → buildFinalDesignPdfBase64`) produces a
basic PDF with anchors. Once Phoenix's CAD generates a richer Final Design
PDF (with the same anchor convention), swap to forwarding the CAD PDF
directly without regeneration.
