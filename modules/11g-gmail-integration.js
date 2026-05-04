// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/11g-gmail-integration.js
// Extracted from 11-email-page.js on 2026-05-02 as part of monolith breakup.
// ═════════════════════════════════════════════════════════════════════════════


// ── EVENT ACTIONS (data-action / defineAction) ────────────────────────────────
defineAction('gmail-composer-bg-close', function(target, ev) {
  if (ev.target === target) {
    gmailComposerOpen = false;
    setState({});
  }
});

defineAction('gmail-composer-close', function(target, ev) {
  gmailComposerOpen = false;
  setState({});
});

defineAction('gmail-composer-input-field', function(target, ev) {
  var field = target.dataset.field;
  if (field) gmailComposerData[field] = target.value;
});

defineAction('gmail-composer-send', function(target, ev) {
  gmailSendFromComposer();
});

defineAction('gmail-attach-file', function(target, ev) {
  var fileInput = document.getElementById('gc_attach');
  if (fileInput) fileInput.click();
});

defineAction('gmail-refresh-threads', function(target, ev) {
  var email = target.dataset.contactEmail;
  if (email) gmailFetchThreads(email, '', 'contact');
});

defineAction('gmail-connect', function(target, ev) {
  gmailConnect();
});

defineAction('gmail-search-threads', function(target, ev) {
  var email = target.dataset.contactEmail;
  if (email) gmailFetchThreads(email, '', 'contact');
});


// ── Composer modal ────────────────────────────────────────────────────────────
function openGmailComposer(to, entityId, entityType, subject) {
  gmailComposerOpen = true;
  gmailComposerData = { to: to||'', subject: subject||'', body: '', cc: '', bcc: '', entityId, entityType };
  renderPage();
}


function renderGmailComposer() {
  const d = gmailComposerData;
  const { gmailUser } = getState();
  return `
  <div class="modal-bg" data-action="gmail-composer-bg-close">
    <div class="modal" style="max-width:620px;width:95vw">
      <!-- Composer header -->
      <div style="background:#1a1a1a;padding:14px 20px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:10px">
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
          <span style="color:#fff;font-size:14px;font-weight:600;font-family:Syne,sans-serif">New Email</span>
          ${gmailUser?`<span style="font-size:12px;color:#9ca3af">from ${gmailUser.email}</span>`:''}
        </div>
        <button data-action="gmail-composer-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:20px;line-height:1">×</button>
      </div>

      <!-- Fields -->
      <div style="padding:0">
        ${[['To','to','email'],['Cc','cc','email'],['Subject','subject','text']].map(([label,field,type])=>`
          <div style="display:flex;align-items:center;border-bottom:1px solid #f0f0f0;padding:0 20px">
            <span style="font-size:12px;color:#9ca3af;width:60px;flex-shrink:0;font-weight:500">${label}</span>
            <input id="gc_${field}" type="${type}" value="${d[field]||''}" data-on-input="gmail-composer-input-field" data-field="${field}"
              style="flex:1;border:none;outline:none;font-size:13px;font-family:inherit;padding:12px 0;background:transparent;color:#1a1a1a">
          </div>`).join('')}

        <!-- Body -->
        <div style="padding:4px 20px 0">
          <textarea id="gc_body" rows="12" data-on-input="gmail-composer-input-field" data-field="body"
            placeholder="Write your email here…"
            style="width:100%;border:none;outline:none;font-size:14px;font-family:inherit;resize:none;line-height:1.7;color:#1a1a1a;background:transparent;padding:16px 0">${d.body||''}</textarea>
        </div>

        <!-- Signature preview -->
        <div style="padding:0 20px 10px;border-top:1px solid #f9fafb;margin-top:4px">
          <div style="font-size:12px;color:#9ca3af;line-height:1.6;padding-top:10px">--<br>
            ${gmailUser?`<strong style="color:#374151">${gmailUser.name}</strong><br>Spartan Double Glazing<br>${gmailUser.email}`:'Spartan Double Glazing'}
          </div>
        </div>
      </div>

      <!-- Footer toolbar -->
      <div style="padding:12px 20px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-r" data-action="gmail-composer-send" style="font-size:13px;padding:8px 20px;gap:8px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            Send
          </button>
          <button data-action="gmail-composer-close" class="btn-w" style="font-size:13px">Discard</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;cursor:pointer">
            <input type="file" id="gc_attach" multiple style="display:none">
            <button data-action="gmail-attach-file" class="btn-g" style="font-size:12px;padding:5px 10px">📎 Attach</button>
          </label>
        </div>
      </div>
    </div>
  </div>`;
}


function gmailSendFromComposer() {
  // Read current values from DOM inputs
  const to      = document.getElementById('gc_to')?.value.trim()      || gmailComposerData.to;
  const cc      = document.getElementById('gc_cc')?.value.trim()      || gmailComposerData.cc;
  const subject = document.getElementById('gc_subject')?.value.trim() || gmailComposerData.subject;
  const body    = document.getElementById('gc_body')?.value.trim()    || gmailComposerData.body;
  if (!to)      { addToast('Enter a recipient', 'error'); return; }
  if (!subject && !body) { addToast('Add a subject or body', 'error'); return; }
  gmailSend(to, subject, body, cc, gmailComposerData.entityId, gmailComposerData.entityType);
}


// ── Inbox / threads panel ─────────────────────────────────────────────────────
function renderGmailInbox(contactEmail) {
  const { emailThreads, gmailConnected } = getState();
  const threads = emailThreads[contactEmail] || [];

  return `
  <div class="card" style="overflow:hidden;margin-top:14px">
    <div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px">
        <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
        Gmail Threads
        ${threads.length > 0 ? `<span style="font-size:11px;color:#9ca3af">(${threads.length})</span>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        ${gmailConnected && contactEmail ? `<button data-action="gmail-refresh-threads" data-contact-email="${_esc(contactEmail)}" class="btn-g" style="font-size:11px;padding:4px 8px">↻ Refresh</button>` : ''}
      </div>
    </div>
    ${!gmailConnected ? `
      <div style="padding:20px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">📧</div>
        <div style="font-size:13px;font-weight:500;color:#374151;margin-bottom:4px">Connect Gmail to see email history</div>
        <div style="font-size:12px;color:#9ca3af;margin-bottom:14px">All emails with this contact will appear here</div>
        <button data-action="gmail-connect" class="btn-r" style="font-size:12px">
          <svg width="14" height="14" viewBox="0 0 24 24" style="margin-right:4px"><path fill="#fff" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
          Connect Gmail
        </button>
      </div>` :
    threads.length === 0 ? `
      <div style="padding:20px;text-align:center">
        <div style="font-size:13px;color:#9ca3af">No email threads found for ${contactEmail}</div>
        ${contactEmail ? `<button data-action="gmail-search-threads" data-contact-email="${_esc(contactEmail)}" class="btn-w" style="font-size:12px;margin-top:10px">Search Gmail</button>` : ''}
      </div>` :
    `<div>
      ${threads.map((t,i) => `
        <div style="padding:12px 16px;${i<threads.length-1?'border-bottom:1px solid #f9fafb':''}cursor:pointer;transition:background .1s" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="font-size:13px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(t.subject)}</div>
            <div style="font-size:11px;color:#9ca3af;flex-shrink:0">${t.date ? new Date(t.date).toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : ''}</div>
          </div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px">${_escHtml(t.from)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(t.snippet||'')}</div>
        </div>`).join('')}
    </div>`}
  </div>`;
}


function emailFromTabForm(entityId, entityType, defaultTo) {
  const subj = document.getElementById('emailSubj_'+entityId)?.value||'';
  const body = document.getElementById('tabInput_'+entityId)?.value||'';
  const to   = document.getElementById('emailTo_'+entityId)?.value || defaultTo || '';
  if (entityType==='deal') emailFromDeal(entityId);
  else if (entityType==='lead') emailFromLead(entityId);
  else emailFromContact(entityId);
  // Pre-fill subject if already typed
  if (subj) setTimeout(()=>{ const el=document.getElementById('ec_subject'); if(el) el.value=subj; },100);
  if (body) setTimeout(()=>{ const el=document.getElementById('ec_body'); if(el) el.value=body; },100);
}


function emailFromDeal(dealId) {
  const {deals, contacts} = getState();
  const d = deals.find(x=>x.id===dealId);
  if (!d) return;
  const c = contacts.find(x=>x.id===d.cid);
  emailOpenCompose(c?c.email:'', c?c.fn+' '+c.ln:'', '', '', dealId, c?c.id:null, null, null, null);
  setState({page:'email'});
}

function emailFromLead(leadId) {
  const {leads} = getState();
  const l = leads.find(x=>x.id===leadId);
  if (!l) return;
  emailOpenCompose(l.email||'', l.fn+' '+l.ln, '', '', null, null, leadId, null, null);
  setState({page:'email'});
}

function emailFromContact(contactId) {
  const {contacts} = getState();
  const c = contacts.find(x=>x.id===contactId);
  if (!c) return;
  emailOpenCompose(c.email||'', c.fn+' '+c.ln, '', '', null, contactId, null, null, null);
  setState({page:'email'});
}

function emailReplyFromActivity(actId, entityId, entityType) {
  const acts = getEntityActivities(entityId, entityType);
  const act = acts.find(a=>a.id===actId);
  if (!act) return;
  const {deals, contacts, leads} = getState();
  let to='', toName='', cid=null, lid=null, did=null;
  if (entityType==='deal') {
    const d = deals.find(x=>x.id===entityId);
    if (d) { const c=contacts.find(x=>x.id===d.cid); to=c?c.email:''; toName=c?c.fn+' '+c.ln:''; cid=c?c.id:null; did=entityId; }
  } else if (entityType==='lead') {
    const l = leads.find(x=>x.id===entityId);
    if (l) { to=l.email||''; toName=l.fn+' '+l.ln; lid=entityId; }
  } else {
    const c = contacts.find(x=>x.id===entityId);
    if (c) { to=c.email||''; toName=c.fn+' '+c.ln; cid=entityId; }
  }
  emailOpenCompose(to, toName, 'Re: '+(act.subject||''), '', did, cid, lid, null, actId);
  setState({page:'email'});
}
